import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { BOARDS, isValidBoard } from "../lib/boards";

// School.board is a request/approval-only setting for every school - see the
// PATCH /schools/:id guard in schools.ts and Docs/superpowers/plans/2026-09-
// 09-individual-teacher-onboarding-and-credits.md. Same shape as
// subject-change-requests.ts: raised by the account holder (a teacher for an
// individual school, admin/leadership for an institutional one), decided by
// platform_admin. Approval applies requestedBoard directly to School.board.


interface CreateBoardChangeTicketBody {
  requestedBoard: string;
  note?: string;
}

interface DecideBoardChangeTicketBody {
  decision: "approved" | "rejected";
  note?: string;
}

export async function boardChangeTicketRoutes(app: FastifyInstance) {
  app.post<{ Params: { schoolId: string }; Body: CreateBoardChangeTicketBody }>(
    "/schools/:schoolId/board-change-tickets",
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

      const body = request.body ?? ({} as CreateBoardChangeTicketBody);
      const requestedBoard = body.requestedBoard?.trim();
      if (!isValidBoard(requestedBoard)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `requestedBoard must be one of ${BOARDS.join(", ")}` },
        });
      }
      if (requestedBoard === school.board) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "requestedBoard is the same as the current board" },
        });
      }

      const pending = await prisma.boardChangeTicket.findFirst({ where: { schoolId, status: "pending" } });
      if (pending) {
        return reply.code(400).send({
          data: null,
          error: { code: "ticket_already_pending", message: "This school already has a pending board change ticket" },
        });
      }

      const created = await prisma.boardChangeTicket.create({
        data: {
          schoolId,
          currentBoard: school.board,
          requestedBoard,
          raisedByUserId: caller.sub,
          note: body.note?.trim() || undefined,
        },
      });

      return reply.code(201).send({ data: created, meta: {} });
    }
  );

  app.get(
    "/admin/board-change-tickets",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const status = (request.query as { status?: string })?.status;
      const tickets = await prisma.boardChangeTicket.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        include: { school: { select: { name: true, accountType: true } }, raisedBy: { select: { fullName: true, email: true } } },
      });
      return { data: tickets, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: DecideBoardChangeTicketBody }>(
    "/admin/board-change-tickets/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as DecideBoardChangeTicketBody);
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "decision must be approved or rejected" },
        });
      }

      const existing = await prisma.boardChangeTicket.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Board change ticket not found" } });
      }
      if (existing.status !== "pending") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "This ticket has already been decided" },
        });
      }

      const decided = await prisma.$transaction(async (tx) => {
        if (body.decision === "approved") {
          await tx.school.update({ where: { id: existing.schoolId }, data: { board: existing.requestedBoard } });
        }

        return tx.boardChangeTicket.update({
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
