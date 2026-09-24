import "dotenv/config";
import { prisma } from "./lib/prisma";
import { sendFollowUpTask } from "./lib/follow-up";
import { runCsvExport } from "./lib/exports";
import { deleteExpiredContextSources } from "./lib/contextRetention";

const TICK_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function processAutoFollowUps() {
  const quietSince = new Date(Date.now() - 7 * DAY_MS);
  const enquiries = await prisma.enquiry.findMany({
    where: { duplicateOfEnquiryId: null, ownerUserId: { not: null }, status: { notIn: ["lost", "admitted", "enrolled"] }, updatedAt: { lte: quietSince } },
    select: { id: true, schoolId: true, ownerUserId: true },
  });
  for (const enquiry of enquiries) {
    const existing = await prisma.followUpTask.findFirst({ where: { enquiryId: enquiry.id, status: "pending" } });
    const template = await prisma.messageTemplate.findFirst({ where: { schoolId: enquiry.schoolId, channel: "whatsapp" } }) ?? await prisma.messageTemplate.findFirst({ where: { schoolId: enquiry.schoolId, channel: "sms" } });
    if (!existing && template && enquiry.ownerUserId) await prisma.followUpTask.create({ data: { enquiryId: enquiry.id, assignedToUserId: enquiry.ownerUserId, dueAt: new Date(), channel: template.channel, templateId: template.id, status: "pending" } });
  }
}

async function processEscalations() {
  const overdue = await prisma.followUpTask.findMany({ where: { status: "pending", escalatedAt: null, dueAt: { lte: new Date(Date.now() - 3 * DAY_MS) } }, include: { enquiry: true, template: true } });
  for (const task of overdue) {
    const manager = await prisma.appUser.findFirst({ where: { schoolId: task.enquiry.schoolId, role: { in: ["admin", "principal"] }, status: "active" }, select: { id: true } });
    if (!manager) continue;
    await prisma.$transaction([
      prisma.followUpTask.create({ data: { enquiryId: task.enquiryId, assignedToUserId: manager.id, dueAt: new Date(), channel: task.channel, templateId: task.templateId, status: "pending" } }),
      prisma.followUpTask.update({ where: { id: task.id }, data: { escalatedAt: new Date() } }),
    ]);
  }
}

async function processDueFollowUps() {
  const dueTasks = await prisma.followUpTask.findMany({
    where: { status: "pending", dueAt: { lte: new Date() } },
    select: { id: true },
  });

  for (const task of dueTasks) {
    try {
      await sendFollowUpTask(task.id);
      console.log(`[worker] sent follow-up task ${task.id}`);
    } catch (err) {
      console.error(`[worker] failed to send follow-up task ${task.id}`, err);
    }
  }
}

function isScheduleDue(schedule: { frequency: string; lastRunAt: Date | null }): boolean {
  if (!schedule.lastRunAt) return true;
  const windowMs = schedule.frequency === "daily" ? DAY_MS : 7 * DAY_MS;
  return Date.now() - schedule.lastRunAt.getTime() >= windowMs;
}

async function processScheduledExports() {
  const schedules = await prisma.csvExportSchedule.findMany({ where: { isActive: true } });

  for (const schedule of schedules) {
    if (!isScheduleDue(schedule)) continue;

    try {
      const requester = await prisma.appUser.findFirst({
        where: { schoolId: schedule.schoolId, role: "admin", status: "active" },
        select: { id: true },
      });
      if (!requester) {
        console.warn(`[worker] no active admin found for school ${schedule.schoolId}, skipping scheduled export`);
        continue;
      }

      await runCsvExport(schedule.schoolId, requester.id);
      await prisma.csvExportSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: new Date() } });
      console.log(`[worker] ran scheduled export for school ${schedule.schoolId}`);
    } catch (err) {
      console.error(`[worker] scheduled export failed for school ${schedule.schoolId}`, err);
    }
  }
}

// Copyright compliance - uploaded context files/text are purged 24h after
// upload (see lib/contextRetention.ts). Runs every tick (60s), same as every
// other worker job - cheap no-op query when nothing has expired yet.
async function processContextRetention() {
  try {
    const purged = await deleteExpiredContextSources();
    if (purged > 0) console.log(`[worker] purged ${purged} expired context source(s)`);
  } catch (err) {
    console.error("[worker] context retention purge failed", err);
  }
}

async function tick() {
  await processDueFollowUps();
  await processAutoFollowUps();
  await processEscalations();
  await processScheduledExports();
  await processContextRetention();
}

console.log(`[worker] started, ticking every ${TICK_MS}ms`);
tick();
setInterval(tick, TICK_MS);
