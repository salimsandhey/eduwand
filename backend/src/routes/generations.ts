import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage, GenerationOutputType } from "../lib/ai";

const VALID_OUTPUT_TYPES: GenerationOutputType[] = [
  "lesson_plan",
  "custom_activity_report",
  "flashcards",
  "presentation",
  "explanatory_video",
];
const VALID_MODES = ["plan", "generate"];

interface CreateGenerationBody {
  outputType: GenerationOutputType;
  mode?: string;
  classCount?: number;
  minutesPerClass?: number;
  language?: string;
  customPrompt?: string;
}

interface UpdateGenerationBody {
  editedOutput: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// Generation (Docs/Dev/AI_Module_Rebuild_Plan.md, Phase 2) - supersedes
// lesson-studio.ts's LessonPlan/ResearchReport for new content. Every
// generation belongs to a Topic. Built synchronous for now (Q-02 in the PRD
// is still open) but the response shape (generationStatus field) is ready
// for an async job/poll swap without an API shape change later.
export async function generationRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: CreateGenerationBody }>(
    "/topics/:id/generations",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateGenerationBody);

      if (!body.outputType || !VALID_OUTPUT_TYPES.includes(body.outputType)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `outputType must be one of ${VALID_OUTPUT_TYPES.join(", ")}` },
        });
      }
      const mode = body.mode ?? "generate";
      if (!VALID_MODES.includes(mode)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `mode must be one of ${VALID_MODES.join(", ")}` },
        });
      }

      const topic = await prisma.topic.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { classSection: true },
      });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const classCount = body.classCount ?? 1;
      const minutesPerClass = body.minutesPerClass ?? 45;
      // Ceiling from the client doc's edge-case list ("20 classes of 90
      // minutes" was their own example of too large) - enforced here since no
      // other value was specified.
      if (classCount > 10 || minutesPerClass > 90) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "classCount must be <= 10 and minutesPerClass <= 90" },
        });
      }

      const start = Date.now();
      let content: string;
      let model: string;
      let generationStatus = "succeeded";
      try {
        const result = await aiProvider.generateContent({
          topicName: topic.name,
          subject: topic.subject,
          board: topic.board,
          outputType: body.outputType,
          classCount,
          minutesPerClass,
          language: body.language ?? "English",
          customPrompt: body.customPrompt ?? null,
          classLabel: `${topic.classSection.className} ${topic.classSection.sectionName}`,
        });
        content = result.content;
        model = result.model;
      } catch (err) {
        // Failed generation must preserve the teacher's inputs and offer a
        // one-click retry (client doc acceptance criterion) - persisted as a
        // failed row rather than just an error response, so the frontend has
        // something to retry against.
        app.log.error(err, "Generation failed");
        const failed = await prisma.generation.create({
          data: {
            topicId: topic.id,
            teacherUserId: request.user.sub,
            outputType: body.outputType,
            mode,
            classCount,
            minutesPerClass,
            language: body.language ?? "English",
            customPrompt: body.customPrompt ?? null,
            aiOutput: "",
            modelUsed: "unknown",
            generationStatus: "failed",
          },
        });
        return reply.code(201).send({ data: failed, meta: {} });
      }

      const generation = await prisma.generation.create({
        data: {
          topicId: topic.id,
          teacherUserId: request.user.sub,
          outputType: body.outputType,
          mode,
          classCount,
          minutesPerClass,
          language: body.language ?? "English",
          customPrompt: body.customPrompt ?? null,
          aiOutput: content,
          modelUsed: model,
          generationStatus,
        },
      });

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "generation",
        model,
        durationMs: Date.now() - start,
      });

      return reply.code(201).send({ data: generation, meta: {} });
    }
  );

  app.get<{ Params: { id: string } }>("/generations/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const generation = await prisma.generation.findFirst({
      where: { id: request.params.id, topic: { schoolId: request.schoolId } },
      include: { topic: { include: { contextSources: true } } },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }
    return { data: generation, meta: {} };
  });

  // The edited version, not aiOutput, is what every other read of this
  // generation returns from here on (attainment report, distribution).
  app.patch<{ Params: { id: string }; Body: UpdateGenerationBody }>(
    "/generations/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdateGenerationBody);
      if (!body.editedOutput || !body.editedOutput.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "editedOutput is required" } });
      }

      const generation = await prisma.generation.findFirst({
        where: { id: request.params.id, topic: { schoolId: request.schoolId } },
      });
      if (!generation) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
      }

      const updated = await prisma.generation.update({
        where: { id: generation.id },
        data: { editedOutput: body.editedOutput },
      });

      return { data: updated, meta: {} };
    }
  );

  // One-click retry with the original inputs preserved (client doc acceptance
  // criterion for a failed generation).
  app.post<{ Params: { id: string } }>("/generations/:id/retry", { onRequest: scoped(app) }, async (request, reply) => {
    const generation = await prisma.generation.findFirst({
      where: { id: request.params.id, topic: { schoolId: request.schoolId } },
      include: { topic: { include: { classSection: true } } },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }

    const start = Date.now();
    const { content, model } = await aiProvider.generateContent({
      topicName: generation.topic.name,
      subject: generation.topic.subject,
      board: generation.topic.board,
      outputType: generation.outputType as GenerationOutputType,
      classCount: generation.classCount ?? 1,
      minutesPerClass: generation.minutesPerClass ?? 45,
      language: generation.language,
      customPrompt: generation.customPrompt,
      classLabel: `${generation.topic.classSection.className} ${generation.topic.classSection.sectionName}`,
    });

    const updated = await prisma.generation.update({
      where: { id: generation.id },
      data: { aiOutput: content, modelUsed: model, generationStatus: "succeeded", editedOutput: null },
    });

    await logAiUsage({
      schoolId: request.schoolId,
      teacherUserId: request.user.sub,
      feature: "generation",
      model,
      durationMs: Date.now() - start,
    });

    return { data: updated, meta: {} };
  });

  // Stubbed until the Communication Hub (Phase 4) exists to actually deliver
  // to students/parents - records intent, no real delivery channel yet.
  app.post<{ Params: { id: string } }>("/generations/:id/distribute", { onRequest: scoped(app) }, async (request, reply) => {
    const generation = await prisma.generation.findFirst({
      where: { id: request.params.id, topic: { schoolId: request.schoolId } },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }
    app.log.info({ generationId: generation.id }, "Distribute requested - no Communication Hub delivery channel yet");
    return { data: { distributed: false, reason: "Communication Hub delivery not yet implemented" }, meta: {} };
  });
}
