import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Validator } from "../lib/validation";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";
import { sendEmailInBackground, sendEmail } from "../lib/email/sender";
import { waitlistJoinedEmail, websiteEnquiryNotifyEmail, websiteEnquiryReceivedEmail } from "../lib/email/templates";

// Messages sent from the public website's Contact form. The POST is public
// (rate limited, with a honeypot field); everything else is platform_admin
// only. Not to be confused with Enquiry, which is a parent asking a school.

export const WEBSITE_ENQUIRY_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;
type WebsiteEnquiryStatus = (typeof WEBSITE_ENQUIRY_STATUSES)[number];

const ROLES = ["teacher", "leadership", "admin", "parent"];
const WAITLIST_ROLES: Record<string, string> = { teacher: "Teacher", leadership: "School leader", parent: "Parent / student" };

interface ContactBody {
  name?: string;
  email?: string;
  schoolName?: string;
  role?: string;
  subject?: string;
  message?: string;
  // Honeypot: hidden from people in the form, so only bots fill it in.
  website?: string;
}

interface WaitlistBody {
  email?: string;
  role?: string;
}

interface ListQuery {
  kind?: string;
  status?: string;
  q?: string;
  page?: string;
  pageSize?: string;
}

interface UpdateBody {
  status?: string;
  internalNote?: string | null;
}

function notifyAddresses(): string[] {
  return (process.env.CONTACT_NOTIFY_EMAIL ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export async function websiteEnquiryRoutes(app: FastifyInstance) {
  app.post<{ Body: ContactBody }>(
    "/public/contact",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body ?? {};

      // A bot filled the hidden field. Answer as if it worked so it learns nothing.
      if (typeof body.website === "string" && body.website.trim()) {
        return reply.code(201).send({ data: { received: true }, meta: {} });
      }

      const v = new Validator();
      const name = v.personName("name", body.name, "Your name");
      const email = v.email("email", body.email, true, "Email");
      const schoolName = v.label("schoolName", body.schoolName, "School name", false, 120);
      const subject = v.label("subject", body.subject, "Subject", false, 140);
      const message = v.note("message", body.message, "Message", { required: true, max: 3000 });
      const role = body.role && ROLES.includes(body.role) ? body.role : undefined;
      if (v.hasErrors || !name || !email || !message) return v.reject(reply);

      const enquiry = await prisma.websiteEnquiry.create({
        data: { name, email, schoolName, role, subject, message },
      });

      // Side effects never fail the request: the message is already saved.
      void (async () => {
        try {
          const sent = await sendEmail(email, websiteEnquiryReceivedEmail({ name, subject }));
          if (sent.success) await prisma.websiteEnquiry.update({ where: { id: enquiry.id }, data: { ackSent: true } });
          else console.error(`[website-enquiry] acknowledgement to ${email} failed: ${sent.error}`);
        } catch (err) {
          console.error("[website-enquiry] acknowledgement threw", err);
        }
      })();
      for (const address of notifyAddresses()) {
        sendEmailInBackground(address, websiteEnquiryNotifyEmail({ name, email, schoolName, role, subject, message }));
      }

      return reply.code(201).send({ data: { received: true }, meta: {} });
    }
  );

  // The home page's "Request Priority Access" box: just an email and a role.
  app.post<{ Body: WaitlistBody }>(
    "/public/waitlist",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body ?? {};
      const v = new Validator();
      const email = v.email("email", body.email, true, "Email");
      const roleLabel = body.role ? WAITLIST_ROLES[body.role] : undefined;
      if (!roleLabel) v.fail("role", "Choose who you are");
      if (v.hasErrors || !email || !roleLabel) return v.reject(reply);

      // Joining twice is not an error, but it is not saved or emailed twice either.
      const already = await prisma.websiteEnquiry.findFirst({ where: { kind: "waitlist", email }, select: { id: true } });
      if (already) return reply.code(201).send({ data: { received: true }, meta: {} });

      const enquiry = await prisma.websiteEnquiry.create({
        data: { kind: "waitlist", name: email, email, role: body.role, subject: "Waitlist", message: `Joined the waitlist as a ${roleLabel.toLowerCase()}.` },
      });

      void (async () => {
        try {
          const sent = await sendEmail(email, waitlistJoinedEmail({ roleLabel }));
          if (sent.success) await prisma.websiteEnquiry.update({ where: { id: enquiry.id }, data: { ackSent: true } });
          else console.error(`[website-enquiry] waitlist email to ${email} failed: ${sent.error}`);
        } catch (err) {
          console.error("[website-enquiry] waitlist email threw", err);
        }
      })();
      for (const address of notifyAddresses()) {
        sendEmailInBackground(address, websiteEnquiryNotifyEmail({ name: email, email, role: body.role, subject: "Waitlist", message: enquiry.message }));
      }

      return reply.code(201).send({ data: { received: true }, meta: {} });
    }
  );

  app.get<{ Querystring: ListQuery }>(
    "/website-enquiries",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 25));
      const status = request.query.status as WebsiteEnquiryStatus | undefined;
      const q = request.query.q?.trim();

      const where: Prisma.WebsiteEnquiryWhereInput = {
        ...(request.query.kind === "contact" || request.query.kind === "waitlist" ? { kind: request.query.kind } : {}),
        ...(status && WEBSITE_ENQUIRY_STATUSES.includes(status) ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { schoolName: { contains: q, mode: "insensitive" } },
                { subject: { contains: q, mode: "insensitive" } },
                { message: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [items, totalCount, grouped] = await Promise.all([
        prisma.websiteEnquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.websiteEnquiry.count({ where }),
        prisma.websiteEnquiry.groupBy({ by: ["status"], _count: { _all: true } }),
      ]);

      const counts: Record<string, number> = { new: 0, in_progress: 0, resolved: 0, spam: 0 };
      for (const row of grouped) counts[row.status] = row._count._all;

      return { data: items, meta: { page, pageSize, totalCount, counts } };
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateBody }>(
    "/website-enquiries/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const existing = await prisma.websiteEnquiry.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });

      const body = request.body ?? {};
      const v = new Validator();
      let status: WebsiteEnquiryStatus | undefined;
      if (body.status !== undefined) {
        if (!WEBSITE_ENQUIRY_STATUSES.includes(body.status as WebsiteEnquiryStatus)) v.fail("status", `Status must be one of ${WEBSITE_ENQUIRY_STATUSES.join(", ")}`);
        else status = body.status as WebsiteEnquiryStatus;
      }
      // null or empty clears the note.
      const note = body.internalNote === undefined ? undefined : v.note("internalNote", body.internalNote, "Note", { max: 2000 }) ?? null;
      if (v.hasErrors) return v.reject(reply);

      const updated = await prisma.websiteEnquiry.update({
        where: { id: existing.id },
        data: {
          ...(status ? { status } : {}),
          ...(note !== undefined ? { internalNote: note } : {}),
          handledByUserId: request.user.sub,
          handledAt: new Date(),
        },
      });

      if (status && status !== existing.status) {
        const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
        await recordAuditEvent({
          actorUserId: request.user.sub,
          actorEmail: actor?.email ?? "unknown",
          action: "website_enquiry.status_changed",
          targetType: "website_enquiry",
          targetId: existing.id,
          targetLabel: `${existing.name} <${existing.email}>`,
          metadata: { from: existing.status, to: status },
        });
      }

      return { data: updated, meta: {} };
    }
  );
}
