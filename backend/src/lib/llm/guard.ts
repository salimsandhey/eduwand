import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { sendEmailInBackground } from "../email/sender";
import { aiLimitEmail } from "../email/templates";
import { PLATFORM_ADMIN_ROLE } from "../roles";
import { aiRequestContext } from "./context";
import { AiLimitError } from "./errors";
import { assertAiEntitlement } from "../subscriptions";

export { AiLimitError } from "./errors";

// Spend guard for every AI provider call. Before a call is sent its worst-case
// cost is RESERVED against the running counters in one atomic statement per
// counter, so concurrent calls can never push spend past a limit; after the
// call the reservation is replaced with the real cost. If any limit would be
// crossed, the call is refused before any money is spent.

export type AiLimitUnit = "inr" | "requests" | "tokens";
export type AiLimitScope = "global" | "user" | "call";
export type AiLimitPeriod = "minute" | "day" | "month" | "call";

export interface AiLimitDefinition {
  key: string;
  label: string;
  description: string;
  scope: AiLimitScope;
  period: AiLimitPeriod;
  unit: AiLimitUnit;
  defaultEnabled: boolean;
  defaultValue: number;
}

// The label/scope/unit of each limit lives here; only the on/off + value is
// stored (ai_limit). A key with no row falls back to the default below.
export const AI_LIMIT_CATALOG: AiLimitDefinition[] = [
  {
    key: "spend_day_global",
    label: "Platform spend per day",
    description: "Total AI spend across every user. Resets at midnight IST.",
    scope: "global",
    period: "day",
    unit: "inr",
    defaultEnabled: true,
    defaultValue: 500,
  },
  {
    key: "spend_month_global",
    label: "Platform spend per month",
    description: "Total AI spend across every user, per calendar month (IST).",
    scope: "global",
    period: "month",
    unit: "inr",
    defaultEnabled: true,
    defaultValue: 3000,
  },
  {
    key: "spend_day_teacher",
    label: "Spend per user per day",
    description: "AI spend of any single user, so one tester cannot use up the whole budget.",
    scope: "user",
    period: "day",
    unit: "inr",
    defaultEnabled: true,
    defaultValue: 50,
  },
  {
    key: "requests_min_global",
    label: "AI requests per minute (platform)",
    description: "Catches a runaway loop within seconds.",
    scope: "global",
    period: "minute",
    unit: "requests",
    defaultEnabled: true,
    defaultValue: 60,
  },
  {
    key: "requests_min_teacher",
    label: "AI requests per minute (per user)",
    description: "Stops one account from hammering the AI.",
    scope: "user",
    period: "minute",
    unit: "requests",
    defaultEnabled: true,
    defaultValue: 20,
  },
  {
    key: "tokens_day_global",
    label: "Tokens per day (platform)",
    description: "Optional second measure, counts input + output tokens.",
    scope: "global",
    period: "day",
    unit: "tokens",
    defaultEnabled: false,
    defaultValue: 3_000_000,
  },
  {
    key: "max_input_tokens_call",
    label: "Max input tokens per call",
    description: "A single request bigger than this is refused.",
    scope: "call",
    period: "call",
    unit: "tokens",
    defaultEnabled: true,
    defaultValue: 60_000,
  },
  {
    key: "max_output_tokens_call",
    label: "Max output tokens per call",
    description: "Caps how long any single reply can be. Lowering it below what a feature needs can cut generated content short.",
    scope: "call",
    period: "call",
    unit: "tokens",
    defaultEnabled: true,
    defaultValue: 16_000,
  },
];

export const AI_PAUSED_SETTING_KEY = "ai_paused";
export const USD_INR_SETTING_KEY = "usd_inr";

const FALLBACK_USD_INR = 90; // higher than reality on purpose: a smaller USD limit is the safe error
const UNKNOWN_MODEL_PRICE = { inputPerMtokUsd: 15, outputPerMtokUsd: 75, cacheReadPerMtokUsd: 1.5, cacheWritePerMtokUsd: 18.75, perSearchUsd: 0.05 };
const CONFIG_TTL_MS = 5_000;

const DEFAULT_HARD_MAX_USD_PER_DAY = 20;
const DEFAULT_HARD_MAX_USD_PER_MONTH = 200;

const MSG_UNAVAILABLE = "AI is temporarily unavailable. Please try again in a little while.";
const MSG_USER_DAY = "You've reached today's AI usage limit. It resets at midnight IST.";
const MSG_USER_RATE = "You're sending AI requests too quickly. Please wait a minute and try again.";
const MSG_TOO_LARGE = "That request is too large for the AI to handle. Try again with less content.";

export interface PriceRow {
  inputPerMtokUsd: number;
  outputPerMtokUsd: number;
  cacheReadPerMtokUsd: number;
  cacheWritePerMtokUsd: number;
  perSearchUsd: number;
}

export interface GuardConfig {
  paused: boolean;
  usdInr: number;
  limits: Map<string, { enabled: boolean; value: number }>;
  prices: Map<string, PriceRow>;
  hardMaxUsdPerDay: number;
  hardMaxUsdPerMonth: number;
  loadedAt: number;
}

let cachedConfig: GuardConfig | null = null;

export function invalidateGuardConfig(): void {
  cachedConfig = null;
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function loadGuardConfig(): Promise<GuardConfig> {
  if (cachedConfig && Date.now() - cachedConfig.loadedAt < CONFIG_TTL_MS) return cachedConfig;

  try {
    const [limitRows, settingRows, priceRows] = await Promise.all([
      prisma.aiLimit.findMany(),
      prisma.platformSetting.findMany({ where: { key: { in: [AI_PAUSED_SETTING_KEY, USD_INR_SETTING_KEY] } } }),
      prisma.aiModelPrice.findMany(),
    ]);

    const settings = new Map(settingRows.map((s) => [s.key, s.value]));
    const rate = Number(settings.get(USD_INR_SETTING_KEY));
    const stored = new Map(limitRows.map((r) => [r.key, { enabled: r.enabled, value: r.value }]));

    const limits = new Map<string, { enabled: boolean; value: number }>();
    for (const def of AI_LIMIT_CATALOG) {
      limits.set(def.key, stored.get(def.key) ?? { enabled: def.defaultEnabled, value: def.defaultValue });
    }

    cachedConfig = {
      paused: settings.get(AI_PAUSED_SETTING_KEY) === "true",
      usdInr: Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_USD_INR,
      limits,
      prices: new Map(priceRows.map((p) => [p.model, p])),
      hardMaxUsdPerDay: envNumber("AI_HARD_MAX_USD_PER_DAY", DEFAULT_HARD_MAX_USD_PER_DAY),
      hardMaxUsdPerMonth: envNumber("AI_HARD_MAX_USD_PER_MONTH", DEFAULT_HARD_MAX_USD_PER_MONTH),
      loadedAt: Date.now(),
    };
    return cachedConfig;
  } catch (err) {
    // Fail closed - if the limits can't be read, spending is not allowed.
    console.error("[ai-guard] could not load limits:", err);
    throw new AiLimitError("config_unavailable", undefined, MSG_UNAVAILABLE);
  }
}

// IST period keys - a day, month or minute boundary is the same for every user.
export function periodKeys(now: Date = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000).toISOString();
  return { day: `d:${ist.slice(0, 10)}`, month: `m:${ist.slice(0, 7)}`, minute: `n:${ist.slice(0, 16)}` };
}

// Deliberately pessimistic: ~3 ASCII characters per token, and every
// non-ASCII character (Hindi and other Indic scripts) as a full token.
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 3) + other;
}

export interface UsageForCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  searches: number;
}

export function computeCostUsd(price: PriceRow, usage: UsageForCost): number {
  return (
    (usage.inputTokens * price.inputPerMtokUsd +
      usage.outputTokens * price.outputPerMtokUsd +
      usage.cacheReadTokens * price.cacheReadPerMtokUsd +
      usage.cacheWriteTokens * price.cacheWritePerMtokUsd) /
      1_000_000 +
    usage.searches * price.perSearchUsd
  );
}

interface CounterPlan {
  scope: string;
  periodKey: string;
  usdLimit: number | null;
  usdKey: string;
  tokenLimit: number | null;
  tokenKey: string;
  requestLimit: number | null;
  requestKey: string;
}

function limitValue(cfg: GuardConfig, key: string): number | null {
  const entry = cfg.limits.get(key);
  return entry?.enabled ? entry.value : null;
}

function inrToUsd(cfg: GuardConfig, inr: number | null): number | null {
  return inr === null ? null : inr / cfg.usdInr;
}

// The counters one call is charged to, in a fixed order (fixed order avoids
// deadlocks between concurrent reservations).
export function planCounters(cfg: GuardConfig, userId: string | undefined, now: Date = new Date()): CounterPlan[] {
  const keys = periodKeys(now);
  const min = (a: number | null, aKey: string, b: number | null, bKey: string) => {
    if (a === null) return { value: b, key: bKey };
    if (b === null) return { value: a, key: aKey };
    return a <= b ? { value: a, key: aKey } : { value: b, key: bKey };
  };

  const day = min(cfg.hardMaxUsdPerDay, "hard_ceiling_day", inrToUsd(cfg, limitValue(cfg, "spend_day_global")), "spend_day_global");
  const month = min(cfg.hardMaxUsdPerMonth, "hard_ceiling_month", inrToUsd(cfg, limitValue(cfg, "spend_month_global")), "spend_month_global");

  const plans: CounterPlan[] = [
    {
      scope: "global",
      periodKey: keys.day,
      usdLimit: day.value,
      usdKey: day.key,
      tokenLimit: limitValue(cfg, "tokens_day_global"),
      tokenKey: "tokens_day_global",
      requestLimit: null,
      requestKey: "",
    },
    { scope: "global", periodKey: keys.month, usdLimit: month.value, usdKey: month.key, tokenLimit: null, tokenKey: "", requestLimit: null, requestKey: "" },
  ];

  const globalRpm = limitValue(cfg, "requests_min_global");
  if (globalRpm !== null) {
    plans.push({ scope: "global", periodKey: keys.minute, usdLimit: null, usdKey: "", tokenLimit: null, tokenKey: "", requestLimit: globalRpm, requestKey: "requests_min_global" });
  }

  if (userId) {
    plans.push({
      scope: `user:${userId}`,
      periodKey: keys.day,
      usdLimit: inrToUsd(cfg, limitValue(cfg, "spend_day_teacher")),
      usdKey: "spend_day_teacher",
      tokenLimit: null,
      tokenKey: "",
      requestLimit: null,
      requestKey: "",
    });
    const userRpm = limitValue(cfg, "requests_min_teacher");
    if (userRpm !== null) {
      plans.push({ scope: `user:${userId}`, periodKey: keys.minute, usdLimit: null, usdKey: "", tokenLimit: null, tokenKey: "", requestLimit: userRpm, requestKey: "requests_min_teacher" });
    }
  }

  return plans;
}

export interface AiReservation {
  provider: string;
  model: string;
  purpose: string;
  userId?: string;
  schoolId?: string;
  plans: CounterPlan[];
  price: PriceRow;
  estUsd: number;
  estTokens: number;
  // The output cap after the per-call limit - callers must not ask for more.
  maxOutputTokens: number;
  usdInr: number;
}

export interface ReserveInput {
  provider: "bedrock" | "gemini";
  model: string;
  purpose: string;
  estInputTokens: number;
  maxOutputTokens: number;
  searches?: number;
}

class BlockedSignal extends Error {
  constructor(readonly plan: CounterPlan) {
    super("blocked");
  }
}

function messageFor(limitKey: string | undefined, reason: string): string {
  if (reason === "input_too_large") return MSG_TOO_LARGE;
  if (limitKey === "spend_day_teacher") return MSG_USER_DAY;
  if (limitKey === "requests_min_teacher") return MSG_USER_RATE;
  return MSG_UNAVAILABLE;
}

async function recordBlocked(input: ReserveInput, ctx: { userId?: string; schoolId?: string } | undefined, reason: string, limitKey?: string) {
  try {
    await prisma.aiCallLog.create({
      data: {
        teacherUserId: ctx?.userId ?? null,
        schoolId: ctx?.schoolId ?? null,
        provider: input.provider,
        model: input.model,
        purpose: input.purpose,
        status: "blocked",
        blockedReason: limitKey ? `${reason}:${limitKey}` : reason,
      },
    });
  } catch (err) {
    console.error("[ai-guard] could not log blocked call:", err);
  }
}

export async function reserveAiSpend(input: ReserveInput): Promise<AiReservation> {
  const ctx = aiRequestContext.getStore();
  const cfg = await loadGuardConfig();

  const refuse = async (reason: string, limitKey?: string, plans?: CounterPlan[]): Promise<never> => {
    await recordBlocked(input, ctx, reason, limitKey);
    if (plans) void checkAlerts(cfg, plans);
    throw new AiLimitError(reason, limitKey, messageFor(limitKey, reason));
  };

  if (cfg.paused) return refuse("paused", "ai_paused");

  // Individual teachers need a live trial or plan (throws PlanExpiredError,
  // an AiLimitError, so callers' existing handling applies).
  if (ctx?.userId) await assertAiEntitlement(ctx.userId);

  const inputCap = limitValue(cfg, "max_input_tokens_call");
  if (inputCap !== null && input.estInputTokens > inputCap) return refuse("input_too_large", "max_input_tokens_call");

  const outputCap = limitValue(cfg, "max_output_tokens_call");
  const maxOutputTokens = outputCap !== null ? Math.min(input.maxOutputTokens, outputCap) : input.maxOutputTokens;

  const price = cfg.prices.get(input.model) ?? UNKNOWN_MODEL_PRICE;
  const searches = input.searches ?? 0;
  const estUsd = computeCostUsd(price, {
    inputTokens: input.estInputTokens,
    outputTokens: maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    searches,
  });
  const estTokens = input.estInputTokens + maxOutputTokens;
  const plans = planCounters(cfg, ctx?.userId);

  // A fresh counter row is inserted without the limit check below, so a call
  // that is on its own bigger than a limit has to be caught here.
  for (const plan of plans) {
    if (plan.usdLimit !== null && estUsd > plan.usdLimit) return refuse("call_too_expensive", plan.usdKey, plans);
    if (plan.tokenLimit !== null && estTokens > plan.tokenLimit) return refuse("call_too_expensive", plan.tokenKey, plans);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          INSERT INTO ai_spend_counter (id, scope, period_key, reserved_usd, reserved_tokens, requests, updated_at)
          VALUES (gen_random_uuid(), ${plan.scope}, ${plan.periodKey}, ${estUsd}::float8, ${estTokens}::int, 1, now())
          ON CONFLICT (scope, period_key) DO UPDATE SET
            reserved_usd = ai_spend_counter.reserved_usd + ${estUsd}::float8,
            reserved_tokens = ai_spend_counter.reserved_tokens + ${estTokens}::int,
            requests = ai_spend_counter.requests + 1,
            updated_at = now()
          WHERE (${plan.usdLimit}::float8 IS NULL OR ai_spend_counter.spent_usd + ai_spend_counter.reserved_usd + ${estUsd}::float8 <= ${plan.usdLimit}::float8)
            AND (${plan.tokenLimit}::float8 IS NULL OR ai_spend_counter.tokens + ai_spend_counter.reserved_tokens + ${estTokens}::float8 <= ${plan.tokenLimit}::float8)
            AND (${plan.requestLimit}::float8 IS NULL OR ai_spend_counter.requests + 1 <= ${plan.requestLimit}::float8)
          RETURNING id`);
        if (rows.length === 0) throw new BlockedSignal(plan);
      }
    });
  } catch (err) {
    if (!(err instanceof BlockedSignal)) {
      console.error("[ai-guard] reservation failed:", err);
      throw new AiLimitError("guard_error", undefined, MSG_UNAVAILABLE);
    }

    // Work out which of the plan's limits was the one that tripped.
    const row = await prisma.aiSpendCounter.findUnique({
      where: { scope_periodKey: { scope: err.plan.scope, periodKey: err.plan.periodKey } },
    });
    let limitKey = err.plan.usdKey || err.plan.requestKey || err.plan.tokenKey;
    if (row) {
      if (err.plan.usdLimit !== null && row.spentUsd + row.reservedUsd + estUsd > err.plan.usdLimit) limitKey = err.plan.usdKey;
      else if (err.plan.tokenLimit !== null && row.tokens + row.reservedTokens + estTokens > err.plan.tokenLimit) limitKey = err.plan.tokenKey;
      else if (err.plan.requestLimit !== null) limitKey = err.plan.requestKey;
    }
    return refuse("limit_reached", limitKey, plans);
  }

  return {
    provider: input.provider,
    model: input.model,
    purpose: input.purpose,
    userId: ctx?.userId,
    schoolId: ctx?.schoolId,
    plans,
    price,
    estUsd,
    estTokens,
    maxOutputTokens,
    usdInr: cfg.usdInr,
  };
}

export interface AiCallOutcome {
  status: "success" | "error" | "timeout";
  usage?: Partial<UsageForCost>;
  latencyMs?: number;
  error?: string;
}

// Replaces the reservation with what the call really cost and logs it. Never
// throws - a bookkeeping failure must not fail a call that already succeeded.
export async function settleAiSpend(reservation: AiReservation, outcome: AiCallOutcome): Promise<void> {
  const usage: UsageForCost = {
    inputTokens: outcome.usage?.inputTokens ?? 0,
    outputTokens: outcome.usage?.outputTokens ?? 0,
    cacheReadTokens: outcome.usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: outcome.usage?.cacheWriteTokens ?? 0,
    searches: outcome.usage?.searches ?? 0,
  };

  // A rejected request costs nothing; a timeout might have been billed, so it
  // is charged at the reserved worst case rather than assumed free.
  let costUsd = 0;
  let spentTokens = 0;
  if (outcome.status === "success") {
    costUsd = computeCostUsd(reservation.price, usage);
    spentTokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  } else if (outcome.status === "timeout") {
    costUsd = reservation.estUsd;
    spentTokens = reservation.estTokens;
  }

  let callLogId: string | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      for (const plan of reservation.plans) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE ai_spend_counter SET
            reserved_usd = GREATEST(reserved_usd - ${reservation.estUsd}::float8, 0),
            reserved_tokens = GREATEST(reserved_tokens - ${reservation.estTokens}::int, 0),
            spent_usd = spent_usd + ${costUsd}::float8,
            tokens = tokens + ${spentTokens}::int,
            updated_at = now()
          WHERE scope = ${plan.scope} AND period_key = ${plan.periodKey}`);
      }
      const created = await tx.aiCallLog.create({
        select: { id: true },
        data: {
          teacherUserId: reservation.userId ?? null,
          schoolId: reservation.schoolId ?? null,
          provider: reservation.provider,
          model: reservation.model,
          purpose: reservation.purpose,
          status: outcome.status,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          searches: usage.searches,
          costUsd,
          latencyMs: outcome.latencyMs ?? null,
          error: outcome.error ? outcome.error.slice(0, 500) : null,
        },
      });
      callLogId = created.id;
    });
  } catch (err) {
    console.error("[ai-guard] could not settle spend:", err);
    return;
  }
  if (callLogId) aiRequestContext.getStore()?.callLogIds?.push(callLogId);

  try {
    const cfg = await loadGuardConfig();
    void checkAlerts(cfg, reservation.plans);
  } catch {
    // Alerts are best-effort.
  }
  if (Math.random() < 0.02) void pruneOldMinuteCounters();
}

async function pruneOldMinuteCounters(): Promise<void> {
  try {
    await prisma.aiSpendCounter.deleteMany({
      where: { periodKey: { startsWith: "n:" }, updatedAt: { lt: new Date(Date.now() - 2 * 60 * 60_000) } },
    });
  } catch {
    // Housekeeping only.
  }
}

// One email to every platform admin when a global spend limit reaches 80% and
// again at 100%; the flags live on the counter row, so each fires once per
// period.
async function checkAlerts(cfg: GuardConfig, plans: CounterPlan[]): Promise<void> {
  try {
    for (const plan of plans) {
      if (plan.scope !== "global" || plan.usdLimit === null) continue;
      const row = await prisma.aiSpendCounter.findUnique({
        where: { scope_periodKey: { scope: plan.scope, periodKey: plan.periodKey } },
      });
      if (!row) continue;

      const used = row.spentUsd + row.reservedUsd;
      const fraction = used / plan.usdLimit;
      const level = fraction >= 1 ? 100 : fraction >= 0.8 ? 80 : 0;
      if (level === 0) continue;
      if (level === 100 && row.alerted100) continue;
      if (level === 80 && row.alerted80) continue;

      const claimed = await prisma.aiSpendCounter.updateMany({
        where: { id: row.id, ...(level === 100 ? { alerted100: false } : { alerted80: false }) },
        data: level === 100 ? { alerted100: true, alerted80: true } : { alerted80: true },
      });
      if (claimed.count === 0) continue;

      const admins = await prisma.appUser.findMany({ where: { role: PLATFORM_ADMIN_ROLE }, select: { email: true, fullName: true } });
      const isMonth = plan.periodKey.startsWith("m:");
      for (const admin of admins) {
        sendEmailInBackground(
          admin.email,
          aiLimitEmail({
            name: admin.fullName,
            period: isMonth ? "this month" : "today",
            percent: level,
            spentInr: Math.round(used * cfg.usdInr),
            limitInr: Math.round(plan.usdLimit * cfg.usdInr),
            limitName: plan.usdKey.startsWith("hard_") ? "server hard ceiling" : isMonth ? "monthly platform limit" : "daily platform limit",
          })
        );
      }
    }
  } catch (err) {
    console.error("[ai-guard] alert check failed:", err);
  }
}
