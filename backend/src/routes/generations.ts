import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage, GenerationOutputType } from "../lib/ai";
import { hasSufficientCredits, getFeatureCost } from "../lib/credits";
import { ContextSource } from "@prisma/client";

const MAX_CONTEXT_CHARS_FOR_PROMPT = 12000;

function buildContextText(contextSources: ContextSource[]): { contextText: string | null; usedSources: ContextSource[] } {
  const usedSources = contextSources.filter((s) => s.extractionStatus === "extracted" && s.extractedText);
  if (usedSources.length === 0) {
    return { contextText: null, usedSources: [] };
  }
  const combined = usedSources.map((s) => s.extractedText).join("\n\n---\n\n").slice(0, MAX_CONTEXT_CHARS_FOR_PROMPT);
  return { contextText: combined, usedSources };
}

async function getSchoolFormatTemplate(schoolId: string) {
  return prisma.schoolFormatTemplate.findUnique({
    where: { schoolId_appliesTo: { schoolId, appliesTo: "generation" } },
  });
}

const VALID_OUTPUT_TYPES: GenerationOutputType[] = [
  "lesson_plan",
  "custom_activity_report",
  "flashcards",
  "presentation",
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
        include: { classSection: true, contextSources: true },
      });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const { contextText, usedSources } = buildContextText(topic.contextSources);
      const formatTemplate = await getSchoolFormatTemplate(request.schoolId);

      const classCount = body.classCount ?? 1;
      const minutesPerClass = body.minutesPerClass ?? 45;
      if (classCount > 10 || minutesPerClass > 90) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "classCount must be <= 10 and minutesPerClass <= 90" },
        });
      }

      if (!(await hasSufficientCredits(request.user.sub, getFeatureCost("generation")))) {
        return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to generate this content" } });
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
          contextText,
          schoolFormatInstructions: formatTemplate?.templateBody ?? null,
        });
        content = result.content;
        model = result.model;
      } catch (err) {
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
          include: { contextSources: true },
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
          contextSources: { connect: usedSources.map((s) => ({ id: s.id })) },
          schoolFormatTemplateId: formatTemplate?.id ?? null,
        },
        include: {
          contextSources: true,
          topic: { select: { name: true, subject: true, board: true, classSection: { select: { className: true, sectionName: true } } } },
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
      include: {
        contextSources: true,
        topic: { select: { name: true, subject: true, board: true, classSection: { select: { className: true, sectionName: true } } } },
      },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }
    return { data: generation, meta: {} };
  });

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
        include: { contextSources: true },
      });

      return { data: updated, meta: {} };
    }
  );

  app.post<{ Params: { id: string } }>("/generations/:id/retry", { onRequest: scoped(app) }, async (request, reply) => {
    const generation = await prisma.generation.findFirst({
      where: { id: request.params.id, topic: { schoolId: request.schoolId } },
      include: { topic: { include: { classSection: true, contextSources: true } } },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }

    const { contextText, usedSources } = buildContextText(generation.topic.contextSources);
    const formatTemplate = await getSchoolFormatTemplate(request.schoolId);

    if (!(await hasSufficientCredits(request.user.sub, getFeatureCost("generation")))) {
      return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to retry this generation" } });
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
      contextText,
      schoolFormatInstructions: formatTemplate?.templateBody ?? null,
    });

    const updated = await prisma.generation.update({
      where: { id: generation.id },
      data: {
        aiOutput: content,
        modelUsed: model,
        generationStatus: "succeeded",
        editedOutput: null,
        contextSources: { set: usedSources.map((s) => ({ id: s.id })) },
        schoolFormatTemplateId: formatTemplate?.id ?? null,
      },
      include: {
        contextSources: true,
        topic: { select: { name: true, subject: true, board: true, classSection: { select: { className: true, sectionName: true } } } },
      },
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

  // Publishing/unpublishing is what actually gates /student/materials - see
  // shareStatus on the Generation model. This is distinct from a future
  // "push to Communication Hub" delivery feature, which doesn't exist yet.
  app.post<{ Params: { id: string } }>("/generations/:id/publish", { onRequest: scoped(app) }, async (request, reply) => {
    const generation = await prisma.generation.findFirst({
      where: { id: request.params.id, topic: { schoolId: request.schoolId } },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }
    if (generation.generationStatus !== "succeeded") {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Only a succeeded generation can be shared with students" } });
    }
    const updated = await prisma.generation.update({
      where: { id: generation.id },
      data: { shareStatus: "published", publishedAt: new Date() },
      include: { contextSources: true },
    });
    return { data: updated, meta: {} };
  });

  app.post<{ Params: { id: string } }>("/generations/:id/unpublish", { onRequest: scoped(app) }, async (request, reply) => {
    const generation = await prisma.generation.findFirst({
      where: { id: request.params.id, topic: { schoolId: request.schoolId } },
    });
    if (!generation) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Generation not found" } });
    }
    const updated = await prisma.generation.update({
      where: { id: generation.id },
      data: { shareStatus: "draft", publishedAt: null },
      include: { contextSources: true },
    });
    return { data: updated, meta: {} };
  });
}
