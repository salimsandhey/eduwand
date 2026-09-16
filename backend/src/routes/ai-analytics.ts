import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

const teacherScoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];
const adminScoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("admin", "leadership", PLATFORM_ADMIN_ROLE)];

function scoreOf(grade: { finalScore: number | null; aiScore: number | null } | null): number | null {
  if (!grade) return null;
  return grade.finalScore ?? grade.aiScore;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Real day-by-day average score for the last 7 days (including today), built
// from actual submission timestamps + grades - no synthetic/demo data. A day
// with no graded submissions gets a null score (rendered as an empty bar on
// the mobile side) rather than a fabricated number.
function weeklyTrendFor(gradedSubmissions: { submittedAt: Date; score: number }[]) {
  const days: { label: string; score: number | null }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
    const scoresThatDay = gradedSubmissions.filter((s) => s.submittedAt >= dayStart && s.submittedAt < dayEnd).map((s) => s.score);
    days.push({
      label: DAY_LABELS[dayStart.getDay()],
      score: scoresThatDay.length > 0 ? Math.round(scoresThatDay.reduce((a, b) => a + b, 0) / scoresThatDay.length) : null,
    });
  }
  return days;
}

export async function aiAnalyticsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    "/analytics/ai/student/:id",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const student = await prisma.studentStub.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!student) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }

      const submissions = await prisma.submission.findMany({
        where: { studentStubId: student.id, assignment: { schoolId: request.schoolId } },
        include: { grade: true, assignment: { select: { title: true } } },
        orderBy: { submittedAt: "asc" },
      });

      const history = submissions.map((s) => ({
        assignmentTitle: s.assignment.title,
        score: scoreOf(s.grade),
        submittedAt: s.submittedAt,
      }));
      const scores = history.map((h) => h.score).filter((s): s is number => s !== null);
      const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

      return { data: { studentStubId: student.id, fullName: student.fullName, averageScore, history }, meta: {} };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/analytics/ai/class/:id",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const classSection = await prisma.classSection.findFirst({
        where: { id: request.params.id, academicYear: { schoolId: request.schoolId } },
      });
      if (!classSection) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
      }

      const assignments = await prisma.assignment.findMany({
        where: { classSectionId: classSection.id, schoolId: request.schoolId },
        select: { id: true, title: true },
      });
      const assignmentIds = assignments.map((a) => a.id);

      const submissions = await prisma.submission.findMany({
        where: { assignmentId: { in: assignmentIds } },
        include: { grade: true, studentStub: { select: { id: true, fullName: true } } },
      });
      const graded = submissions.filter((s) => scoreOf(s.grade) !== null);

      const classScores = graded.map((s) => scoreOf(s.grade) as number);
      const classAverage = classScores.length > 0 ? classScores.reduce((a, b) => a + b, 0) / classScores.length : null;

      const byStudent = new Map<string, { fullName: string; scores: number[] }>();
      for (const s of graded) {
        const entry = byStudent.get(s.studentStubId) ?? { fullName: s.studentStub.fullName, scores: [] };
        entry.scores.push(scoreOf(s.grade) as number);
        byStudent.set(s.studentStubId, entry);
      }
      const students = [...byStudent.entries()]
        .map(([studentStubId, v]) => ({
          studentStubId,
          fullName: v.fullName,
          averageScore: v.scores.reduce((a, b) => a + b, 0) / v.scores.length,
          submissionCount: v.scores.length,
        }))
        .sort((a, b) => a.averageScore - b.averageScore);

      const byAssignment = new Map<string, { title: string; scores: number[] }>();
      for (const s of graded) {
        const assignment = assignments.find((a) => a.id === s.assignmentId);
        if (!assignment) continue;
        const entry = byAssignment.get(assignment.id) ?? { title: assignment.title, scores: [] };
        entry.scores.push(scoreOf(s.grade) as number);
        byAssignment.set(assignment.id, entry);
      }
      const struggleAreas = [...byAssignment.entries()]
        .map(([assignmentId, v]) => ({
          assignmentId,
          title: v.title,
          averageScore: v.scores.reduce((a, b) => a + b, 0) / v.scores.length,
        }))
        .sort((a, b) => a.averageScore - b.averageScore)
        .slice(0, 3);

      const weeklyTrend = weeklyTrendFor(graded.map((s) => ({ submittedAt: s.submittedAt, score: scoreOf(s.grade) as number })));

      return {
        data: { classAverage, submissionCount: graded.length, students, struggleAreas, weeklyTrend },
        meta: {},
      };
    }
  );

  app.get("/analytics/ai/usage", { onRequest: adminScoped(app) }, async (request) => {
    const logs = await prisma.aiUsageLog.findMany({ where: { schoolId: request.schoolId } });

    const byTeacher = new Map<string, number>();
    const byFeature = new Map<string, number>();
    for (const log of logs) {
      byTeacher.set(log.teacherUserId, (byTeacher.get(log.teacherUserId) ?? 0) + 1);
      byFeature.set(log.feature, (byFeature.get(log.feature) ?? 0) + 1);
    }

    const teachers = await prisma.appUser.findMany({
      where: { id: { in: [...byTeacher.keys()] } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(teachers.map((t) => [t.id, t.fullName]));

    const generationsByTeacher = [...byTeacher.entries()]
      .map(([teacherUserId, count]) => ({ teacherUserId, fullName: nameById.get(teacherUserId) ?? "Unknown", count }))
      .sort((a, b) => b.count - a.count);

    const featureUsage = [...byFeature.entries()].map(([feature, count]) => ({ feature, count }));

    const gradedSubmissions = await prisma.submission.findMany({
      where: { assignment: { schoolId: request.schoolId }, grade: { status: { not: "pending" } } },
      include: { grade: true },
    });
    const turnaroundsMs = gradedSubmissions
      .filter((s) => s.grade)
      .map((s) => s.grade!.updatedAt.getTime() - s.submittedAt.getTime());
    const avgGradingTurnaroundMs =
      turnaroundsMs.length > 0 ? turnaroundsMs.reduce((a, b) => a + b, 0) / turnaroundsMs.length : null;

    return {
      data: {
        totalGenerations: logs.length,
        avgGradingTurnaroundMs,
        generationsByTeacher,
        featureUsage,
      },
      meta: {},
    };
  });
}
