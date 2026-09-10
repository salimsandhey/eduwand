import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

// Teacher-facing balance/history view + admin-manual top-up. No payment
// gateway in this phase - top-ups are an admin action only. See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

interface TopUpBody {
  amount: number;
  note?: string;
}

async function loadAccount(teacherUserId: string) {
  const [account, ledgerEntries] = await Promise.all([
    prisma.teacherCreditAccount.findUnique({ where: { teacherUserId } }),
    prisma.creditLedgerEntry.findMany({ where: { teacherUserId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { balance: account?.balance ?? 0, ledgerEntries };
}

// A caller can act on a given teacher for admin purposes if: platform_admin
// (any teacher), leadership (same trust as the teacher), or admin (same
// school as the teacher) - mirrors the authorization shape used throughout
// users.ts/academic-structure.ts.
async function authorizeForTeacher(request: FastifyRequest, reply: FastifyReply, teacherUserId: string): Promise<boolean> {
  const caller = request.user;
  if (caller.role === PLATFORM_ADMIN_ROLE) return true;

  const teacher = await prisma.appUser.findUnique({ where: { id: teacherUserId }, select: { schoolId: true, trustId: true } });
  if (!teacher) {
    reply.code(404).send({ data: null, error: { code: "not_found", message: "Teacher not found" } });
    return false;
  }

  if (caller.role === "leadership" && caller.trustId === teacher.trustId) return true;
  if (caller.role === "admin" && caller.schoolId === teacher.schoolId) return true;

  reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this teacher" } });
  return false;
}

export async function teacherCreditRoutes(app: FastifyInstance) {
  app.get(
    "/me/credits",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== "teacher") {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Requires role: teacher" } });
      }
      return { data: await loadAccount(request.user.sub), meta: {} };
    }
  );

  app.get<{ Params: { teacherUserId: string } }>(
    "/teachers/:teacherUserId/credits",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForTeacher(request, reply, request.params.teacherUserId))) return;
      return { data: await loadAccount(request.params.teacherUserId), meta: {} };
    }
  );

  app.post<{ Params: { teacherUserId: string }; Body: TopUpBody }>(
    "/teachers/:teacherUserId/credit-topup",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!(await authorizeForTeacher(request, reply, request.params.teacherUserId))) return;

      const amount = request.body?.amount;
      if (!amount || !Number.isFinite(amount) || amount <= 0) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "amount must be a positive number" } });
      }

      const { teacherUserId } = request.params;
      const note = request.body?.note?.trim() || undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const account = await tx.teacherCreditAccount.upsert({
          where: { teacherUserId },
          update: {},
          create: { teacherUserId, balance: 0 },
        });
        const balanceAfter = account.balance + amount;

        await tx.teacherCreditAccount.update({ where: { teacherUserId }, data: { balance: balanceAfter } });
        await tx.creditLedgerEntry.create({
          data: {
            teacherUserId,
            delta: amount,
            reason: "admin_topup",
            balanceAfter,
            note,
            createdByUserId: request.user.sub,
          },
        });

        return balanceAfter;
      });

      return reply.code(201).send({ data: { balance: updated }, meta: {} });
    }
  );
}
