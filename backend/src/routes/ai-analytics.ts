import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { getClassBandThresholds } from "../lib/classBands";
import { aiProvider } from "../lib/ai";
import { buildClassPerformancePdf, buildStudentPerformancePdf } from "../lib/pdfExport";

const teacherScoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];
const adminScoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("admin", "leadership", PLATFORM_ADMIN_ROLE)];

function scoreOf(grade: { finalScore: number | null; aiScore: number | null } | null): number | null {
  if (!grade) return null;
  return grade.finalScore ?? grade.aiScore;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A bucket only counts once it has at least this many graded questions
// behind it - one lucky/unlucky question shouldn't read as a real strength
// or weakness.
const MIN_QUESTIONS_FOR_INSIGHT = 2;

interface AnalyticsScopeQuery {
  subject?: string;
  topicId?: string;
}

// "All subjects", a subject name, or a topic name - whatever the Analytics
// tab's scope picker was set to. Shared by the class and student PDF exports
// so both show the same label for the same scope.
async function resolveScopeLabel(schoolId: string, scope: AnalyticsScopeQuery): Promise<string> {
  if (scope.topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: scope.topicId, schoolId }, select: { name: true } });
    return topic?.name ?? "This topic";
  }
  if (scope.subject) return scope.subject;
  return "All subjects";
}

interface SubmissionForInsight {
  assignment: {
    topicId: string | null;
    topic: { name: string } | null;
    questions: unknown;
    answerKeys: { questionId: string; marks: number }[];
  };
  grade: { questionDetails: unknown } | null;
}

// Same earned/max-marks aggregation pattern as attainment-reports.ts's
// computeObjectiveAttainment, but scoped to one student's submissions across
// however many topics the current scope covers, and split three ways
// (objective/difficulty/topic) instead of just objective.
async function computeStudentInsightAggregates(submissions: SubmissionForInsight[]) {
  const earned = { objective: new Map<string, number>(), difficulty: new Map<string, number>(), topic: new Map<string, number>() };
  const max = { objective: new Map<string, number>(), difficulty: new Map<string, number>(), topic: new Map<string, number>() };
  const count = { objective: new Map<string, number>(), difficulty: new Map<string, number>(), topic: new Map<string, number>() };
  const topicNameById = new Map<string, string>();

  for (const s of submissions) {
    const questions = (s.assignment.questions as { id: string; difficulty?: string; objectiveId?: string }[] | null) ?? [];
    const marksByQuestion = new Map(s.assignment.answerKeys.map((k) => [k.questionId, k.marks]));
    const questionMeta = new Map(
      questions.map((q) => [q.id, { difficulty: q.difficulty, objectiveId: q.objectiveId, marks: marksByQuestion.get(q.id) ?? 1 }])
    );
    if (s.assignment.topicId && s.assignment.topic) topicNameById.set(s.assignment.topicId, s.assignment.topic.name);

    const details = (s.grade?.questionDetails as { questionId: string; marksAwarded?: number; correct?: boolean | null }[] | null) ?? [];
    for (const d of details) {
      const meta = questionMeta.get(d.questionId);
      if (!meta) continue;
      const awarded = typeof d.marksAwarded === "number" ? d.marksAwarded : d.correct ? meta.marks : 0;

      const add = (axis: "objective" | "difficulty" | "topic", key: string) => {
        earned[axis].set(key, (earned[axis].get(key) ?? 0) + awarded);
        max[axis].set(key, (max[axis].get(key) ?? 0) + meta.marks);
        count[axis].set(key, (count[axis].get(key) ?? 0) + 1);
      };
      if (meta.objectiveId) add("objective", meta.objectiveId);
      if (meta.difficulty) add("difficulty", meta.difficulty);
      if (s.assignment.topicId) add("topic", s.assignment.topicId);
    }
  }

  const objectiveIds = [...max.objective.keys()];
  const objectiveTextById = new Map<string, string>();
  if (objectiveIds.length > 0) {
    const rows = await prisma.topicObjective.findMany({ where: { id: { in: objectiveIds } } });
    for (const r of rows) objectiveTextById.set(r.id, r.text);
  }

  const toBucket = (axis: "objective" | "difficulty" | "topic", key: string, label: string) => {
    const m = max[axis].get(key) ?? 0;
    const c = count[axis].get(key) ?? 0;
    if (m === 0 || c < MIN_QUESTIONS_FOR_INSIGHT) return null;
    return { label, averagePercent: Math.round((100 * (earned[axis].get(key) ?? 0)) / m), questionCount: c };
  };

  const byObjective = objectiveIds
    .map((id) => toBucket("objective", id, objectiveTextById.get(id) ?? "Unknown objective"))
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .map((b) => ({ text: b.label, averagePercent: b.averagePercent, questionCount: b.questionCount }));

  const byDifficulty = (["easy", "medium", "hard"] as const)
    .map((d) => {
      const bucket = toBucket("difficulty", d, d);
      return bucket ? { difficulty: d, averagePercent: bucket.averagePercent, questionCount: bucket.questionCount } : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const byTopic = [...max.topic.keys()]
    .map((id) => toBucket("topic", id, topicNameById.get(id) ?? "Unknown topic"))
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .map((b) => ({ topicName: b.label, averagePercent: b.averagePercent, questionCount: b.questionCount }));

  const combined = [
    ...byObjective.map((o) => ({ kind: "objective" as const, label: o.text, averagePercent: o.averagePercent })),
    ...byTopic.map((t) => ({ kind: "topic" as const, label: t.topicName, averagePercent: t.averagePercent })),
    ...byDifficulty.map((d) => ({ kind: "difficulty" as const, label: d.difficulty, averagePercent: d.averagePercent })),
  ];
  const sorted = [...combined].sort((a, b) => b.averagePercent - a.averagePercent);

  return {
    byObjective,
    byDifficulty,
    byTopic,
    strongest: sorted.slice(0, 2),
    weakest: [...sorted].reverse().slice(0, 2),
  };
}

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

// Extracted so the JSON route and the PDF/CSV export routes compute the
// exact same numbers from one place - the exports are a rendering of this
// data, not a separate query path that could drift from what's on screen.
async function computeStudentAnalytics(schoolId: string, studentId: string, scope: AnalyticsScopeQuery) {
  const student = await prisma.studentStub.findFirst({
    where: { id: studentId, schoolId },
    include: { classSection: { select: { className: true, sectionName: true } } },
  });
  if (!student) return null;

  const { subject, topicId } = scope;
  const submissions = await prisma.submission.findMany({
    where: {
      studentStubId: student.id,
      assignment: {
        schoolId,
        ...(topicId ? { topicId } : subject ? { topic: { subject } } : {}),
      },
    },
    include: {
      grade: true,
      assignment: {
        select: {
          title: true,
          topicId: true,
          topic: { select: { name: true } },
          questions: true,
          answerKeys: { select: { questionId: true, marks: true } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  const history = submissions.map((s) => ({
    assignmentTitle: s.assignment.title,
    score: scoreOf(s.grade),
    submittedAt: s.submittedAt,
  }));
  const scores = history.map((h) => h.score).filter((s): s is number => s !== null);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const { byObjective, byDifficulty, byTopic, strongest, weakest } = await computeStudentInsightAggregates(submissions);

  // Cached per (student, scope), invalidated only when the graded submission
  // count in this scope changes - reopening the same student with nothing
  // new to grade reuses the last AI call instead of paying for an identical
  // one.
  const scopeKey = topicId ? `topic:${topicId}` : subject ? `subject:${subject}` : "all";
  const cached = await prisma.studentInsightCache.findUnique({
    where: { studentStubId_scopeKey: { studentStubId: student.id, scopeKey } },
  });
  let aiSummary: string;
  let aiNextStep: string;
  if (cached && cached.gradedSubmissionCount === scores.length) {
    aiSummary = cached.aiSummary;
    aiNextStep = cached.aiNextStep;
  } else {
    const generated = await aiProvider.generateStudentInsight({
      studentName: student.fullName,
      averageScore,
      submissionCount: scores.length,
      byObjective,
      byDifficulty,
      byTopic,
    });
    aiSummary = generated.summary;
    aiNextStep = generated.nextStep;
    await prisma.studentInsightCache.upsert({
      where: { studentStubId_scopeKey: { studentStubId: student.id, scopeKey } },
      create: { studentStubId: student.id, scopeKey, gradedSubmissionCount: scores.length, aiSummary, aiNextStep, model: generated.model },
      update: { gradedSubmissionCount: scores.length, aiSummary, aiNextStep, model: generated.model, computedAt: new Date() },
    });
  }

  return {
    studentStubId: student.id,
    fullName: student.fullName,
    avatarKey: student.avatarKey,
    photoMimeType: student.photoMimeType,
    className: student.classSection.className,
    sectionName: student.classSection.sectionName,
    averageScore,
    history,
    insights: { byObjective, byDifficulty, byTopic, strongest, weakest, aiSummary, aiNextStep },
  };
}

async function computeClassAnalytics(schoolId: string, classSectionId: string, scope: AnalyticsScopeQuery) {
  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, academicYear: { schoolId } },
  });
  if (!classSection) return null;

  const { subject, topicId } = scope;
  const assignments = await prisma.assignment.findMany({
    where: {
      classSectionId: classSection.id,
      schoolId,
      ...(topicId ? { topicId } : subject ? { topic: { subject } } : {}),
    },
    select: { id: true, title: true },
  });
  const assignmentIds = assignments.map((a) => a.id);

  const submissions = await prisma.submission.findMany({
    where: { assignmentId: { in: assignmentIds } },
    include: { grade: true, studentStub: { select: { id: true, fullName: true, avatarKey: true, photoMimeType: true } } },
  });
  const graded = submissions.filter((s) => scoreOf(s.grade) !== null);

  const classScores = graded.map((s) => scoreOf(s.grade) as number);
  const classAverage = classScores.length > 0 ? classScores.reduce((a, b) => a + b, 0) / classScores.length : null;

  const byStudent = new Map<string, { fullName: string; avatarKey: string | null; photoMimeType: string | null; scores: number[] }>();
  for (const s of graded) {
    const entry = byStudent.get(s.studentStubId) ?? {
      fullName: s.studentStub.fullName,
      avatarKey: s.studentStub.avatarKey,
      photoMimeType: s.studentStub.photoMimeType,
      scores: [],
    };
    entry.scores.push(scoreOf(s.grade) as number);
    byStudent.set(s.studentStubId, entry);
  }
  const students = [...byStudent.entries()]
    .map(([studentStubId, v]) => ({
      studentStubId,
      fullName: v.fullName,
      avatarKey: v.avatarKey,
      photoMimeType: v.photoMimeType,
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

  // Bands the same students the client used to band itself with a
  // hardcoded 80/60 - now using the school's real ClassBandConfig instead
  // (falls back to those same defaults when the school hasn't set one).
  const thresholds = await getClassBandThresholds(schoolId);
  const scoreBands = {
    above80: students.filter((s) => s.averageScore >= thresholds.level1MinPercent).length,
    between60And80: students.filter((s) => s.averageScore >= thresholds.level2MinPercent && s.averageScore < thresholds.level1MinPercent).length,
    below60: students.filter((s) => s.averageScore < thresholds.level2MinPercent).length,
  };

  return {
    className: classSection.className,
    sectionName: classSection.sectionName,
    classAverage,
    submissionCount: graded.length,
    students,
    struggleAreas,
    weeklyTrend,
    scoreBands,
  };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function aiAnalyticsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: AnalyticsScopeQuery }>(
    "/analytics/ai/student/:id",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const analytics = await computeStudentAnalytics(request.schoolId, request.params.id, request.query ?? {});
      if (!analytics) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }
      return { data: analytics, meta: {} };
    }
  );

  app.get<{ Params: { id: string }; Querystring: AnalyticsScopeQuery }>(
    "/analytics/ai/student/:id/pdf",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const scope = request.query ?? {};
      const analytics = await computeStudentAnalytics(request.schoolId, request.params.id, scope);
      if (!analytics) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }
      const scopeLabel = await resolveScopeLabel(request.schoolId, scope);
      const buffer = await buildStudentPerformancePdf({
        fullName: analytics.fullName,
        className: analytics.className,
        sectionName: analytics.sectionName,
        scopeLabel,
        averageScore: analytics.averageScore,
        history: analytics.history.map((h) => ({ ...h, submittedAt: h.submittedAt.toISOString() })),
        insights: analytics.insights,
      });
      const safeName = analytics.fullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "student";
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="${safeName}-performance-report.pdf"`);
      return reply.send(buffer);
    }
  );

  app.get<{ Params: { id: string }; Querystring: AnalyticsScopeQuery }>(
    "/analytics/ai/class/:id",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const analytics = await computeClassAnalytics(request.schoolId, request.params.id, request.query ?? {});
      if (!analytics) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
      }
      return { data: analytics, meta: {} };
    }
  );

  app.get<{ Params: { id: string }; Querystring: AnalyticsScopeQuery }>(
    "/analytics/ai/class/:id/pdf",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const scope = request.query ?? {};
      const analytics = await computeClassAnalytics(request.schoolId, request.params.id, scope);
      if (!analytics) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
      }
      const scopeLabel = await resolveScopeLabel(request.schoolId, scope);
      const buffer = await buildClassPerformancePdf({ ...analytics, scopeLabel });
      const safeName = `${analytics.className}-${analytics.sectionName}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "class";
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="${safeName}-performance-report.pdf"`);
      return reply.send(buffer);
    }
  );

  // Same "all students in this scope" data as the class PDF, as a plain CSV
  // for anyone who'd rather open it in a spreadsheet.
  app.get<{ Params: { id: string }; Querystring: AnalyticsScopeQuery }>(
    "/analytics/ai/class/:id/csv",
    { onRequest: teacherScoped(app) },
    async (request, reply) => {
      const analytics = await computeClassAnalytics(request.schoolId, request.params.id, request.query ?? {});
      if (!analytics) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
      }
      const rows = [
        ["Student name", "Submissions graded", "Average score (%)"],
        ...analytics.students.map((s) => [s.fullName, String(s.submissionCount), String(Math.round(s.averageScore))]),
      ];
      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
      const safeName = `${analytics.className}-${analytics.sectionName}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "class";
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename="${safeName}-performance-report.csv"`);
      return reply.send(csv);
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
