import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { Validator } from "../lib/validation";

// School.name (the "workspace name" a teacher sees throughout the app, and
// on branded PDFs/emails/reports) is a request/approval-only setting, same
// shape and reasoning as board-change-tickets.ts: raised by the account
// holder (a teacher for an individual school, admin/leadership for an
// institutional one), decided by platform_admin. Approval applies
// requestedName directly to School.name.

interface CreateSchoolNameChangeTicketBody {
  requestedName: string;
  note?: string;
}

interface DecideSchoolNameChangeTicketBody {
  decision: "approved" | "rejected";
  note?: string;
}

export async function schoolNameChangeTicketRoutes(app: FastifyInstance) {
  app.post<{ Params: { schoolId: string }; Body: CreateSchoolNameChangeTicketBody }>(
    "/schools/:schoolId/name-change-tickets",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const caller = request.user;
      const { schoolId } = request.params;

      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      if (!school) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
      }

      const allowed =
        caller.role === PLATFORM_ADMIN_ROLE ||
        (caller.role === "leadership" && caller.trustId === school.trustId) ||
        (caller.role === "admin" && caller.schoolId === school.id) ||
        (caller.role === "teacher" && caller.schoolId === school.id && school.accountType === "individual");
      if (!allowed) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this school" } });
      }

      const body = request.body ?? ({} as CreateSchoolNameChangeTicketBody);
      const nv = new Validator();
      const requestedName = nv.label("requestedName", body.requestedName, "New school name", true, 120);
      const requestNote = nv.note("note", body.note, "Reason", { max: 500 });
      if (nv.hasErrors || !requestedName) return nv.reject(reply);
      if (requestedName === school.name) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "requestedName is the same as the current name" },
        });
      }

      const pending = await prisma.schoolNameChangeTicket.findFirst({ where: { schoolId, status: "pending" } });
      if (pending) {
        return reply.code(400).send({
          data: null,
          error: { code: "ticket_already_pending", message: "This school already has a pending name change ticket" },
        });
      }

      const created = await prisma.schoolNameChangeTicket.create({
        data: {
          schoolId,
          currentName: school.name,
          requestedName,
          raisedByUserId: caller.sub,
          note: requestNote,
        },
      });

      return reply.code(201).send({ data: created, meta: {} });
    }
  );

  app.get(
    "/admin/name-change-tickets",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const status = (request.query as { status?: string })?.status;
      const tickets = await prisma.schoolNameChangeTicket.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        include: { school: { select: { name: true, accountType: true } }, raisedBy: { select: { fullName: true, email: true } } },
      });
      return { data: tickets, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: DecideSchoolNameChangeTicketBody }>(
    "/admin/name-change-tickets/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as DecideSchoolNameChangeTicketBody);
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "decision must be approved or rejected" },
        });
      }

      const existing = await prisma.schoolNameChangeTicket.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Name change ticket not found" } });
      }
      if (existing.status !== "pending") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "This ticket has already been decided" },
        });
      }

      const decided = await prisma.$transaction(async (tx) => {
        if (body.decision === "approved") {
          await tx.school.update({ where: { id: existing.schoolId }, data: { name: existing.requestedName } });
        }

        return tx.schoolNameChangeTicket.update({
          where: { id: existing.id },
          data: {
            status: body.decision,
            decidedAt: new Date(),
            decidedByUserId: request.user.sub,
            note: body.note?.trim() || existing.note,
          },
        });
      });

      return { data: decided, meta: {} };
    }
  );
}
