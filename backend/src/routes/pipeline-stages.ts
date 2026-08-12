import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

interface CreateStageBody {
  key: string;
  label: string;
  isTerminal?: boolean;
  isConverted?: boolean;
}

interface UpdateStageBody {
  label?: string;
  order?: number;
  isTerminal?: boolean;
  isConverted?: boolean;
}

const KEY_PATTERN = /^[a-z0-9_]+$/;

// Configurable admissions pipeline (FR-EG-3). Read access is any school-scoped
// role (front_desk/counsellor/teacher on the Unified App need this list too,
// not just admin/leadership) - write access is admin/leadership only. No
// delete endpoint in v1: archiving a stage with live enquiries in it is a real
// product decision, not something to do silently.
export async function pipelineStageRoutes(app: FastifyInstance) {
  app.get(
    "/pipeline-stages",
    { onRequest: [app.authenticate, app.requireSchoolScope] },
    async (request) => {
      const stages = await prisma.pipelineStage.findMany({
        where: { schoolId: request.schoolId },
        orderBy: { order: "asc" },
      });
      return { data: stages, meta: {} };
    }
  );

  app.post<{ Body: CreateStageBody }>(
    "/pipeline-stages",
    { onRequest: [app.authenticate, app.requireSchoolScope, requireRoles("admin", "leadership")] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateStageBody);

      if (!body.key || !body.label) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "key and label are required" },
        });
      }
      if (!KEY_PATTERN.test(body.key)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "key must be lowercase letters, numbers, and underscores only" },
        });
      }

      const existing = await prisma.pipelineStage.findUnique({
        where: { schoolId_key: { schoolId: request.schoolId, key: body.key } },
      });
      if (existing) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "A stage with this key already exists" },
        });
      }

      const maxOrder = await prisma.pipelineStage.aggregate({
        where: { schoolId: request.schoolId },
        _max: { order: true },
      });

      const stage = await prisma.pipelineStage.create({
        data: {
          schoolId: request.schoolId,
          key: body.key,
          label: body.label,
          order: (maxOrder._max.order ?? 0) + 1,
          isTerminal: body.isTerminal ?? false,
          isConverted: body.isConverted ?? false,
        },
      });

      return reply.code(201).send({ data: stage, meta: {} });
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateStageBody }>(
    "/pipeline-stages/:id",
    { onRequest: [app.authenticate, app.requireSchoolScope, requireRoles("admin", "leadership")] },
    async (request, reply) => {
      const existing = await prisma.pipelineStage.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Pipeline stage not found" } });
      }

      const body = request.body ?? {};
      const stage = await prisma.pipelineStage.update({
        where: { id: existing.id },
        data: {
          label: body.label ?? undefined,
          order: body.order ?? undefined,
          isTerminal: body.isTerminal ?? undefined,
          isConverted: body.isConverted ?? undefined,
        },
      });

      return { data: stage, meta: {} };
    }
  );
}
