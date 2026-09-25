import { prisma } from "./prisma";
import { sendEmailInBackground } from "./email/sender";
import { planEndedEmail, planEndingEmail } from "./email/templates";

// Reminder emails for individual teachers: 3 days before, 1 day before, and
// once the plan has ended. Each fires once per period (flags on the row); an
// admin extension resets them. Runs hourly from server.ts.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export async function sendPlanReminders(now: Date = new Date()): Promise<number> {
  let sent = 0;

  // Only the teacher's latest period counts - an ended trial followed by a
  // paid period must not trigger an "ended" mail.
  const subs = await prisma.teacherSubscription.findMany({
    where: {
      status: "active",
      endsAt: { lte: new Date(now.getTime() + 3 * DAY_MS), gt: new Date(now.getTime() - 3 * DAY_MS) },
      OR: [{ reminded3d: false }, { reminded1d: false }, { remindedEnded: false }],
    },
  });

  for (const sub of subs) {
    const newer = await prisma.teacherSubscription.findFirst({
      where: { teacherUserId: sub.teacherUserId, status: "active", endsAt: { gt: sub.endsAt } },
      select: { id: true },
    });
    if (newer) continue;

    const teacher = await prisma.appUser.findUnique({ where: { id: sub.teacherUserId }, select: { fullName: true, email: true } });
    if (!teacher) continue;

    const msLeft = sub.endsAt.getTime() - now.getTime();
    const claim = (flag: "reminded3d" | "reminded1d" | "remindedEnded") =>
      prisma.teacherSubscription.updateMany({ where: { id: sub.id, [flag]: false }, data: { [flag]: true } });

    if (msLeft <= 0) {
      if (!sub.remindedEnded && (await claim("remindedEnded")).count === 1) {
        sendEmailInBackground(teacher.email, planEndedEmail({ name: teacher.fullName, planName: sub.planName, kind: sub.kind }));
        sent++;
      }
      continue;
    }

    const daysLeft = Math.ceil(msLeft / DAY_MS);
    // 1-day reminder inside the last day, 3-day reminder inside the last three.
    // A period that starts with less than 3 days left skips the earlier mail.
    const flag = msLeft <= DAY_MS ? "reminded1d" : "reminded3d";
    if (flag === "reminded1d") await claim("reminded3d");
    if (sub[flag] || (await claim(flag)).count !== 1) continue;

    sendEmailInBackground(
      teacher.email,
      planEndingEmail({ name: teacher.fullName, planName: sub.planName, kind: sub.kind, daysLeft, endsAt: sub.endsAt, credits: sub.credits })
    );
    sent++;
  }

  return sent;
}

export function startPlanReminderJob(): NodeJS.Timeout {
  const run = () =>
    sendPlanReminders().catch((err) => console.error("[plan-reminders] run failed:", err));
  setTimeout(run, 30_000);
  const timer = setInterval(run, HOUR_MS);
  timer.unref();
  return timer;
}
