import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";
import { aiProvider, logAiUsage, GradingQuestion } from "../lib/ai";

interface CreateSubmissionBody {
  assignmentId: string;
  studentStubId: string;
  answers: Record<string, string>;
}

interface UpdateGradeBody {
  finalScore?: number;
  finalFeedback?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];
const DEFAULT_LEVEL_1_MIN = 80;
const DEFAULT_LEVEL_2_MIN = 50;

async function computePerformanceBand(schoolId: string, scorePercent: number): Promise<string> {
  const config = await prisma.classBandConfig.findUnique({ where: { schoolId } });
  const level1 = config?.level1MinPercent ?? DEFAULT_LEVEL_1_MIN;
  const level2 = config?.level2MinPercent ?? DEFAULT_LEVEL_2_MIN;
  if (scorePercent > level1) return "level_1";
  if (scorePercent >= level2) return "level_2";
  return "level_3";
}

// A teacher logs a submission on a student's behalf here; Phase 4 adds a
// student's-own POST /student/submissions in student-portal.ts using the same
// underlying create logic.
export async function submissionRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateSubmissionBody }>("/submissions", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as CreateSubmissionBody);
    const isMultipart = request.isMultipart?.();

    let assignmentId: string;
    let studentStubId: string;
    let answers: Record<string, string> = {};
    let submissionType: "online" | "photo" = "online";
    let photoFileLocation: string | null = null;

    if (isMultipart) {
      const parts = request.parts();
      const fields: Record<string, string> = {};
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          const { location } = await storage.save(`submissions/${Date.now()}-${part.filename}`, buffer);
          photoFileLocation = location;
          submissionType = "photo";
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
      assignmentId = fields.assignmentId;
      studentStubId = fields.studentStubId;
      answers = fields.answers ? JSON.parse(fields.answers) : {};
    } else {
      assignmentId = body.assignmentId;
      studentStubId = body.studentStubId;
      answers = body.answers ?? {};
    }

    if (!assignmentId || !studentStubId) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "assignmentId and studentStubId are required" },
      });
    }
    if (submissionType === "photo" && !photoFileLocation) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Photo upload failed" } });
    }

    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status !== "published") {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "Assignment must be published before logging submissions" },
      });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: studentStubId, schoolId: request.schoolId, classSectionId: assignment.classSectionId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found in this class" } });
    }

    const existing = await prisma.submission.findUnique({
      where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: student.id } },
    });
    if (existing) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "This student already has a submission for this assignment" },
      });
    }

    let ocrExtractedText: string | null = null;
    let ocrConfidence: number | null = null;
    if (submissionType === "photo" && photoFileLocation) {
      // Placeholder extraction (backend/src/lib/ai.ts) - no OCR provider
      // configured yet. confidence:0 marks it as not a real read.
      const ocr = await aiProvider.extractTextFromPhoto({ fileLocation: photoFileLocation });
      ocrExtractedText = ocr.text;
      ocrConfidence = ocr.confidence;
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentStubId: student.id,
        answers: answers as unknown as Prisma.InputJsonValue,
        submissionType,
        photoFileLocation,
        ocrExtractedText,
        ocrConfidence,
      },
    });
    await prisma.grade.create({ data: { submissionId: submission.id, status: "pending" } });

    return reply.code(201).send({ data: submission, meta: {} });
  });

  app.post<{ Params: { id: string } }>("/submissions/:id/grade", { onRequest: scoped(app) }, async (request, reply) => {
    const submission = await prisma.submission.findFirst({
      where: { id: request.params.id, assignment: { schoolId: request.schoolId } },
      include: { assignment: true, grade: true },
    });
    if (!submission) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Submission not found" } });
    }
    if (!submission.grade) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Grade record not found" } });
    }
    if (submission.grade.status !== "pending") {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: `Already ${submission.grade.status}` },
      });
    }

    const questions = submission.assignment.questions as unknown as GradingQuestion[];
    // For a photo submission, grade against the OCR'd text (placeholder today),
    // never the raw file - same shape the grader already expects.
    const answers =
      submission.submissionType === "photo"
        ? Object.fromEntries(questions.map((q) => [q.id, submission.ocrExtractedText ?? ""]))
        : (submission.answers as unknown as Record<string, string>);

    const start = Date.now();
    const { score, feedback, flagged, nextStep, model } = await aiProvider.gradeSubmission({ questions, answers });
    const performanceBand = await computePerformanceBand(request.schoolId, score);

    const grade = await prisma.grade.update({
      where: { id: submission.grade.id },
      data: {
        aiScore: score,
        aiFeedback: feedback,
        aiNextStep: nextStep,
        performanceBand,
        flaggedForAttention: flagged,
        status: "ai_graded",
      },
    });

    await logAiUsage({
      schoolId: request.schoolId,
      teacherUserId: request.user.sub,
      feature: "grading",
      model,
      durationMs: Date.now() - start,
    });

    return { data: grade, meta: {} };
  });

  // Class-level insight: banding + item analysis + suggested actions, per the
  // client doc's "what the evaluation must tell the teacher" requirement.
  app.get<{ Params: { id: string } }>("/assignments/:id/class-insight", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: {
        submissions: { include: { grade: true, studentStub: { select: { id: true, fullName: true } } } },
      },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }

    const graded = assignment.submissions.filter((s) => s.grade?.performanceBand);
    const bands: Record<string, { studentStubId: string; fullName: string }[]> = { level_1: [], level_2: [], level_3: [] };
    for (const s of graded) {
      const band = s.grade!.performanceBand!;
      bands[band]?.push({ studentStubId: s.studentStub.id, fullName: s.studentStub.fullName });
    }

    // Item analysis: which questions the majority answered incorrectly is not
    // determinable from the current free-text answers/OCR placeholder without
    // per-question scoring - flagged as a follow-up once objective question
    // types carry per-question correctness, not just an overall score.
    const suggestedActions =
      bands.level_3.length > graded.length / 2
        ? ["More than half the class is below 50% - consider re-teaching this topic before moving on."]
        : bands.level_3.length > 0
        ? ["A small group needs individual follow-up before the next assessment on this topic."]
        : ["Class-wide understanding looks solid - safe to move to the next topic."];

    return {
      data: {
        gradedCount: graded.length,
        totalSubmissions: assignment.submissions.length,
        bands,
        itemAnalysis: null,
        suggestedActions,
      },
      meta: {},
    };
  });

  // "Accept AI grade" is calling this with no body - finalScore/finalFeedback
  // fall back to the AI's own values.
  app.patch<{ Params: { id: string }; Body: UpdateGradeBody }>("/grades/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const grade = await prisma.grade.findFirst({
      where: { id: request.params.id, submission: { assignment: { schoolId: request.schoolId } } },
    });
    if (!grade) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Grade not found" } });
    }
    if (grade.status === "released") {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This grade has already been released" } });
    }

    const body = request.body ?? {};
    const updated = await prisma.grade.update({
      where: { id: grade.id },
      data: {
        finalScore: body.finalScore ?? grade.aiScore,
        finalFeedback: body.finalFeedback ?? grade.aiFeedback,
        overriddenByUserId: request.user.sub,
      },
    });

    return { data: updated, meta: {} };
  });

  // Single-grade release (API Specification section 4.3) - the sole gate on
  // student-visible grades, alongside the bulk action below.
  app.post<{ Params: { id: string } }>("/grades/:id/release", { onRequest: scoped(app) }, async (request, reply) => {
    const grade = await prisma.grade.findFirst({
      where: { id: request.params.id, submission: { assignment: { schoolId: request.schoolId } } },
    });
    if (!grade) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Grade not found" } });
    }
    if (grade.releasedToStudent) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This grade has already been released" } });
    }

    const updated = await prisma.grade.update({
      where: { id: grade.id },
      data: {
        status: "released",
        releasedToStudent: true,
        releasedAt: new Date(),
        finalScore: grade.finalScore ?? grade.aiScore,
        finalFeedback: grade.finalFeedback ?? grade.aiFeedback,
      },
    });

    return { data: updated, meta: {} };
  });

  // Bulk "release grades" action (UI Screen Spec, Grading Review) - not a
  // per-submission call in the original API table, added because that's how
  // the screen's single action is meant to behave.
  app.post<{ Params: { id: string } }>(
    "/assignments/:id/release-grades",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const assignment = await prisma.assignment.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!assignment) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
      }

      const submissions = await prisma.submission.findMany({
        where: { assignmentId: assignment.id },
        include: { grade: true },
      });
      const toRelease = submissions.filter((s) => s.grade && s.grade.status === "ai_graded");

      for (const s of toRelease) {
        await prisma.grade.update({
          where: { id: s.grade!.id },
          data: {
            status: "released",
            releasedToStudent: true,
            releasedAt: new Date(),
            finalScore: s.grade!.finalScore ?? s.grade!.aiScore,
            finalFeedback: s.grade!.finalFeedback ?? s.grade!.aiFeedback,
          },
        });
      }

      return { data: { releasedCount: toRelease.length }, meta: {} };
    }
  );
}
