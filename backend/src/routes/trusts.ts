import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";
import { Validator } from "../lib/validation";

// An explicitly empty string clears an optional text column; otherwise the
// validated value (or undefined = leave untouched).
const orBlank = <T>(raw: unknown, value: T | undefined): T | "" | undefined => (raw === "" ? "" : value);

interface CreateTrustBody {
  name: string;
  legalName?: string;
  contactEmail?: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  registeredAddress?: string;
  gstNumber?: string;
  trustType?: string;
  expectedSchoolCount?: number;
}

interface UpdateTrustBody {
  name?: string;
  legalName?: string;
  contactEmail?: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  registeredAddress?: string;
  gstNumber?: string;
  trustType?: string;
  expectedSchoolCount?: number;
  status?: string;
  // null clears the assignment (grandfathered as unlimited teacher seats -
  // see Plan.teacherSeatLimit). See Docs/superpowers/plans/2026-09-09-
  // individual-teacher-onboarding-and-credits.md.
  planId?: string | null;
}

const TRUST_STATUSES = ["active", "suspended"];

export async function trustRoutes(app: FastifyInstance) {
  app.get(
    "/trusts",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async () => {
      const trusts = await prisma.trust.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      });
      return { data: trusts, meta: {} };
    }
  );

  app.post<{ Body: CreateTrustBody }>(
    "/trusts",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateTrustBody);

      const v = new Validator();
      const name = v.label("name", body.name, "Trust name", true, 120);
      const legalName = v.label("legalName", body.legalName, "Legal name", false, 160);
      const contactEmail = v.email("contactEmail", body.contactEmail, false, "Contact email");
      const contactPersonName = v.personName("contactPersonName", body.contactPersonName, "Contact person name", false);
      const contactPersonPhone = v.phone("contactPersonPhone", body.contactPersonPhone, false, "Contact person phone number");
      const registeredAddress = v.note("registeredAddress", body.registeredAddress, "Registered address", { max: 300 });
      const gstNumber = v.gstin("gstNumber", body.gstNumber);
      const trustType = v.label("trustType", body.trustType, "Trust type", false, 60);
      const expectedSchoolCount = v.number("expectedSchoolCount", body.expectedSchoolCount, "Expected school count", { integer: true, min: 0, max: 10000 });
      if (v.hasErrors || !name) return v.reject(reply);

      const duplicate = await prisma.trust.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (duplicate) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `A trust named "${duplicate.name}" already exists` },
        });
      }

      const trust = await prisma.trust.create({
        data: {
          name,
          legalName,
          contactEmail,
          contactPersonName,
          contactPersonPhone,
          registeredAddress,
          gstNumber,
          trustType,
          expectedSchoolCount,
          status: "active",
        },
      });

      return reply.code(201).send({ data: trust, meta: {} });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/trusts/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const caller = request.user;
      if (caller.role !== PLATFORM_ADMIN_ROLE && !(caller.role === "leadership" && caller.trustId === request.params.id)) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized to view this trust" } });
      }

      const trust = await prisma.trust.findUnique({
        where: { id: request.params.id },
        include: {
          schools: { select: { id: true, name: true, board: true, status: true }, orderBy: { name: "asc" } },
          plan: true,
        },
      });
      if (!trust) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }
      return { data: trust, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateTrustBody }>(
    "/trusts/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdateTrustBody);

      const v = new Validator();
      const name = body.name !== undefined ? v.label("name", body.name, "Trust name", true, 120) : undefined;
      const legalName = body.legalName !== undefined ? v.label("legalName", body.legalName, "Legal name", false, 160) : undefined;
      const contactEmail = body.contactEmail !== undefined ? v.email("contactEmail", body.contactEmail, false, "Contact email") : undefined;
      const contactPersonName = body.contactPersonName !== undefined ? v.personName("contactPersonName", body.contactPersonName, "Contact person name", false) : undefined;
      const contactPersonPhone = body.contactPersonPhone !== undefined ? v.phone("contactPersonPhone", body.contactPersonPhone, false, "Contact person phone number") : undefined;
      const registeredAddress = body.registeredAddress !== undefined ? v.note("registeredAddress", body.registeredAddress, "Registered address", { max: 300 }) : undefined;
      const gstNumber = body.gstNumber !== undefined ? v.gstin("gstNumber", body.gstNumber) : undefined;
      const trustType = body.trustType !== undefined ? v.label("trustType", body.trustType, "Trust type", false, 60) : undefined;
      const expectedSchoolCount = v.number("expectedSchoolCount", body.expectedSchoolCount, "Expected school count", { integer: true, min: 0, max: 10000 });
      if (body.status && !TRUST_STATUSES.includes(body.status)) v.fail("status", `Status must be one of ${TRUST_STATUSES.join(", ")}`);
      if (v.hasErrors) return v.reject(reply);

      const existing = await prisma.trust.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }

      if (body.planId) {
        const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
        if (!plan) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Plan not found" } });
        }
      }

      if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
        const duplicate = await prisma.trust.findFirst({
          where: { name: { equals: name, mode: "insensitive" }, id: { not: existing.id } },
        });
        if (duplicate) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `A trust named "${duplicate.name}" already exists` },
          });
        }
      }

      const trust = await prisma.trust.update({
        where: { id: request.params.id },
        data: {
          name,
          legalName: orBlank(body.legalName, legalName),
          contactEmail: orBlank(body.contactEmail, contactEmail),
          contactPersonName: orBlank(body.contactPersonName, contactPersonName),
          contactPersonPhone: orBlank(body.contactPersonPhone, contactPersonPhone),
          registeredAddress: orBlank(body.registeredAddress, registeredAddress),
          gstNumber: orBlank(body.gstNumber, gstNumber),
          trustType: orBlank(body.trustType, trustType),
          expectedSchoolCount,
          status: body.status ?? undefined,
          planId: body.planId !== undefined ? body.planId : undefined,
        },
      });

      if (body.status && body.status !== existing.status) {
        const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
        await recordAuditEvent({
          actorUserId: request.user.sub,
          actorEmail: actor?.email ?? "unknown",
          action: "trust.status_change",
          targetType: "Trust",
          targetId: trust.id,
          targetLabel: trust.name,
          trustId: trust.id,
          metadata: { from: existing.status, to: trust.status },
        });
      }

      return { data: trust, meta: {} };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/trusts/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const existing = await prisma.trust.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { schools: true } } },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }
      if (existing._count.schools > 0) {
        return reply.code(409).send({
          data: null,
          error: {
            code: "has_dependents",
            message: `This trust still has ${existing._count.schools} school(s). Delete or move them first.`,
          },
        });
      }

      await prisma.trust.delete({ where: { id: request.params.id } });

      const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: request.user.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "trust.delete",
        targetType: "Trust",
        targetId: existing.id,
        targetLabel: existing.name,
      });

      return { data: { deleted: true }, meta: {} };
    }
  );
}
