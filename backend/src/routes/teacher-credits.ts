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

const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_WINDOW_DAYS = 30;
const DAILY_CHART_DAYS = 14;

// Usage stats are computed here over the full ledger, not from the 50 most
// recent entries the app lists - a busy teacher's last 50 rows can cover
// only a few days. Days are bucketed in the school's timezone so "today" on
// the chart matches the teacher's wall clock, not the server's.
async function loadAccount(teacherUserId: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS);

  const [account, ledgerRows, granted, spent, recentUsage, teacher, features] = await Promise.all([
    prisma.teacherCreditAccount.findUnique({ where: { teacherUserId } }),
    prisma.creditLedgerEntry.findMany({ where: { teacherUserId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.creditLedgerEntry.aggregate({ where: { teacherUserId, delta: { gt: 0 } }, _sum: { delta: true } }),
    prisma.creditLedgerEntry.aggregate({ where: { teacherUserId, reason: "ai_usage" }, _sum: { delta: true } }),
    prisma.creditLedgerEntry.findMany({
      where: { teacherUserId, reason: "ai_usage", createdAt: { gte: windowStart } },
      select: { delta: true, note: true, createdAt: true },
    }),
    prisma.appUser.findUnique({ where: { id: teacherUserId }, select: { school: { select: { timezone: true } } } }),
    prisma.aiFeature.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  // Who granted each top-up - CreditLedgerEntry.createdByUserId has no
  // relation, so resolved in one extra lookup for just the listed rows.
  const granterIds = [...new Set(ledgerRows.map((e) => e.createdByUserId).filter((id): id is string => !!id))];
  const granters = granterIds.length
    ? await prisma.appUser.findMany({ where: { id: { in: granterIds } }, select: { id: true, fullName: true } })
    : [];
  const granterName = new Map(granters.map((g) => [g.id, g.fullName]));
  const ledgerEntries = ledgerRows.map((entry) => ({
    ...entry,
    createdByName: entry.createdByUserId ? granterName.get(entry.createdByUserId) ?? null : null,
  }));

  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: teacher?.school?.timezone ?? "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayKey = (date: Date) => dayFormatter.format(date);

  const daily = new Map<string, number>();
  for (let i = DAILY_CHART_DAYS - 1; i >= 0; i--) {
    daily.set(dayKey(new Date(now.getTime() - i * DAY_MS)), 0);
  }

  const byFeature = new Map<string, { credits: number; count: number }>();
  let spentLast30Days = 0;
  for (const entry of recentUsage) {
    const credits = -entry.delta;
    spentLast30Days += credits;

    const feature = entry.note ?? "other";
    const bucket = byFeature.get(feature) ?? { credits: 0, count: 0 };
    bucket.credits += credits;
    bucket.count += 1;
    byFeature.set(feature, bucket);

    const key = dayKey(entry.createdAt);
    if (daily.has(key)) daily.set(key, daily.get(key)! + credits);
  }

  // Averaged over the account's actual age when it's younger than the
  // window - a teacher who signed up 3 days ago and spent 120 is burning
  // 40/day, not 4/day.
  const accountAgeDays = account ? Math.ceil((now.getTime() - account.createdAt.getTime()) / DAY_MS) : USAGE_WINDOW_DAYS;
  const averagingDays = Math.min(USAGE_WINDOW_DAYS, Math.max(1, accountAgeDays));

  // The teacher's own most-used features first (30-day count), then the
  // admin-set order - so "Your balance covers" leads with what they actually do.
  const usageCount = (key: string) => byFeature.get(key)?.count ?? 0;
  const orderedFeatures = features
    .map((f, index) => ({ f, index }))
    .sort((a, b) => usageCount(b.f.key) - usageCount(a.f.key) || a.index - b.index)
    .map(({ f }) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      icon: f.icon,
      cost: f.cost,
      showOnCredits: f.showOnCredits,
    }));

  return {
    balance: account?.balance ?? 0,
    ledgerEntries,
    features: orderedFeatures,
    stats: {
      totalGranted: granted._sum.delta ?? 0,
      totalSpent: -(spent._sum.delta ?? 0),
      spentLast30Days,
      averageDailySpend: Math.round((spentLast30Days / averagingDays) * 10) / 10,
      byFeature: [...byFeature.entries()]
        .map(([feature, bucket]) => ({ feature, ...bucket }))
        .sort((a, b) => b.credits - a.credits),
      daily: [...daily.entries()].map(([date, credits]) => ({ date, credits })),
    },
  };
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
