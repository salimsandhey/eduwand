import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { loadGuardConfig } from "../lib/llm/guard";

// What AI actually costs, measured from the per-call log (ai_call_log), set
// against what teachers are charged in credits - the data behind pricing each
// feature. Platform-admin only.

const CREDIT_VALUE_KEY = "ai_credit_value_inr";
const TARGET_MARGIN_KEY = "ai_target_margin";
const DEFAULT_CREDIT_VALUE_INR = 0.1;
const DEFAULT_TARGET_MARGIN = 3;
const ALLOWED_DAYS = new Set([1, 7, 30, 90]);

const num = (value: unknown): number => Number(value ?? 0);
const inr = (usdInr: number, usd: number): number => usd * usdInr;
const round = (value: number, places = 3): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
// Suggested prices are rounded up to a tidy multiple of 5 credits.
const roundUpTo5 = (value: number): number => Math.max(5, Math.ceil(value / 5) * 5);

async function loadPricingSettings() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [CREDIT_VALUE_KEY, TARGET_MARGIN_KEY] } } });
  const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const creditValue = byKey.get(CREDIT_VALUE_KEY);
  const margin = byKey.get(TARGET_MARGIN_KEY);
  return {
    creditValueInr: creditValue && creditValue > 0 ? creditValue : DEFAULT_CREDIT_VALUE_INR,
    targetMargin: margin && margin >= 1 ? margin : DEFAULT_TARGET_MARGIN,
  };
}

export async function aiCostRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { days?: string } }>(
    "/ai-costs",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const requested = Number(request.query.days ?? 30);
      const days = ALLOWED_DAYS.has(requested) ? requested : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60_000);

      const [cfg, pricing, firstCall] = await Promise.all([
        loadGuardConfig(),
        loadPricingSettings(),
        prisma.aiCallLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ]);
      const inr = (usd: number) => usd * cfg.usdInr;
      // Credits charged before calls were metered have no cost to compare
      // with, so they would only inflate the margin.
      const creditsSince = firstCall && firstCall.createdAt > since ? firstCall.createdAt : since;

      const [summaryRows, dailyRows, modelRows, featureRows, purposeRows, unchargedRows, userRows, ledger, features, paid] = await Promise.all([
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE status = 'success') AS success,
            COUNT(*) FILTER (WHERE status = 'error') AS errors,
            COUNT(*) FILTER (WHERE status = 'timeout') AS timeouts,
            COUNT(*) FILTER (WHERE status = 'blocked') AS blocked,
            COALESCE(SUM(cost_usd) FILTER (WHERE status <> 'blocked'), 0) AS cost,
            COALESCE(SUM(cost_usd) FILTER (WHERE status IN ('error', 'timeout')), 0) AS failed_cost,
            COALESCE(SUM(cost_usd) FILTER (WHERE status <> 'blocked' AND ai_usage_log_id IS NULL), 0) AS uncharged_cost,
            COALESCE(SUM(input_tokens), 0) AS tokens_in,
            COALESCE(SUM(output_tokens), 0) AS tokens_out
          FROM ai_call_log WHERE created_at >= ${since}`),
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT to_char(created_at + interval '5 hours 30 minutes', 'YYYY-MM-DD') AS day,
                 COALESCE(SUM(cost_usd), 0) AS cost, COUNT(*) AS calls
          FROM ai_call_log WHERE created_at >= ${since} AND status <> 'blocked'
          GROUP BY 1 ORDER BY 1`),
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT model, provider, COUNT(*) AS calls,
                 COALESCE(SUM(input_tokens), 0) AS tokens_in, COALESCE(SUM(output_tokens), 0) AS tokens_out,
                 COALESCE(SUM(cache_read_tokens), 0) AS cache_read, COALESCE(SUM(searches), 0) AS searches,
                 COALESCE(SUM(cost_usd), 0) AS cost,
                 AVG(latency_ms) AS avg_latency, percentile_cont(0.9) WITHIN GROUP (ORDER BY latency_ms) AS p90_latency
          FROM ai_call_log WHERE created_at >= ${since} AND status <> 'blocked'
          GROUP BY model, provider ORDER BY cost DESC`),
        // One row per charged action (all the provider calls behind one
        // credit deduction summed), then averaged per feature.
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          WITH per_action AS (
            SELECT feature, ai_usage_log_id, SUM(cost_usd) AS cost, COUNT(*) AS calls,
                   SUM(input_tokens) AS tokens_in, SUM(output_tokens) AS tokens_out
            FROM ai_call_log
            WHERE created_at >= ${since} AND ai_usage_log_id IS NOT NULL AND feature IS NOT NULL
            GROUP BY feature, ai_usage_log_id)
          SELECT feature, COUNT(*) AS actions, AVG(cost) AS avg_cost,
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY cost) AS p90_cost, MAX(cost) AS max_cost,
                 AVG(calls) AS avg_calls, AVG(tokens_in) AS avg_in, AVG(tokens_out) AS avg_out, SUM(cost) AS total_cost
          FROM per_action GROUP BY feature`),
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT purpose, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost,
                 AVG(cost_usd) AS avg_cost, percentile_cont(0.9) WITHIN GROUP (ORDER BY cost_usd) AS p90_cost,
                 AVG(input_tokens) AS avg_in, AVG(output_tokens) AS avg_out,
                 COUNT(*) FILTER (WHERE ai_usage_log_id IS NOT NULL) AS charged_calls
          FROM ai_call_log
          WHERE created_at >= ${since} AND status <> 'blocked'
          GROUP BY purpose ORDER BY cost DESC`),
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT purpose, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost
          FROM ai_call_log
          WHERE created_at >= ${since} AND status <> 'blocked' AND ai_usage_log_id IS NULL
          GROUP BY purpose ORDER BY cost DESC`),
        prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT teacher_user_id AS user_id, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost
          FROM ai_call_log
          WHERE created_at >= ${since} AND status <> 'blocked' AND teacher_user_id IS NOT NULL
          GROUP BY teacher_user_id ORDER BY cost DESC LIMIT 10`),
        prisma.creditLedgerEntry.groupBy({
          by: ["note"],
          where: { reason: "ai_usage", createdAt: { gte: creditsSince } },
          _sum: { delta: true },
          _count: true,
        }),
        prisma.aiFeature.findMany({ orderBy: { sortOrder: "asc" } }),
        // Real money taken in the period (from issued invoices): what was
        // collected, and what is left after GST.
        prisma.billingInvoice.aggregate({ where: { issuedAt: { gte: since } }, _sum: { totalPaise: true, taxableValuePaise: true }, _count: true }),
      ]);

      const summary = summaryRows[0] ?? {};
      const totalCostInr = inr(num(summary.cost));
      const creditsCharged = ledger.reduce((sum, row) => sum - (row._sum.delta ?? 0), 0);
      const revenueInr = creditsCharged * pricing.creditValueInr;

      const featureStats = new Map(featureRows.map((r) => [String(r.feature), r]));
      const creditsByFeature = new Map(ledger.map((r) => [r.note ?? "", { credits: -(r._sum.delta ?? 0), actions: r._count }]));

      const byFeature = features.map((feature) => {
        const stats = featureStats.get(feature.key);
        const charged = creditsByFeature.get(feature.key);
        const avgCostInr = stats ? inr(num(stats.avg_cost)) : null;
        const revenuePerAction = feature.cost * pricing.creditValueInr;
        return {
          key: feature.key,
          label: feature.label,
          currentCredits: feature.cost,
          actions: stats ? num(stats.actions) : 0,
          avgCalls: stats ? round(num(stats.avg_calls), 1) : null,
          avgInputTokens: stats ? Math.round(num(stats.avg_in)) : null,
          avgOutputTokens: stats ? Math.round(num(stats.avg_out)) : null,
          avgCostInr: avgCostInr === null ? null : round(avgCostInr),
          p90CostInr: stats ? round(inr(num(stats.p90_cost))) : null,
          maxCostInr: stats ? round(inr(num(stats.max_cost))) : null,
          totalCostInr: stats ? round(inr(num(stats.total_cost)), 2) : 0,
          creditsCharged: charged?.credits ?? 0,
          // What the current price earns per action versus what an action costs.
          marginPct: avgCostInr === null || revenuePerAction <= 0 ? null : round(((revenuePerAction - avgCostInr) / revenuePerAction) * 100, 1),
          suggestedCredits: avgCostInr === null ? null : roundUpTo5((avgCostInr * pricing.targetMargin) / pricing.creditValueInr),
          suggestedCreditsP90: stats ? roundUpTo5((inr(num(stats.p90_cost)) * pricing.targetMargin) / pricing.creditValueInr) : null,
        };
      });

      const userIds = userRows.map((r) => String(r.user_id));
      const users = userIds.length
        ? await prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
        : [];
      const userById = new Map(users.map((u) => [u.id, u]));

      return {
        data: {
          days,
          usdInr: cfg.usdInr,
          pricing,
          summary: {
            totalCostInr: round(totalCostInr, 2),
            calls: num(summary.success) + num(summary.errors) + num(summary.timeouts),
            failedCalls: num(summary.errors) + num(summary.timeouts),
            blockedCalls: num(summary.blocked),
            failedCostInr: round(inr(num(summary.failed_cost)), 2),
            unchargedCostInr: round(inr(num(summary.uncharged_cost)), 2),
            inputTokens: num(summary.tokens_in),
            outputTokens: num(summary.tokens_out),
            creditsCharged,
            revenueInr: round(revenueInr, 2),
            paymentsCount: paid._count,
            collectedInr: round((paid._sum.totalPaise ?? 0) / 100, 2),
            netRevenueInr: round((paid._sum.taxableValuePaise ?? 0) / 100, 2),
            // Money actually taken (ex GST) less what AI cost in the same period.
            realMarginPct:
              (paid._sum.taxableValuePaise ?? 0) > 0
                ? round((((paid._sum.taxableValuePaise ?? 0) / 100 - totalCostInr) / ((paid._sum.taxableValuePaise ?? 0) / 100)) * 100, 1)
                : null,
            marginPct: revenueInr > 0 ? round(((revenueInr - totalCostInr) / revenueInr) * 100, 1) : null,
          },
          daily: dailyRows.map((r) => ({ day: String(r.day), costInr: round(inr(num(r.cost)), 2), calls: num(r.calls) })),
          byModel: modelRows.map((r) => ({
            model: String(r.model),
            provider: String(r.provider),
            calls: num(r.calls),
            inputTokens: num(r.tokens_in),
            outputTokens: num(r.tokens_out),
            cacheReadTokens: num(r.cache_read),
            searches: num(r.searches),
            costInr: round(inr(num(r.cost)), 2),
            avgLatencyMs: Math.round(num(r.avg_latency)),
            p90LatencyMs: Math.round(num(r.p90_latency)),
          })),
          byFeature,
          // Per kind of call (e.g. generateContent:lesson_plan vs :flashcards) -
          // finer than a credit feature, which can lump several together.
          byPurpose: purposeRows.map((r) => ({
            purpose: String(r.purpose),
            calls: num(r.calls),
            chargedCalls: num(r.charged_calls),
            avgInputTokens: Math.round(num(r.avg_in)),
            avgOutputTokens: Math.round(num(r.avg_out)),
            avgCostInr: round(inr(num(r.avg_cost))),
            p90CostInr: round(inr(num(r.p90_cost))),
            totalCostInr: round(inr(num(r.cost)), 2),
          })),
          uncharged: unchargedRows.map((r) => ({ purpose: String(r.purpose), calls: num(r.calls), costInr: round(inr(num(r.cost)), 2) })),
          topUsers: userRows.map((r) => ({
            userId: String(r.user_id),
            name: userById.get(String(r.user_id))?.fullName ?? "Unknown user",
            email: userById.get(String(r.user_id))?.email ?? null,
            calls: num(r.calls),
            costInr: round(inr(num(r.cost)), 2),
          })),
        },
        meta: {},
      };
    }
  );

  // Raw call explorer: every provider call (and refused request), filterable,
  // newest first - for digging into one user, one feature or one failure.
  app.get<{
    Querystring: { days?: string; status?: string; model?: string; purpose?: string; feature?: string; q?: string; page?: string };
  }>("/ai-costs/calls", { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] }, async (request) => {
    const q = request.query;
    const requestedDays = Number(q.days ?? 7);
    const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const page = Math.max(1, Math.floor(Number(q.page ?? 1)) || 1);
    const pageSize = 25;

    const where: Prisma.AiCallLogWhereInput = { createdAt: { gte: since } };
    if (q.status) where.status = q.status;
    if (q.model) where.model = q.model;
    if (q.purpose) where.purpose = q.purpose;
    if (q.feature === "none") where.feature = null;
    else if (q.feature) where.feature = q.feature;

    const search = q.q?.trim();
    if (search) {
      const matches = await prisma.appUser.findMany({
        where: { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] },
        select: { id: true },
        take: 50,
      });
      where.teacherUserId = { in: matches.map((m) => m.id) };
    }

    const [cfg, total, rows, totals, models, purposes, features] = await Promise.all([
      loadGuardConfig(),
      prisma.aiCallLog.count({ where }),
      prisma.aiCallLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.aiCallLog.aggregate({ where, _sum: { costUsd: true, inputTokens: true, outputTokens: true } }),
      prisma.aiCallLog.findMany({ where: { createdAt: { gte: since } }, distinct: ["model"], select: { model: true } }),
      prisma.aiCallLog.findMany({ where: { createdAt: { gte: since } }, distinct: ["purpose"], select: { purpose: true }, orderBy: { purpose: "asc" } }),
      prisma.aiCallLog.findMany({ where: { createdAt: { gte: since }, feature: { not: null } }, distinct: ["feature"], select: { feature: true } }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.teacherUserId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      data: {
        days,
        page,
        pageSize,
        total,
        totalCostInr: round(inr(cfg.usdInr, totals._sum.costUsd ?? 0), 2),
        totalInputTokens: totals._sum.inputTokens ?? 0,
        totalOutputTokens: totals._sum.outputTokens ?? 0,
        filters: {
          models: models.map((m) => m.model).sort(),
          purposes: purposes.map((p) => p.purpose),
          features: features.map((f) => f.feature as string).sort(),
        },
        rows: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          userName: r.teacherUserId ? userById.get(r.teacherUserId)?.fullName ?? "Unknown user" : null,
          userEmail: r.teacherUserId ? userById.get(r.teacherUserId)?.email ?? null : null,
          provider: r.provider,
          model: r.model,
          purpose: r.purpose,
          feature: r.feature,
          status: r.status,
          blockedReason: r.blockedReason,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cacheReadTokens: r.cacheReadTokens,
          searches: r.searches,
          costInr: round(r.costUsd * cfg.usdInr, 4),
          latencyMs: r.latencyMs,
          error: r.error,
        })),
      },
      meta: {},
    };
  });

  app.put<{ Body: { creditValueInr?: number; targetMargin?: number } }>(
    "/ai-costs/settings",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const { creditValueInr, targetMargin } = request.body ?? {};
      const invalid = (message: string) => reply.code(400).send({ data: null, error: { code: "validation_error", message } });

      if (creditValueInr !== undefined && (!Number.isFinite(creditValueInr) || creditValueInr <= 0 || creditValueInr > 100)) {
        return invalid("creditValueInr must be above 0 and at most 100");
      }
      if (targetMargin !== undefined && (!Number.isFinite(targetMargin) || targetMargin < 1 || targetMargin > 20)) {
        return invalid("targetMargin must be between 1 and 20");
      }

      const write = (key: string, value: number) =>
        prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: String(value), updatedBy: request.user.sub },
          update: { value: String(value), updatedBy: request.user.sub },
        });
      if (creditValueInr !== undefined) await write(CREDIT_VALUE_KEY, creditValueInr);
      if (targetMargin !== undefined) await write(TARGET_MARGIN_KEY, targetMargin);

      return { data: await loadPricingSettings(), meta: {} };
    }
  );
}
