// Background worker (matches the "two production instances plus one worker
// instance" architecture in Docs/Dev/EduWand_Engineering_PRD.md section 4).
// Runs as its own process (npm run worker), not inside the request/response
// server, and ticks on a plain interval - no scheduler dependency needed at
// this scale. Fires due follow-up tasks (FR-EG-4) and scheduled CSV exports
// (FR-EG-11), reusing the exact same code paths their manual endpoints use.
import { prisma } from "./lib/prisma";
import { sendFollowUpTask } from "./lib/follow-up";
import { runCsvExport } from "./lib/exports";

const TICK_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

async function tick() {
  await processDueFollowUps();
  await processScheduledExports();
}

console.log(`[worker] started, ticking every ${TICK_MS}ms`);
tick();
setInterval(tick, TICK_MS);
