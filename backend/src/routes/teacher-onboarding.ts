import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { TEACHER_ONBOARDING_TASKS } from "../lib/onboarding";

// Teacher "getting started" checklist + school usage leaderboard. Mobile,
// teacher role only for now. See markOnboardingTaskComplete call sites
// (academic-structure.ts, topics.ts, assignments.ts, students.ts,
// class-join.ts) for where tasks actually get marked complete.

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

function requireTeacher(request: { user: { role: string } }): boolean {
  return request.user.role === "teacher";
}

export async function teacherOnboardingRoutes(app: FastifyInstance) {
  app.get("/me/onboarding-tasks", { onRequest: scoped(app) }, async (request, reply) => {
    if (!requireTeacher(request)) {
      return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Requires role: teacher" } });
    }

    const completed = await prisma.teacherOnboardingTask.findMany({
      where: { teacherUserId: request.user.sub },
    });
    const completedByKey = new Map(completed.map((t) => [t.taskKey, t.completedAt]));

    const tasks = TEACHER_ONBOARDING_TASKS.map((t) => ({
      key: t.key,
      label: t.label,
      badge: t.badge,
      completed: completedByKey.has(t.key),
      completedAt: completedByKey.get(t.key) ?? null,
    }));

    return { data: { tasks, completedCount: completed.length, totalCount: TEACHER_ONBOARDING_TASKS.length }, meta: {} };
  });

  // Current-month usage leaderboard for the teacher's own school. Score is a
  // simple additive count of AI generations used, assignments created, and
  // lessons/topics created - flat/unweighted, not token-metered (same
  // "good enough for now" philosophy as the flat AI feature costs in
  // lib/credits.ts). No payout logic here - the "prize" stays a manual/
  // offline decision by the school, same as credit top-ups.
  app.get("/me/school-leaderboard", { onRequest: scoped(app) }, async (request, reply) => {
    if (!requireTeacher(request)) {
      return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Requires role: teacher" } });
    }
    const schoolId = request.schoolId;
    if (!schoolId) {
      return { data: { entries: [], periodStart: null }, meta: {} };
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [teachers, aiUsage, assignments, topics] = await Promise.all([
      prisma.appUser.findMany({
        where: { schoolId, role: "teacher", status: "active" },
        select: { id: true, fullName: true },
      }),
      prisma.aiUsageLog.groupBy({
        by: ["teacherUserId"],
        where: { schoolId, createdAt: { gte: periodStart } },
        _count: { _all: true },
      }),
      prisma.assignment.groupBy({
        by: ["teacherUserId"],
        where: { schoolId, createdAt: { gte: periodStart } },
        _count: { _all: true },
      }),
      prisma.topic.groupBy({
        by: ["teacherUserId"],
        where: { schoolId, createdAt: { gte: periodStart } },
        _count: { _all: true },
      }),
    ]);

    const aiByTeacher = new Map(aiUsage.map((r) => [r.teacherUserId, r._count._all]));
    const assignmentsByTeacher = new Map(assignments.map((r) => [r.teacherUserId, r._count._all]));
    const topicsByTeacher = new Map(topics.map((r) => [r.teacherUserId, r._count._all]));

    const entries = teachers
      .map((t) => {
        const aiCount = aiByTeacher.get(t.id) ?? 0;
        const assignmentCount = assignmentsByTeacher.get(t.id) ?? 0;
        const topicCount = topicsByTeacher.get(t.id) ?? 0;
        return {
          teacherUserId: t.id,
          fullName: t.fullName,
          aiCount,
          assignmentCount,
          topicCount,
          score: aiCount + assignmentCount + topicCount,
          isCurrentUser: t.id === request.user.sub,
        };
      })
      .sort((a, b) => b.score - a.score);

    return { data: { entries, periodStart: periodStart.toISOString() }, meta: {} };
  });
}
