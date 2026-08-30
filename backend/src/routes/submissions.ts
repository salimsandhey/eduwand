import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";
import { aiProvider, logAiUsage, GradingQuestion, AnswerKeyContext, QuestionGradeDetail } from "../lib/ai";
import { selectQuestionsForMix, DifficultyTaggedQuestion } from "../lib/personalisation";

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

// Same subset a personalised student was actually shown (see
// lib/personalisation.ts) - recomputed at grading time rather than stored,
// since it's a pure function of the assignment's questions + the student's
// applied mix and the two call sites (delivery, grading) must always agree.
async function effectiveQuestions(
  assignmentId: string,
  studentStubId: string,
  personalisationEnabled: boolean,
  allQuestions: DifficultyTaggedQuestion[]
): Promise<DifficultyTaggedQuestion[]> {
  if (!personalisationEnabled) return allQuestions;
  const suggestion = await prisma.personalisationSuggestion.findUnique({
    where: { assignmentId_studentStubId: { assignmentId, studentStubId } },
  });
  return selectQuestionsForMix(allQuestions, suggestion?.appliedMix as Record<string, number> | null | undefined);
}

// A photo submission's OCR text is either the new per-question JSON map
// (`{questionId: text}`, from extractTextFromPhoto's segmented path) or,
// for submissions made before segmentation existed, one unstructured blob
// applied to every question as a best-effort fallback. Empty/missing text
// (OCR unconfigured, or nothing legible in the photo) resolves to no
// answers at all - it must NOT be treated as if every question were
// answered with that text (that was the placeholder-scoring bug).
function resolveAnswers(
  submission: { submissionType: string; answers: unknown; ocrExtractedText: string | null },
  questions: { id: string }[]
): Record<string, string> {
  if (submission.submissionType !== "photo") {
    return (submission.answers as Record<string, string>) ?? {};
  }
  const raw = submission.ocrExtractedText;
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
  } catch {
    // Not JSON - legacy unsegmented text, fall through.
  }
  return Object.fromEntries(questions.map((q) => [q.id, raw]));
}

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
      const questionsForOcr = assignment.questions as unknown as { id: string; prompt: string }[];
      const ocr = await aiProvider.extractTextFromPhoto({ fileLocation: photoFileLocation, questions: questionsForOcr });
      ocrExtractedText = ocr.perQuestion ? JSON.stringify(ocr.perQuestion) : ocr.text;
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

    const allQuestions = submission.assignment.questions as unknown as GradingQuestion[];
    const questions = await effectiveQuestions(
      submission.assignmentId,
      submission.studentStubId,
      submission.assignment.personalisationEnabled,
      allQuestions
    );
    const answers = resolveAnswers(submission, questions);

    const answerKeyRows = await prisma.answerKey.findMany({
      where: { assignmentId: submission.assignmentId, teacherVerifiedAnswer: { not: null } },
    });
    const answerKey: AnswerKeyContext[] = answerKeyRows.map((k) => ({
      questionId: k.questionId,
      verifiedAnswer: k.teacherVerifiedAnswer!,
      marks: k.marks,
    }));

    const start = Date.now();
    const { score, feedback, flagged, nextStep, model, questionDetails } = await aiProvider.gradeSubmission({
      questions,
      answers,
      answerKey,
    });
    const performanceBand = await computePerformanceBand(request.schoolId, score);

    const grade = await prisma.grade.update({
      where: { id: submission.grade.id },
      data: {
        aiScore: score,
        aiFeedback: feedback,
        aiNextStep: nextStep,
        questionDetails: questionDetails as unknown as Prisma.InputJsonValue,
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

    const suggestedActions =
      bands.level_3.length > graded.length / 2
        ? ["More than half the class is below 50% - consider re-teaching this topic before moving on."]
        : bands.level_3.length > 0
        ? ["A small group needs individual follow-up before the next assessment on this topic."]
        : ["Class-wide understanding looks solid - safe to move to the next topic."];

    // Aggregate per-question correctness from every graded submission's
    // Grade.questionDetails. correct is null under the offline heuristic (it
    // can't judge correctness, only completeness) - those entries count
    // toward totalCount but are excluded from correctRate's denominator so a
    // question doesn't read as "0% correct" when it's really "not yet
    // evaluated for correctness."
    const allQuestions = assignment.questions as unknown as { id: string; prompt: string }[];
    const perQuestion = new Map<string, { correctCount: number; knownCount: number; totalCount: number }>();
    for (const s of assignment.submissions) {
      const details = s.grade?.questionDetails as QuestionGradeDetail[] | null | undefined;
      if (!details) continue;
      for (const d of details) {
        const entry = perQuestion.get(d.questionId) ?? { correctCount: 0, knownCount: 0, totalCount: 0 };
        entry.totalCount += 1;
        if (d.correct !== null) {
          entry.knownCount += 1;
          if (d.correct) entry.correctCount += 1;
        }
        perQuestion.set(d.questionId, entry);
      }
    }
    const itemAnalysis =
      perQuestion.size > 0
        ? Array.from(perQuestion.entries()).map(([questionId, v]) => ({
            questionId,
            prompt: allQuestions.find((q) => q.id === questionId)?.prompt ?? "",
            correctCount: v.correctCount,
            totalCount: v.totalCount,
            correctRate: v.knownCount > 0 ? v.correctCount / v.knownCount : null,
          }))
        : null;

    return {
      data: {
        gradedCount: graded.length,
        totalSubmissions: assignment.submissions.length,
        bands,
        itemAnalysis,
        suggestedActions,
      },
      meta: {},
    };
  });

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
