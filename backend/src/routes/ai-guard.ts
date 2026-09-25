import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import {
  AI_LIMIT_CATALOG,
  AI_PAUSED_SETTING_KEY,
  USD_INR_SETTING_KEY,
  invalidateGuardConfig,
  loadGuardConfig,
  periodKeys,
} from "../lib/llm/guard";

// Platform-admin controls for the AI spend guard (lib/llm/guard.ts): the
// limits and their live usage, the pause switch, the USD->INR rate and the
// per-model price table.

const adminOnly = { onRequest: [requireRoles(PLATFORM_ADMIN_ROLE)] };

const validationError = (message: string) => ({ data: null, error: { code: "validation_error", message } });

const round2 = (n: number) => Math.round(n * 100) / 100;

async function upsertSetting(key: string, value: string, userId: string) {
  await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: userId },
    update: { value, updatedBy: userId },
  });
  invalidateGuardConfig();
}

export async function aiGuardRoutes(app: FastifyInstance) {
  app.get("/ai-guard", { onRequest: [app.authenticate, ...adminOnly.onRequest] }, async () => {
    const cfg = await loadGuardConfig();
    const keys = periodKeys();
    const inr = (usd: number) => round2(usd * cfg.usdInr);

    const [globalDay, globalMonth, globalMinute, userDay, userMinute, priceRows, blocked] = await Promise.all([
      prisma.aiSpendCounter.findUnique({ where: { scope_periodKey: { scope: "global", periodKey: keys.day } } }),
      prisma.aiSpendCounter.findUnique({ where: { scope_periodKey: { scope: "global", periodKey: keys.month } } }),
      prisma.aiSpendCounter.findUnique({ where: { scope_periodKey: { scope: "global", periodKey: keys.minute } } }),
      prisma.aiSpendCounter.findMany({
        where: { scope: { startsWith: "user:" }, periodKey: keys.day },
        orderBy: { spentUsd: "desc" },
        take: 5,
      }),
      prisma.aiSpendCounter.findMany({
        where: { scope: { startsWith: "user:" }, periodKey: keys.minute },
        orderBy: { requests: "desc" },
        take: 1,
      }),
      prisma.aiModelPrice.findMany({ orderBy: { model: "asc" } }),
      prisma.aiCallLog.findMany({ where: { status: "blocked" }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

    const userIds = [
      ...new Set([
        ...userDay.map((c) => c.scope.slice(5)),
        ...blocked.map((b) => b.teacherUserId).filter((id): id is string => !!id),
      ]),
    ];
    const users = userIds.length
      ? await prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const topUsers = userDay.map((c) => {
      const id = c.scope.slice(5);
      return {
        userId: id,
        name: userById.get(id)?.fullName ?? "Unknown user",
        email: userById.get(id)?.email ?? null,
        spentInr: inr(c.spentUsd + c.reservedUsd),
        requests: c.requests,
      };
    });

    // What each limit is currently at, in the limit's own unit.
    const usageFor = (key: string): number | null => {
      switch (key) {
        case "spend_day_global":
          return globalDay ? inr(globalDay.spentUsd + globalDay.reservedUsd) : 0;
        case "spend_month_global":
          return globalMonth ? inr(globalMonth.spentUsd + globalMonth.reservedUsd) : 0;
        case "spend_day_teacher":
          return topUsers[0]?.spentInr ?? 0;
        case "requests_min_global":
          return globalMinute?.requests ?? 0;
        case "requests_min_teacher":
          return userMinute[0]?.requests ?? 0;
        case "tokens_day_global":
          return globalDay ? globalDay.tokens + globalDay.reservedTokens : 0;
        default:
          return null;
      }
    };

    return {
      data: {
        paused: cfg.paused,
        usdInr: cfg.usdInr,
        hardCeilings: {
          dayUsd: cfg.hardMaxUsdPerDay,
          dayInr: inr(cfg.hardMaxUsdPerDay),
          monthUsd: cfg.hardMaxUsdPerMonth,
          monthInr: inr(cfg.hardMaxUsdPerMonth),
        },
        totals: {
          day: { spentInr: inr(globalDay?.spentUsd ?? 0), requests: globalDay?.requests ?? 0, tokens: globalDay?.tokens ?? 0 },
          month: { spentInr: inr(globalMonth?.spentUsd ?? 0), requests: globalMonth?.requests ?? 0, tokens: globalMonth?.tokens ?? 0 },
        },
        limits: AI_LIMIT_CATALOG.map((def) => {
          const current = cfg.limits.get(def.key)!;
          return {
            key: def.key,
            label: def.label,
            description: def.description,
            scope: def.scope,
            period: def.period,
            unit: def.unit,
            enabled: current.enabled,
            value: current.value,
            usage: usageFor(def.key),
          };
        }),
        topUsers,
        prices: priceRows,
        recentBlocked: blocked.map((b) => ({
          id: b.id,
          createdAt: b.createdAt,
          purpose: b.purpose,
          reason: b.blockedReason,
          userName: b.teacherUserId ? userById.get(b.teacherUserId)?.fullName ?? null : null,
        })),
      },
      meta: {},
    };
  });

  app.put<{ Params: { key: string }; Body: { enabled?: boolean; value?: number } }>(
    "/ai-guard/limits/:key",
    { onRequest: [app.authenticate, ...adminOnly.onRequest] },
    async (request, reply) => {
      const def = AI_LIMIT_CATALOG.find((d) => d.key === request.params.key);
      if (!def) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown limit" } });

      const { enabled, value } = request.body ?? {};
      if (enabled !== undefined && typeof enabled !== "boolean") return reply.code(400).send(validationError("enabled must be true or false"));
      if (value !== undefined) {
        if (!Number.isFinite(value) || value <= 0) return reply.code(400).send(validationError("value must be a number above 0"));
        if (def.unit !== "inr" && !Number.isInteger(value)) return reply.code(400).send(validationError("value must be a whole number"));
      }

      const current = (await loadGuardConfig()).limits.get(def.key)!;
      const next = { enabled: enabled ?? current.enabled, value: value ?? current.value };
      const row = await prisma.aiLimit.upsert({
        where: { key: def.key },
        create: { key: def.key, ...next, updatedBy: request.user.sub },
        update: { ...next, updatedBy: request.user.sub },
      });
      invalidateGuardConfig();
      return { data: { key: row.key, enabled: row.enabled, value: row.value }, meta: {} };
    }
  );

  app.put<{ Body: { paused?: boolean } }>("/ai-guard/pause", { onRequest: [app.authenticate, ...adminOnly.onRequest] }, async (request, reply) => {
    if (typeof request.body?.paused !== "boolean") return reply.code(400).send(validationError("paused must be true or false"));
    await upsertSetting(AI_PAUSED_SETTING_KEY, String(request.body.paused), request.user.sub);
    return { data: { paused: request.body.paused }, meta: {} };
  });

  app.put<{ Body: { usdInr?: number } }>("/ai-guard/settings", { onRequest: [app.authenticate, ...adminOnly.onRequest] }, async (request, reply) => {
    const usdInr = request.body?.usdInr;
    if (!usdInr || !Number.isFinite(usdInr) || usdInr < 30 || usdInr > 300) {
      return reply.code(400).send(validationError("usdInr must be a realistic exchange rate (30 to 300)"));
    }
    await upsertSetting(USD_INR_SETTING_KEY, String(usdInr), request.user.sub);
    return { data: { usdInr }, meta: {} };
  });

  app.put<{
    Params: { model: string };
    Body: {
      inputPerMtokUsd?: number;
      outputPerMtokUsd?: number;
      cacheReadPerMtokUsd?: number;
      cacheWritePerMtokUsd?: number;
      perSearchUsd?: number;
    };
  }>("/ai-guard/prices/:model", { onRequest: [app.authenticate, ...adminOnly.onRequest] }, async (request, reply) => {
    const existing = await prisma.aiModelPrice.findUnique({ where: { model: request.params.model } });
    if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown model" } });

    const body = request.body ?? {};
    const fields = ["inputPerMtokUsd", "outputPerMtokUsd", "cacheReadPerMtokUsd", "cacheWritePerMtokUsd", "perSearchUsd"] as const;
    const data: Partial<Record<(typeof fields)[number], number>> = {};
    for (const field of fields) {
      const value = body[field];
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0) return reply.code(400).send(validationError(`${field} must be 0 or more`));
      data[field] = value;
    }

    const row = await prisma.aiModelPrice.update({ where: { id: existing.id }, data: { ...data, updatedBy: request.user.sub } });
    invalidateGuardConfig();
    return { data: row, meta: {} };
  });
}
