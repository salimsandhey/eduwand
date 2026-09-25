import test from "node:test";
import assert from "node:assert/strict";
import { computeCostUsd, estimateTokens, periodKeys, planCounters, AI_LIMIT_CATALOG, type GuardConfig } from "./guard";

function config(overrides: Partial<GuardConfig> = {}): GuardConfig {
  return {
    paused: false,
    usdInr: 100,
    limits: new Map(AI_LIMIT_CATALOG.map((d) => [d.key, { enabled: d.defaultEnabled, value: d.defaultValue }])),
    prices: new Map(),
    hardMaxUsdPerDay: 20,
    hardMaxUsdPerMonth: 200,
    loadedAt: Date.now(),
    ...overrides,
  };
}

test("period keys roll over at midnight IST, not UTC", () => {
  // 18:29 UTC = 23:59 IST on the 25th; one minute later it is the 26th in IST.
  assert.equal(periodKeys(new Date("2026-09-25T18:29:00Z")).day, "d:2026-09-25");
  assert.equal(periodKeys(new Date("2026-09-25T18:30:00Z")).day, "d:2026-09-26");
  assert.equal(periodKeys(new Date("2026-09-30T18:30:00Z")).month, "m:2026-10");
  assert.equal(periodKeys(new Date("2026-09-25T13:53:10Z")).minute, "n:2026-09-25T19:23");
});

test("token estimate is pessimistic for Indic scripts", () => {
  assert.equal(estimateTokens("abc"), 1);
  assert.equal(estimateTokens("abcdef"), 2);
  assert.equal(estimateTokens("नमस्ते"), 6); // one token per non-ASCII character
});

test("cost is per million tokens plus per-search", () => {
  const price = { inputPerMtokUsd: 3, outputPerMtokUsd: 15, cacheReadPerMtokUsd: 0.3, cacheWritePerMtokUsd: 3.75, perSearchUsd: 0.035 };
  const usd = computeCostUsd(price, { inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 10_000, cacheWriteTokens: 0, searches: 1 });
  assert.ok(Math.abs(usd - (0.003 + 0.03 + 0.003 + 0.035)) < 1e-12);
});

test("the strictest of the server ceiling and the admin limit applies", () => {
  // Admin limit 500 INR at 100 INR/USD = $5 a day, below the $20 server ceiling.
  const day = planCounters(config(), undefined).find((p) => p.scope === "global" && p.periodKey.startsWith("d:"))!;
  assert.equal(day.usdLimit, 5);
  assert.equal(day.usdKey, "spend_day_global");

  // A tighter server ceiling wins even when the admin limit is looser.
  const tight = planCounters(config({ hardMaxUsdPerDay: 1 }), undefined).find((p) => p.periodKey.startsWith("d:"))!;
  assert.equal(tight.usdLimit, 1);
  assert.equal(tight.usdKey, "hard_ceiling_day");
});

test("switching a limit off removes it, but the server ceiling stays", () => {
  const limits = new Map(config().limits);
  limits.set("spend_day_global", { enabled: false, value: 500 });
  const day = planCounters(config({ limits }), undefined).find((p) => p.scope === "global" && p.periodKey.startsWith("d:"))!;
  assert.equal(day.usdLimit, 20);
  assert.equal(day.usdKey, "hard_ceiling_day");
});

test("per-user counters only exist for a known user", () => {
  assert.equal(planCounters(config(), undefined).some((p) => p.scope.startsWith("user:")), false);
  const plans = planCounters(config(), "abc");
  assert.ok(plans.some((p) => p.scope === "user:abc" && p.periodKey.startsWith("d:") && p.usdLimit === 5 / 10));
  assert.ok(plans.some((p) => p.scope === "user:abc" && p.periodKey.startsWith("n:") && p.requestLimit === 20));
});
