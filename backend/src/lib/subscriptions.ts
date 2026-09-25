import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { PlanExpiredError } from "./llm/errors";

// Individual teacher trial + paid plan. See Docs/superpowers/plans/2026-09-25-
// trial-plans-and-purchase.md. Schools/trusts (accountType "institutional")
// are not subject to any of this.

type Tx = Prisma.TransactionClient | PrismaClient;

const DAY_MS = 24 * 60 * 60 * 1000;

export type EntitlementStatus = "not_applicable" | "trial" | "active" | "expired" | "none";

export interface Entitlement {
  status: EntitlementStatus;
  // False only for an individual teacher with no live trial or plan.
  allowed: boolean;
  planKey: string | null;
  planName: string | null;
  endsAt: Date | null;
  daysLeft: number | null;
}

const NOT_APPLICABLE: Entitlement = { status: "not_applicable", allowed: true, planKey: null, planName: null, endsAt: null, daysLeft: null };

export async function getEntitlement(userId: string, now: Date = new Date()): Promise<Entitlement> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { role: true, school: { select: { accountType: true } } },
  });
  if (!user || user.role !== "teacher" || user.school?.accountType !== "individual") return NOT_APPLICABLE;

  const current = await prisma.teacherSubscription.findFirst({
    where: { teacherUserId: userId, status: "active" },
    orderBy: { endsAt: "desc" },
  });
  if (!current) return { ...NOT_APPLICABLE, status: "none", allowed: false };

  const live = current.endsAt > now;
  return {
    status: live ? (current.kind === "trial" ? "trial" : "active") : "expired",
    allowed: live,
    planKey: current.planKey,
    planName: current.planName,
    endsAt: current.endsAt,
    daysLeft: live ? Math.max(1, Math.ceil((current.endsAt.getTime() - now.getTime()) / DAY_MS)) : 0,
  };
}

// Throws PlanExpiredError when an individual teacher has no live plan.
export async function assertAiEntitlement(userId: string): Promise<void> {
  const entitlement = await getEntitlement(userId);
  if (!entitlement.allowed) throw new PlanExpiredError(entitlement.status === "none" ? "none" : "expired");
}

interface PlanRow {
  key: string;
  name: string;
  kind: string;
  priceInr: number;
  durationDays: number;
  credits: number;
}

// Starts a period on `plan` for the teacher and sets their credits. A renewal
// while a period is still running is added on the end (and its credits added);
// otherwise it starts now and the balance is reset to the plan's credits -
// unused credits from an ended period don't carry over.
export async function activatePlan(
  tx: Tx,
  params: { userId: string; plan: PlanRow; source: "signup" | "purchase" | "admin"; paymentId?: string; createdByUserId?: string; note?: string },
  now: Date = new Date()
): Promise<{ startsAt: Date; endsAt: Date; balance: number }> {
  const { userId, plan } = params;

  const running = await tx.teacherSubscription.findFirst({
    where: { teacherUserId: userId, status: "active", endsAt: { gt: now } },
    orderBy: { endsAt: "desc" },
  });
  const startsAt = running ? running.endsAt : now;
  const endsAt = new Date(startsAt.getTime() + plan.durationDays * DAY_MS);

  await tx.teacherSubscription.create({
    data: {
      teacherUserId: userId,
      planKey: plan.key,
      planName: plan.name,
      kind: plan.kind,
      startsAt,
      endsAt,
      credits: plan.credits,
      priceInr: plan.priceInr,
      source: params.source,
      paymentId: params.paymentId ?? null,
      createdByUserId: params.createdByUserId ?? null,
      note: params.note ?? null,
    },
  });

  const account = await tx.teacherCreditAccount.upsert({ where: { teacherUserId: userId }, update: {}, create: { teacherUserId: userId, balance: 0 } });
  const balanceAfter = running ? account.balance + plan.credits : plan.credits;
  await tx.teacherCreditAccount.update({ where: { teacherUserId: userId }, data: { balance: balanceAfter } });
  await tx.creditLedgerEntry.create({
    data: {
      teacherUserId: userId,
      delta: balanceAfter - account.balance,
      reason: plan.kind === "trial" ? "plan_grant" : "plan_purchase",
      balanceAfter,
      note: plan.name,
      createdByUserId: params.createdByUserId,
    },
  });

  return { startsAt, endsAt, balance: balanceAfter };
}

// Called when an individual teacher signs up. With the trial switched off the
// teacher gets an empty account and no access until a plan is bought.
export async function startTrialForNewTeacher(tx: Tx, userId: string): Promise<void> {
  const trial = await tx.billingPlan.findUnique({ where: { key: "trial" } });
  if (trial?.enabled) {
    await activatePlan(tx, { userId, plan: trial, source: "signup" });
    return;
  }
  await tx.teacherCreditAccount.upsert({ where: { teacherUserId: userId }, update: {}, create: { teacherUserId: userId, balance: 0 } });
}

// Adds days to the current period (or starts from now if it has already ended)
// without touching credits - for an admin extending a trial.
export async function extendSubscription(tx: Tx, userId: string, days: number, adminUserId: string, note?: string, now: Date = new Date()) {
  const latest = await tx.teacherSubscription.findFirst({ where: { teacherUserId: userId, status: "active" }, orderBy: { endsAt: "desc" } });
  if (!latest) return null;
  const base = latest.endsAt > now ? latest.endsAt : now;
  const endsAt = new Date(base.getTime() + days * DAY_MS);
  return tx.teacherSubscription.update({
    where: { id: latest.id },
    data: {
      endsAt,
      // The new end date has to be reminded about again.
      reminded3d: false,
      reminded1d: false,
      remindedEnded: false,
      note: [latest.note, note ?? `Extended by ${days} day(s) by an admin`].filter(Boolean).join(" | "),
      createdByUserId: latest.createdByUserId ?? adminUserId,
    },
  });
}
