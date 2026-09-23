import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { TEACHER_ONBOARDING_TASKS } from "../lib/onboarding";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUDGE_LOOKBACK_DAYS = 21;
const SHARE_LOOKBACK_DAYS = 14;
// Each kind of nudge (per-assignment submissions, per-topic "assign a test")
// is capped so the full list stays a sensible size. The home ticker shows the
// first few of the list; the notification sheet shows all of it.
const MAX_PER_KIND = 5;
const NEXT_CLASS_WINDOW_MINUTES = 90;

// What tapping a nudge opens - the app maps these to its own screens, so the
// backend never has to know navigation route names.
type NudgeAction =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "topic"; topicId: string }
  | { kind: "day" }
  | { kind: "getting_started" };

interface Nudge {
  id: string;
  type: "submissions" | "day" | "assign_test" | "share_lessons" | "onboarding";
  label: string;
  text: string;
  people?: string[];
  action: NudgeAction;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const plural = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);
const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || fullName;

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

type ActivityType = "generation" | "observation" | "assignment_published";

interface ActivityItem {
  type: ActivityType;
  id: string;
  topicId: string | null;
  label: string;
  timestamp: string;
}

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.getFullYear(), now.getMonth(), diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function teacherDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/teacher-summary", { onRequest: scoped(app) }, async (request) => {
    const schoolId = request.schoolId;
    const teacherUserId = request.user.sub;
    const weekStart = startOfWeek();

    const [
      topicCount,
      topicsUpdatedThisWeek,
      continueTopic,
      assignmentCount,
      draftAssignmentCount,
      publishedAssignmentCount,
      ungradedSubmissionCount,
      recentGenerations,
      recentObservations,
      recentPublishedAssignments,
    ] = await Promise.all([
      prisma.topic.count({ where: { schoolId, teacherUserId, status: "active" } }),
      prisma.topic.count({ where: { schoolId, teacherUserId, status: "active", updatedAt: { gte: weekStart } } }),
      prisma.topic.findFirst({
        where: { schoolId, teacherUserId, status: "active" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, subject: true, classSectionId: true, updatedAt: true },
      }),
      prisma.assignment.count({ where: { schoolId, teacherUserId } }),
      prisma.assignment.count({ where: { schoolId, teacherUserId, status: "draft" } }),
      prisma.assignment.count({ where: { schoolId, teacherUserId, status: "published" } }),
      prisma.submission.count({ where: { assignment: { schoolId, teacherUserId }, grade: null } }),
      prisma.generation.findMany({
        where: { topic: { schoolId, teacherUserId } },
        orderBy: { generatedAt: "desc" },
        take: 3,
        select: { id: true, topicId: true, outputType: true, generatedAt: true, topic: { select: { name: true } } },
      }),
      prisma.observation.findMany({
        where: { topic: { schoolId, teacherUserId } },
        orderBy: { recordedAt: "desc" },
        take: 3,
        select: { id: true, topicId: true, body: true, recordedAt: true, topic: { select: { name: true } } },
      }),
      prisma.assignment.findMany({
        where: { schoolId, teacherUserId, status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: { id: true, title: true, publishedAt: true },
      }),
    ]);

    const recentActivity: ActivityItem[] = [
      ...recentGenerations.map((g) => ({
        type: "generation" as const,
        id: g.id,
        topicId: g.topicId,
        label: `${OUTPUT_TYPE_LABELS[g.outputType] ?? g.outputType} generated - ${g.topic.name}`,
        timestamp: g.generatedAt.toISOString(),
      })),
      ...recentObservations.map((o) => ({
        type: "observation" as const,
        id: o.id,
        topicId: o.topicId,
        label: `Observation added - ${o.topic.name}`,
        timestamp: o.recordedAt.toISOString(),
      })),
      ...recentPublishedAssignments.map((a) => ({
        type: "assignment_published" as const,
        id: a.id,
        topicId: null,
        label: `${a.title} published`,
        timestamp: (a.publishedAt ?? new Date()).toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    return {
      data: {
        topicCount,
        topicsUpdatedThisWeek,
        continueTopic,
        assignmentCount,
        draftAssignmentCount,
        publishedAssignmentCount,
        ungradedSubmissionCount,
        recentActivity,
      },
      meta: {},
    };
  });

  // Ranked, real "needs your attention" items for the home-screen ticker.
  // date/time come from the device (local wall clock), because timetable
  // periods are wall-clock times and the server's own timezone isn't the
  // teacher's.
  app.get<{ Querystring: { date?: string; time?: string } }>("/dashboard/teacher-nudges", { onRequest: scoped(app) }, async (request) => {
    const schoolId = request.schoolId;
    const teacherUserId = request.user.sub;
    const { date, time } = request.query ?? {};
    const parsedDay = date && DATE_RE.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    const validDay = parsedDay && !Number.isNaN(parsedDay.getTime()) && parsedDay.toISOString().slice(0, 10) === date ? parsedDay : null;
    const nowMinutes = time && TIME_RE.test(time) ? toMinutes(time) : null;
    const weekday = validDay ? (validDay.getUTCDay() === 0 ? 7 : validDay.getUTCDay()) : null;
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

    const [ungraded, slots, pendingTaskCount, untestedTopics, unsharedLessons, doneOnboarding] = await Promise.all([
      prisma.submission.findMany({
        where: { assignment: { schoolId, teacherUserId }, grade: null },
        orderBy: { submittedAt: "desc" },
        take: 200,
        select: { assignmentId: true, studentStub: { select: { fullName: true } }, assignment: { select: { title: true } } },
      }),
      validDay && weekday
        ? prisma.timetableSlot.findMany({
            where: { schoolId, teacherUserId, weekday },
            orderBy: { startTime: "asc" },
            include: { classSection: { select: { className: true, sectionName: true } } },
          })
        : Promise.resolve([]),
      validDay ? prisma.calendarTask.count({ where: { schoolId, teacherUserId, taskDate: validDay, isDone: false } }) : Promise.resolve(0),
      prisma.topic.findMany({
        where: {
          schoolId,
          teacherUserId,
          status: "active",
          generations: { some: { generatedAt: { gte: daysAgo(NUDGE_LOOKBACK_DAYS) } } },
          assignments: { none: {} },
          assessments: { none: {} },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, name: true },
      }),
      prisma.generation.findMany({
        where: {
          topic: { schoolId, teacherUserId },
          outputType: "lesson_plan",
          generationStatus: "succeeded",
          shareStatus: "draft",
          generatedAt: { gte: daysAgo(SHARE_LOOKBACK_DAYS) },
        },
        orderBy: { generatedAt: "desc" },
        take: 50,
        select: { topicId: true },
      }),
      prisma.teacherOnboardingTask.findMany({ where: { teacherUserId }, select: { taskKey: true } }),
    ]);

    // Highest priority first: things students are waiting on, then today, then
    // gaps in the teacher's own work, then setup.
    const nudges: Nudge[] = [];

    // One entry per assignment with ungraded work, most recent submission first.
    const ungradedByAssignment = new Map<string, typeof ungraded>();
    for (const submission of ungraded) {
      const group = ungradedByAssignment.get(submission.assignmentId);
      if (group) group.push(submission);
      else ungradedByAssignment.set(submission.assignmentId, [submission]);
    }
    for (const [assignmentId, group] of [...ungradedByAssignment].slice(0, MAX_PER_KIND)) {
      const names = [...new Set(group.map((s) => s.studentStub.fullName))];
      const others = group.length - 1;
      const title = group[0].assignment.title;
      nudges.push({
        id: `submissions:${assignmentId}`,
        type: "submissions",
        label: "SUBMISSIONS",
        text:
          others > 0
            ? `${firstName(names[0])} and ${others} ${plural(others, "other")} submitted "${title}" - waiting to be graded.`
            : `${firstName(names[0])} submitted "${title}" - waiting to be graded.`,
        people: names.slice(0, 3),
        action: { kind: "assignment", assignmentId },
      });
    }

    if (nowMinutes !== null && (slots.length > 0 || pendingTaskCount > 0)) {
      const classOf = (s: (typeof slots)[number]) => `${s.classSection.className} ${s.classSection.sectionName} - ${s.subject}`;
      const current = slots.find((s) => nowMinutes >= toMinutes(s.startTime) && nowMinutes < toMinutes(s.endTime));
      const next = slots.find((s) => toMinutes(s.startTime) > nowMinutes && toMinutes(s.startTime) - nowMinutes <= NEXT_CLASS_WINDOW_MINUTES);
      const parts: string[] = [];
      if (current) parts.push(`Now: ${classOf(current)} until ${current.endTime}`);
      else if (next) parts.push(`Next class at ${next.startTime}: ${classOf(next)}`);
      if (pendingTaskCount > 0) parts.push(`${pendingTaskCount} ${plural(pendingTaskCount, "task")} due today`);
      if (parts.length > 0) {
        nudges.push({ id: "day", type: "day", label: "TODAY", text: parts.join(" · "), action: { kind: "day" } });
      }
    }

    for (const topic of untestedTopics.slice(0, MAX_PER_KIND)) {
      nudges.push({
        id: `assign_test:${topic.id}`,
        type: "assign_test",
        label: "ASSIGN A TEST",
        text: `"${topic.name}" has no test or assignment yet.`,
        action: { kind: "topic", topicId: topic.id },
      });
    }

    if (unsharedLessons.length > 0) {
      nudges.push({
        id: "share_lessons",
        type: "share_lessons",
        label: "LESSON PLANS",
        text: `${unsharedLessons.length} lesson ${plural(unsharedLessons.length, "plan")} not shared with students yet.`,
        action: { kind: "topic", topicId: unsharedLessons[0].topicId },
      });
    }

    const done = new Set(doneOnboarding.map((t) => t.taskKey));
    const nextStep = TEACHER_ONBOARDING_TASKS.find((t) => !done.has(t.key));
    if (nextStep) {
      nudges.push({
        id: `onboarding:${nextStep.key}`,
        type: "onboarding",
        label: "GETTING STARTED",
        text: `Next step: ${nextStep.label.toLowerCase()}.`,
        action: { kind: "getting_started" },
      });
    }

    return { data: nudges, meta: {} };
  });
}
