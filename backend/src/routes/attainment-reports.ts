import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { buildTopicAttainmentReportPdf, buildSubjectAttainmentReportPdf } from "../lib/pdfExport";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher", "leadership", "admin")];

// Matches the presentation-slide-title tag stripped in ai.ts/PresentationView.tsx -
// a stray "[Understand] ..." prefix should never surface as literal text here either.
const BLOOM_TAG_RE = /^\[(Remember|Understand|Apply|Analyze|Evaluate|Create)\]\s*/i;

// outputType is a snake_case enum value (see ai.ts) - never shown to a
// teacher verbatim. Mirrors unified-app's OUTPUT_TYPE_LABELS
// (outputTypeMeta.ts) - kept in sync manually, same pattern as the other
// small duplicated tables in this codebase (the backend can't import the
// RN-side file).
const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Activity Report",
  flashcards: "Flashcards",
  presentation: "Presentation",
};
function outputTypeLabel(outputType: string): string {
  return OUTPUT_TYPE_LABELS[outputType] ?? outputType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Generation content is stored as a raw JSON string (see content.ts's
// StructuredGenerationContent shapes). Slicing that string directly produces
// literal JSON in the report - this turns it into one readable sentence per
// generation, keyed by outputType the same way the mobile renderers branch on
// it (kept in sync manually, same pattern as the other small duplicated
// tables in this codebase - the backend can't import the RN-side content.ts).
function summarizeGeneration(outputType: string, raw: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return `${outputTypeLabel(outputType)} created`;
  }
  switch (outputType) {
    case "lesson_plan":
      return typeof parsed?.overview === "string" ? parsed.overview.slice(0, 200) : "Lesson plan created";
    case "custom_activity_report":
      return typeof parsed?.objective === "string" ? parsed.objective.slice(0, 200) : "Activity report created";
    case "flashcards":
      return Array.isArray(parsed?.cards) ? `${parsed.cards.length} flashcards created` : "Flashcards created";
    case "presentation": {
      const count = Array.isArray(parsed?.slides) ? parsed.slides.length : 0;
      const firstTitle = typeof parsed?.slides?.[0]?.title === "string" ? parsed.slides[0].title.replace(BLOOM_TAG_RE, "") : null;
      return firstTitle ? `${count}-slide presentation created, starting with "${firstTitle}"` : `${count}-slide presentation created`;
    }
    default:
      return `${outputTypeLabel(outputType)} created`;
  }
}

function scoreOf(grade: { finalScore: number | null; aiScore: number | null } | null | undefined): number | null {
  if (!grade) return null;
  return grade.finalScore ?? grade.aiScore;
}

interface SubmissionForGrouping {
  studentStubId: string;
  studentStub: { id: string; fullName: string };
  grade: { finalScore: number | null; aiScore: number | null } | null;
}

interface StudentBreakdownBucket {
  id: string;
  label: string;
  submissions: SubmissionForGrouping[];
}

// Groups graded submissions by student, and within each student by the given
// buckets (assignments for a topic report, topics for a subject report) - so
// tapping a student in the "Student report" tab can show a real breakdown
// scoped to this exact report, not an unrelated cross-subject history.
type StudentAccumulator = { fullName: string; allScores: number[]; buckets: Map<string, { label: string; scores: number[] }> };

function buildStudentBreakdown(buckets: StudentBreakdownBucket[]) {
  const byStudent = new Map<string, StudentAccumulator>();
  for (const bucket of buckets) {
    for (const s of bucket.submissions) {
      const score = scoreOf(s.grade);
      if (score == null) continue;
      const student: StudentAccumulator = byStudent.get(s.studentStubId) ?? { fullName: s.studentStub.fullName, allScores: [], buckets: new Map() };
      student.allScores.push(score);
      const b = student.buckets.get(bucket.id) ?? { label: bucket.label, scores: [] as number[] };
      b.scores.push(score);
      student.buckets.set(bucket.id, b);
      byStudent.set(s.studentStubId, student);
    }
  }
  return [...byStudent.entries()]
    .map(([studentStubId, v]) => ({
      studentStubId,
      fullName: v.fullName,
      averageScore: v.allScores.reduce((a, b) => a + b, 0) / v.allScores.length,
      submissionCount: v.allScores.length,
      breakdown: [...v.buckets.values()].map((b) => ({ label: b.label, averageScore: b.scores.reduce((a, c) => a + c, 0) / b.scores.length })),
    }))
    .sort((a, b) => a.averageScore - b.averageScore);
}

function bandsOf(scores: number[]) {
  return {
    above80: scores.filter((score) => score >= 80).length,
    between60And80: scores.filter((score) => score >= 60 && score < 80).length,
    below60: scores.filter((score) => score < 60).length,
  };
}

// Extracted so both the JSON route and the PDF route compute the exact same
// numbers from one place - the PDF is a rendering of this data, not a
// separate query path that could drift from what's shown on screen.
export async function computeTopicReport(topicId: string, schoolId: string) {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, schoolId },
    include: {
      generations: true,
      observations: { orderBy: { recordedAt: "asc" } },
      classSection: {
        select: {
          className: true,
          sectionName: true,
          studentStubs: { select: { id: true } },
        },
      },
      assignments: {
        include: { submissions: { include: { grade: true, studentStub: { select: { id: true, fullName: true } } } } },
      },
    },
  });
  if (!topic) return null;

  const generationSummaries = topic.generations.map((g) => ({
    outputType: g.outputType,
    label: outputTypeLabel(g.outputType),
    summary: summarizeGeneration(g.outputType, g.editedOutput ?? g.aiOutput),
  }));
  const whatWasDone =
    generationSummaries.length > 0
      ? generationSummaries.map((s) => `${s.label}: ${s.summary}`).join("\n\n")
      : "No generations recorded for this topic yet.";

  const allSubmissions = topic.assignments.flatMap((a) => a.submissions);
  const gradedWithScore = allSubmissions.filter((s) => scoreOf(s.grade) != null);
  const scores = gradedWithScore.map((s) => scoreOf(s.grade)!);
  const averageScore = scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  const scoreBands = bandsOf(scores);
  const studentAttainment = buildStudentBreakdown(topic.assignments.map((a) => ({ id: a.id, label: a.title, submissions: a.submissions })));
  const assignmentAttainment = topic.assignments
    .map((assignment) => {
      const assignmentScores = assignment.submissions
        .map((submission) => scoreOf(submission.grade))
        .filter((score): score is number => score != null);
      return {
        assignmentId: assignment.id,
        title: assignment.title,
        averageScore: assignmentScores.length > 0 ? assignmentScores.reduce((total, score) => total + score, 0) / assignmentScores.length : null,
      };
    })
    .filter((assignment) => assignment.averageScore !== null);
  const outcomes =
    gradedWithScore.length > 0
      ? `${gradedWithScore.length} graded submission(s) across ${topic.assignments.length} assignment(s) on this topic.`
      : topic.assignments.length > 0
      ? "Assignments exist for this topic but none are graded yet."
      : "No assignment was ever set for this topic, so there are no attainment results to report.";

  const improvementNotes =
    topic.observations.length > 0
      ? topic.observations.map((o) => o.body).join(" | ")
      : "No teacher observations recorded for this topic.";

  const report = await prisma.attainmentReport.upsert({
    where: { topicId: topic.id },
    create: {
      topicId: topic.id,
      whatWasDone,
      outcomes,
      improvementNotes,
      bloomsTaxonomyMapping: Prisma.JsonNull,
    },
    update: { whatWasDone, outcomes, improvementNotes },
  });

  return {
    ...report,
    topicName: topic.name,
    subject: topic.subject,
    board: topic.board,
    className: topic.classSection.className,
    sectionName: topic.classSection.sectionName,
    studentCount: topic.classSection.studentStubs.length,
    gradedSubmissionCount: scores.length,
    averageScore,
    scoreBands,
    assignmentAttainment,
    studentAttainment,
    generationSummaries,
    observations: topic.observations.map((o) => ({ id: o.id, body: o.body, photoUrl: o.photoUrl, recordedAt: o.recordedAt })),
  };
}

export type TopicAttainmentReport = NonNullable<Awaited<ReturnType<typeof computeTopicReport>>>;

// Subject-level roll-up: a real aggregate across every topic a teacher has
// taught for this subject in this class, not just the stored per-topic rows
// - see the "Attainment Report" client feedback (subject-level view, not
// just per-topic).
export async function computeSubjectReport(classSectionId: string, subject: string, schoolId: string) {
  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, academicYear: { schoolId } },
    select: { className: true, sectionName: true, studentStubs: { select: { id: true } } },
  });
  if (!classSection) return null;

  const topics = await prisma.topic.findMany({
    where: { schoolId, classSectionId, subject },
    include: {
      assignments: {
        include: { submissions: { include: { grade: true, studentStub: { select: { id: true, fullName: true } } } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const allSubmissions = topics.flatMap((t) => t.assignments.flatMap((a) => a.submissions));
  const gradedWithScore = allSubmissions.filter((s) => scoreOf(s.grade) != null);
  const scores = gradedWithScore.map((s) => scoreOf(s.grade)!);
  const averageScore = scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  const scoreBands = bandsOf(scores);
  const studentAttainment = buildStudentBreakdown(
    topics.map((topic) => ({ id: topic.id, label: topic.name, submissions: topic.assignments.flatMap((a) => a.submissions) }))
  );

  const perTopicAttainment = topics.map((topic) => {
    const topicSubmissions = topic.assignments.flatMap((a) => a.submissions);
    const topicScores = topicSubmissions.map((s) => scoreOf(s.grade)).filter((score): score is number => score != null);
    return {
      topicId: topic.id,
      topicName: topic.name,
      averageScore: topicScores.length > 0 ? topicScores.reduce((total, score) => total + score, 0) / topicScores.length : null,
      gradedSubmissionCount: topicScores.length,
    };
  });

  return {
    subject,
    className: classSection.className,
    sectionName: classSection.sectionName,
    topicCount: topics.length,
    studentCount: classSection.studentStubs.length,
    gradedSubmissionCount: scores.length,
    averageScore,
    scoreBands,
    perTopicAttainment,
    studentAttainment,
  };
}

export type SubjectAttainmentReport = NonNullable<Awaited<ReturnType<typeof computeSubjectReport>>>;

export async function attainmentReportRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/topics/:id/attainment-report", { onRequest: scoped(app) }, async (request, reply) => {
    const report = await computeTopicReport(request.params.id, request.schoolId);
    if (!report) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }
    return { data: report, meta: {} };
  });

  app.get<{ Params: { id: string } }>("/topics/:id/attainment-report/pdf", { onRequest: scoped(app) }, async (request, reply) => {
    const report = await computeTopicReport(request.params.id, request.schoolId);
    if (!report) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }
    const buffer = await buildTopicAttainmentReportPdf(report);
    const safeName = report.topicName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "attainment-report";
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${safeName}-attainment-report.pdf"`);
    return reply.send(buffer);
  });

  app.get("/attainment-reports/roll-up", { onRequest: scoped(app) }, async (request, reply) => {
    const query = (request.query ?? {}) as { classSectionId?: string; subject?: string };
    if (!query.classSectionId || !query.subject) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "classSectionId and subject are required" } });
    }
    const report = await computeSubjectReport(query.classSectionId, query.subject, request.schoolId);
    if (!report) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }
    return { data: report, meta: {} };
  });

  app.get("/attainment-reports/roll-up/pdf", { onRequest: scoped(app) }, async (request, reply) => {
    const query = (request.query ?? {}) as { classSectionId?: string; subject?: string };
    if (!query.classSectionId || !query.subject) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "classSectionId and subject are required" } });
    }
    const report = await computeSubjectReport(query.classSectionId, query.subject, request.schoolId);
    if (!report) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }
    const buffer = await buildSubjectAttainmentReportPdf(report);
    const safeName = report.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "attainment-report";
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${safeName}-attainment-report.pdf"`);
    return reply.send(buffer);
  });
}
