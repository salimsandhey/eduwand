import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

// Credits are billed per teacher seat regardless of account type (individual
// or institutional) - see Docs/superpowers/plans/2026-09-09-individual-
// teacher-onboarding-and-credits.md. One-time grant only, no recurring
// refill; balance only moves afterwards via CreditLedgerEntry rows written
// by deductCredits() (ai_usage) or an admin top-up (admin_topup).

type Tx = Prisma.TransactionClient | PrismaClient;

const FALLBACK_DEFAULT_CREDITS = 5000;
const DEFAULT_CREDITS_SETTING_KEY = "individual_default_credits";

// Resolution order: the trust's assigned Plan, else the platform's isDefault
// Plan, else the PlatformSetting numeric fallback, else a hardcoded
// last-resort constant so this never throws even on an empty database.
export async function resolveCreditGrantAmount(tx: Tx, trustId: string | null): Promise<number> {
  if (trustId) {
    const trust = await tx.trust.findUnique({
      where: { id: trustId },
      select: { plan: { select: { creditsPerTeacherSeat: true } } },
    });
    if (trust?.plan) return trust.plan.creditsPerTeacherSeat;
  }

  const defaultPlan = await tx.plan.findFirst({ where: { isDefault: true }, select: { creditsPerTeacherSeat: true } });
  if (defaultPlan) return defaultPlan.creditsPerTeacherSeat;

  const setting = await tx.platformSetting.findUnique({ where: { key: DEFAULT_CREDITS_SETTING_KEY } });
  if (setting) {
    const parsed = Number.parseInt(setting.value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return FALLBACK_DEFAULT_CREDITS;
}

// Creates a teacher's credit account and its opening plan_grant ledger entry.
// Call once per teacher seat, at whichever path creates that AppUser (the
// individual-signup transaction, or invite-based staff creation in users.ts).
export async function grantInitialCredits(tx: Tx, teacherUserId: string, trustId: string | null): Promise<void> {
  const amount = await resolveCreditGrantAmount(tx, trustId);

  await tx.teacherCreditAccount.create({ data: { teacherUserId, balance: amount } });
  await tx.creditLedgerEntry.create({
    data: { teacherUserId, delta: amount, reason: "plan_grant", balanceAfter: amount },
  });
}

// Flat cost per AI feature (not token-metered - see the plan doc). Keyed by
// the same `feature` string every route already passes to logAiUsage().
// Admin-tunable later via a PlatformSetting override; hardcoded map is the
// v1 source of truth so there's always a defined cost even before any
// override exists.
const AI_FEATURE_COSTS: Record<string, number> = {
  lesson_plan: 40,
  research_report: 40,
  generation: 40,
  assignment_generation: 60,
  personalisation_suggestion: 20,
  grading: 15,
};
const DEFAULT_FEATURE_COST = 30;

export function getFeatureCost(feature: string): number {
  return AI_FEATURE_COSTS[feature] ?? DEFAULT_FEATURE_COST;
}

// Pre-flight check - call BEFORE the actual AI provider call so a route can
// reject with "insufficient credits" instead of spending money on a call it
// can't charge for. Institutional teachers created before this system
// shipped are backfilled (see the Phase 4 backfill note in the plan doc) so
// every teacher has an account by the time this runs; a genuinely missing
// account is treated as zero balance, not as unlimited.
export async function hasSufficientCredits(teacherUserId: string, cost: number): Promise<boolean> {
  const account = await prisma.teacherCreditAccount.findUnique({ where: { teacherUserId } });
  return (account?.balance ?? 0) >= cost;
}

// Deducts `cost` credits and writes the ai_usage ledger entry. Wrapped in its
// own transaction so a balance check-then-decrement race between concurrent
// AI calls from the same teacher can't overdraw the account.
export async function deductCredits(
  teacherUserId: string,
  cost: number,
  info: { feature: string; aiUsageLogId?: string }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const account = await tx.teacherCreditAccount.upsert({
      where: { teacherUserId },
      update: {},
      create: { teacherUserId, balance: 0 },
    });
    const balanceAfter = account.balance - cost;

    await tx.teacherCreditAccount.update({ where: { teacherUserId }, data: { balance: balanceAfter } });
    await tx.creditLedgerEntry.create({
      data: {
        teacherUserId,
        delta: -cost,
        reason: "ai_usage",
        balanceAfter,
        relatedAiUsageLogId: info.aiUsageLogId,
        note: info.feature,
      },
    });
  });
}
