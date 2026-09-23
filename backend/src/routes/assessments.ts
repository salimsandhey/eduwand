import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage, AssignmentGenInput } from "../lib/ai";
import { hasSufficientCredits, getFeatureCost } from "../lib/credits";
import { buildTaughtContentText } from "../lib/generation-content";
import { getSchoolBoard } from "../lib/boards";

interface StoredAssessmentQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

interface CreateAssessmentBody {
  questionCount?: number;
}

interface SaveResponsesBody {
  questionId: string;
  // Exactly one of selectedOptionIndex/isDoubt per entry - a student either
  // picked an option or pressed "not sure" (see client's Step 6 doubt count).
  responses: { studentStubId: string; selectedOptionIndex?: number; isDoubt?: boolean }[];
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

export async function assessmentRoutes(app: FastifyInstance) {
  // Lets the app resume an unfinished quick check instead of generating a new
  // one (and spending credits again) after e.g. an accidental back-button
  // press - GenerationReviewScreen checks this before calling the create
  // route below. Only "capturing" (in progress) counts as resumable; a
  // completed one doesn't block starting a fresh quick check.
  app.get<{ Params: { id: string } }>("/generations/:id/active-assessment", { onRequest: scoped(app) }, async (request) => {
    const assessment = await prisma.assessment.findFirst({
      where: { generationId: request.params.id, schoolId: request.schoolId, status: "capturing" },
      orderBy: { createdAt: "desc" },
    });
    return { data: assessment, meta: {} };
  });

  // Generates a quick, MCQ-only quiz grounded in ONE specific lesson plan
  // generation - not "everything taught on the topic" like Assignment's
  // assignment-draft. Reuses the same generateAssignmentFromTopic AI method,
  // just forced to mcq and scoped to a single-generation taught-content block.
  app.post<{ Params: { id: string }; Body: CreateAssessmentBody }>(
    "/generations/:id/assessments",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const generation = await prisma.generation.findFirst({
        where: { id: request.params.id, topic: { schoolId: request.schoolId } },
        include: { topic: { include: { classSection: true } } },
      });
      if (!generation) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
      }
      if (generation.outputType !== "lesson_plan" || generation.generationStatus !== "succeeded") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "A quick check can only be generated from a succeeded lesson plan" },
        });
      }

      const questionCount = Math.max(3, Math.min(10, Math.round(Number(request.body?.questionCount)) || 5));

      const taught = buildTaughtContentText([generation]);
      if (!taught.text) {
        return reply.code(422).send({
          data: null,
          error: { code: "no_taught_content", message: "This generation has no usable content to ground a quick check in." },
        });
      }

      const formatTemplate = await prisma.schoolFormatTemplate.findUnique({
        where: { schoolId_appliesTo: { schoolId: request.schoolId, appliesTo: "generation" } },
      });

      const genInput: AssignmentGenInput = {
        taughtContent: taught.text,
        objectives: taught.objectives,
        questionCount,
        difficultyMix: { easy: 0, medium: questionCount, hard: 0 },
        questionTypes: ["mcq"],
        focusPrompt: null,
        subject: generation.topic.subject,
        board: await getSchoolBoard(request.schoolId),
        classLabel: `${generation.topic.classSection.className} ${generation.topic.classSection.sectionName}`,
        schoolFormatInstructions: formatTemplate?.templateBody ?? null,
      };

      if (!(await hasSufficientCredits(request.user.sub, getFeatureCost("assessment_generation")))) {
        return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to generate this quick check" } });
      }

      const start = Date.now();
      const { questions: generated, model } = await aiProvider.generateAssignmentFromTopic(genInput);
      if (generated.length === 0) {
        return reply.code(502).send({
          data: null,
          error: { code: "generation_failed", message: "The AI did not return any usable questions. Try again." },
        });
      }

      const storedQuestions: StoredAssessmentQuestion[] = generated.map((q, i) => ({
        id: `q${i + 1}`,
        prompt: q.prompt,
        options: q.options ?? [],
        correctOptionIndex: q.correctOptionIndex ?? 0,
      }));

      const assessment = await prisma.assessment.create({
        data: {
          schoolId: request.schoolId,
          topicId: generation.topicId,
          generationId: generation.id,
          teacherUserId: request.user.sub,
          classSectionId: generation.topic.classSectionId,
          title: `${generation.topic.name} - Quick Check`,
          questions: storedQuestions as unknown as Prisma.InputJsonValue,
          status: "capturing",
        },
      });

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "assessment_generation",
        model,
        durationMs: Date.now() - start,
      });

      return reply.code(201).send({ data: assessment, meta: {} });
    }
  );

  app.get<{ Params: { id: string } }>("/assessments/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const assessment = await prisma.assessment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: { responses: true },
    });
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assessment not found" } });
    }
    return { data: assessment, meta: {} };
  });

  // Batch-saves one question's responses at a time - the fast capture screen
  // calls this once per question (every student's tap for that question),
  // not once per student. Upserts so re-tapping a mis-tap corrects it rather
  // than erroring on a duplicate.
  app.post<{ Params: { id: string }; Body: SaveResponsesBody }>(
    "/assessments/:id/responses",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const assessment = await prisma.assessment.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
      if (!assessment) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assessment not found" } });
      }

      const body = request.body ?? ({} as SaveResponsesBody);
      const questions = assessment.questions as unknown as StoredAssessmentQuestion[];
      const question = questions.find((q) => q.id === body.questionId);
      if (!question) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Unknown questionId for this assessment" } });
      }
      if (!Array.isArray(body.responses) || body.responses.length === 0) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "responses is required" } });
      }
      for (const r of body.responses) {
        const hasOption = typeof r.selectedOptionIndex === "number";
        if (!r.studentStubId || hasOption === !!r.isDoubt) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "Each response needs a studentStubId and exactly one of selectedOptionIndex or isDoubt" },
          });
        }
      }

      await prisma.$transaction(
        body.responses.map((r) => {
          const data = r.isDoubt
            ? { selectedOptionIndex: null, isCorrect: null, isDoubt: true }
            : { selectedOptionIndex: r.selectedOptionIndex, isCorrect: r.selectedOptionIndex === question.correctOptionIndex, isDoubt: false };
          return prisma.assessmentResponse.upsert({
            where: { assessmentId_questionId_studentStubId: { assessmentId: assessment.id, questionId: question.id, studentStubId: r.studentStubId } },
            create: { assessmentId: assessment.id, questionId: question.id, studentStubId: r.studentStubId, ...data },
            update: data,
          });
        })
      );

      const updated = await prisma.assessment.findUniqueOrThrow({ where: { id: assessment.id }, include: { responses: true } });
      return { data: updated, meta: {} };
    }
  );

  app.post<{ Params: { id: string } }>("/assessments/:id/complete", { onRequest: scoped(app) }, async (request, reply) => {
    const assessment = await prisma.assessment.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assessment not found" } });
    }
    // Also invalidates any live "present on a screen" session (present.ts) -
    // finishing from the app should stop a projector/control page too.
    const updated = await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: "completed", completedAt: new Date(), presentCode: null, presentCodeExpiresAt: null },
    });
    return { data: updated, meta: {} };
  });

  app.get<{ Params: { id: string } }>("/assessments/:id/insight", { onRequest: scoped(app) }, async (request, reply) => {
    const assessment = await prisma.assessment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: { responses: { include: { studentStub: { select: { id: true, fullName: true } } } }, topic: true },
    });
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assessment not found" } });
    }

    const questions = assessment.questions as unknown as StoredAssessmentQuestion[];
    const totalQuestions = questions.length;

    const byStudent = new Map<string, { fullName: string; correctCount: number; answeredCount: number }>();
    for (const r of assessment.responses) {
      const entry = byStudent.get(r.studentStubId) ?? { fullName: r.studentStub.fullName, correctCount: 0, answeredCount: 0 };
      entry.answeredCount += 1;
      if (r.isCorrect) entry.correctCount += 1;
      byStudent.set(r.studentStubId, entry);
    }

    const bands: Record<"level_1" | "level_2" | "level_3", { studentStubId: string; fullName: string }[]> = {
      level_1: [],
      level_2: [],
      level_3: [],
    };
    for (const [studentStubId, s] of byStudent) {
      if (s.answeredCount === 0) continue;
      const pct = s.correctCount / totalQuestions;
      const band = pct >= 0.8 ? "level_1" : pct >= 0.5 ? "level_2" : "level_3";
      bands[band].push({ studentStubId, fullName: s.fullName });
    }

    const respondentCount = byStudent.size;
    // correctRate is over substantive (non-doubt) answers only - a doubt is
    // "not sure," not a wrong answer, so it shouldn't drag the rate down.
    const itemAnalysis = questions.map((q) => {
      const allForQuestion = assessment.responses.filter((r) => r.questionId === q.id);
      const answers = allForQuestion.filter((r) => !r.isDoubt);
      return {
        questionId: q.id,
        prompt: q.prompt,
        correctCount: answers.filter((r) => r.isCorrect).length,
        totalCount: answers.length,
        correctRate: answers.length > 0 ? answers.filter((r) => r.isCorrect).length / answers.length : null,
        doubtCount: allForQuestion.filter((r) => r.isDoubt).length,
      };
    });
    const totalDoubts = assessment.responses.filter((r) => r.isDoubt).length;

    const { recommendation } = await aiProvider.generateAssessmentRecommendation({
      topicName: assessment.topic.name,
      subject: assessment.topic.subject,
      board: await getSchoolBoard(request.schoolId),
      bands: { level_1: bands.level_1.length, level_2: bands.level_2.length, level_3: bands.level_3.length },
      itemAnalysis: itemAnalysis.map((i) => ({ prompt: i.prompt, correctRate: i.correctRate, doubtCount: i.doubtCount })),
      totalDoubts,
    });

    return {
      data: { respondentCount, totalQuestions, bands, itemAnalysis, totalDoubts, recommendation },
      meta: {},
    };
  });

  app.post<{ Params: { id: string } }>("/assessments/:id/release-results", { onRequest: scoped(app) }, async (request, reply) => {
    const assessment = await prisma.assessment.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assessment not found" } });
    }
    const updated = await prisma.assessment.update({
      where: { id: assessment.id },
      data: { resultsReleasedToStudents: true, resultsReleasedAt: new Date() },
    });
    return { data: updated, meta: {} };
  });
}
