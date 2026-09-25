import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { activatePlan, extendSubscription, getEntitlement } from "../lib/subscriptions";

// Platform-admin controls for the individual-teacher trial and paid plan
// (see Docs/superpowers/plans/2026-09-25-trial-plans-and-purchase.md): edit
// the plans, see every teacher's subscription, extend or activate by hand.

const validationError = (message: string) => ({ data: null, error: { code: "validation_error", message } });

interface UpdatePlanBody {
  name?: string;
  priceInr?: number;
  durationDays?: number;
  credits?: number;
  enabled?: boolean;
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export async function billingPlanRoutes(app: FastifyInstance) {
  const guard = { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] };

  app.get("/billing-plans", guard, async () => {
    const plans = await prisma.billingPlan.findMany({ orderBy: { sortOrder: "asc" } });
    return { data: plans, meta: {} };
  });

  app.patch<{ Params: { key: string }; Body: UpdatePlanBody }>("/billing-plans/:key", guard, async (request, reply) => {
    const existing = await prisma.billingPlan.findUnique({ where: { key: request.params.key } });
    if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Plan not found" } });

    const body = request.body ?? {};
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) return reply.code(400).send(validationError("name cannot be empty"));
    if (body.priceInr !== undefined && !isWhole(body.priceInr, existing.kind === "trial" ? 0 : 1, 1_000_000)) {
      return reply.code(400).send(validationError("priceInr must be a whole number of rupees"));
    }
    if (body.durationDays !== undefined && !isWhole(body.durationDays, 1, 3650)) return reply.code(400).send(validationError("durationDays must be between 1 and 3650"));
    if (body.credits !== undefined && !isWhole(body.credits, 0, 10_000_000)) return reply.code(400).send(validationError("credits must be a whole number"));
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return reply.code(400).send(validationError("enabled must be true or false"));

    const plan = await prisma.billingPlan.update({
      where: { id: existing.id },
      data: {
        name: body.name?.trim(),
        // The trial is always free.
        priceInr: existing.kind === "trial" ? 0 : body.priceInr,
        durationDays: body.durationDays,
        credits: body.credits,
        enabled: body.enabled,
        updatedBy: request.user.sub,
      },
    });
    return { data: plan, meta: {} };
  });

  // One row per individual teacher (their latest period), with the live status.
  app.get<{ Querystring: { status?: string; q?: string; page?: string } }>("/subscriptions", guard, async (request) => {
    const { status, q } = request.query;
    const page = Math.max(1, Math.floor(Number(request.query.page ?? 1)) || 1);
    const pageSize = 25;
    const now = new Date();

    const latest = await prisma.teacherSubscription.findMany({
      where: { status: "active" },
      orderBy: [{ teacherUserId: "asc" }, { endsAt: "desc" }],
      distinct: ["teacherUserId"],
      take: 1000,
    });

    const userIds = latest.map((s) => s.teacherUserId);
    const [users, accounts] = await Promise.all([
      prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true, createdAt: true } }),
      prisma.teacherCreditAccount.findMany({ where: { teacherUserId: { in: userIds } }, select: { teacherUserId: true, balance: true } }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const balanceById = new Map(accounts.map((a) => [a.teacherUserId, a.balance]));

    const search = q?.trim().toLowerCase();
    const rows = latest
      .map((s) => {
        const live = s.endsAt > now;
        const user = userById.get(s.teacherUserId);
        return {
          userId: s.teacherUserId,
          name: user?.fullName ?? "Unknown user",
          email: user?.email ?? null,
          planKey: s.planKey,
          planName: s.planName,
          status: live ? (s.kind === "trial" ? "trial" : "active") : "expired",
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          daysLeft: live ? Math.max(1, Math.ceil((s.endsAt.getTime() - now.getTime()) / 86_400_000)) : 0,
          source: s.source,
          balance: balanceById.get(s.teacherUserId) ?? 0,
          note: s.note,
        };
      })
      .filter((r) => (status ? r.status === status : true))
      .filter((r) => (search ? `${r.name} ${r.email ?? ""}`.toLowerCase().includes(search) : true))
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());

    const counts = { trial: 0, active: 0, expired: 0 };
    for (const s of latest) {
      const live = s.endsAt > now;
      counts[live ? (s.kind === "trial" ? "trial" : "active") : "expired"]++;
    }

    return {
      data: { total: rows.length, page, pageSize, counts, rows: rows.slice((page - 1) * pageSize, page * pageSize) },
      meta: {},
    };
  });

  app.post<{ Params: { userId: string }; Body: { days?: number; note?: string } }>("/subscriptions/:userId/extend", guard, async (request, reply) => {
    const days = request.body?.days;
    if (!isWhole(days, 1, 365)) return reply.code(400).send(validationError("days must be a whole number between 1 and 365"));

    const updated = await prisma.$transaction((tx) => extendSubscription(tx, request.params.userId, days, request.user.sub, request.body?.note?.trim() || undefined));
    if (!updated) return reply.code(404).send({ data: null, error: { code: "not_found", message: "This teacher has no subscription to extend" } });
    return { data: { endsAt: updated.endsAt }, meta: {} };
  });

  // Puts a teacher on a plan by hand (e.g. a payment taken offline). Same
  // effect as a purchase: a new period starts and credits are set.
  app.post<{ Params: { userId: string }; Body: { planKey?: string; note?: string } }>("/subscriptions/:userId/activate", guard, async (request, reply) => {
    const plan = request.body?.planKey ? await prisma.billingPlan.findUnique({ where: { key: request.body.planKey } }) : null;
    if (!plan) return reply.code(400).send(validationError("planKey must be an existing plan"));

    const entitlement = await getEntitlement(request.params.userId);
    if (entitlement.status === "not_applicable") {
      return reply.code(400).send(validationError("Plans only apply to individual teacher accounts"));
    }

    const result = await prisma.$transaction((tx) =>
      activatePlan(tx, { userId: request.params.userId, plan, source: "admin", createdByUserId: request.user.sub, note: request.body?.note?.trim() || "Activated by an admin" })
    );
    return { data: { endsAt: result.endsAt, balance: result.balance }, meta: {} };
  });
}
