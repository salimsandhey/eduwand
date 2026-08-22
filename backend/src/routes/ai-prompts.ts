import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";
import { DEFAULT_OUTPUT_TYPE_INSTRUCTIONS, GenerationOutputType } from "../lib/ai";

const OUTPUT_TYPES = Object.keys(DEFAULT_OUTPUT_TYPE_INSTRUCTIONS) as GenerationOutputType[];

interface UpdatePromptBody {
  promptBody: string;
}

// Platform-wide (not school-scoped) - only platform_admin can see or change
// the instruction text sent to Gemini for each Generation.outputType. A
// missing AiPromptTemplate row means "using the built-in default" - the list
// endpoint always returns one entry per known outputType regardless of
// whether an override row exists, so the admin UI never has to reason about
// a partial/missing set.
export async function aiPromptRoutes(app: FastifyInstance) {
  app.get("/ai-prompts", { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] }, async () => {
    const overrides = await prisma.aiPromptTemplate.findMany();
    const byType = new Map(overrides.map((o) => [o.outputType, o]));

    const data = OUTPUT_TYPES.map((outputType) => {
      const override = byType.get(outputType);
      return {
        outputType,
        promptBody: override?.promptBody ?? DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType],
        defaultPromptBody: DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType],
        isCustom: Boolean(override),
        updatedAt: override?.updatedAt ?? null,
      };
    });

    return { data, meta: {} };
  });

  app.put<{ Params: { outputType: string }; Body: UpdatePromptBody }>(
    "/ai-prompts/:outputType",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const { outputType } = request.params;
      if (!OUTPUT_TYPES.includes(outputType as GenerationOutputType)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `outputType must be one of ${OUTPUT_TYPES.join(", ")}` },
        });
      }

      const body = request.body ?? ({} as UpdatePromptBody);
      if (!body.promptBody || !body.promptBody.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "promptBody is required" } });
      }

      const updated = await prisma.aiPromptTemplate.upsert({
        where: { outputType },
        create: { outputType, promptBody: body.promptBody.trim(), updatedByUserId: request.user.sub },
        update: { promptBody: body.promptBody.trim(), updatedByUserId: request.user.sub },
      });

      const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: request.user.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "ai_prompt.update",
        targetType: "AiPromptTemplate",
        targetId: updated.id,
        targetLabel: outputType,
      });

      return {
        data: {
          outputType,
          promptBody: updated.promptBody,
          defaultPromptBody: DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType as GenerationOutputType],
          isCustom: true,
          updatedAt: updated.updatedAt,
        },
        meta: {},
      };
    }
  );

  // Deletes the override row, not a "revert" - next generation call for this
  // outputType falls straight back to DEFAULT_OUTPUT_TYPE_INSTRUCTIONS.
  app.delete<{ Params: { outputType: string } }>(
    "/ai-prompts/:outputType",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const { outputType } = request.params;
      if (!OUTPUT_TYPES.includes(outputType as GenerationOutputType)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `outputType must be one of ${OUTPUT_TYPES.join(", ")}` },
        });
      }

      const existing = await prisma.aiPromptTemplate.findUnique({ where: { outputType } });
      if (existing) {
        await prisma.aiPromptTemplate.delete({ where: { outputType } });
        const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
        await recordAuditEvent({
          actorUserId: request.user.sub,
          actorEmail: actor?.email ?? "unknown",
          action: "ai_prompt.reset_to_default",
          targetType: "AiPromptTemplate",
          targetId: existing.id,
          targetLabel: outputType,
        });
      }

      return {
        data: {
          outputType,
          promptBody: DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType as GenerationOutputType],
          defaultPromptBody: DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType as GenerationOutputType],
          isCustom: false,
          updatedAt: null,
        },
        meta: {},
      };
    }
  );
}
