import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";

// platform_admin editing of the AiFeature table - what each AI feature costs
// (lib/credits.ts getFeatureCost charges from it) and how it's named on the
// teacher's Credits screen. Rows are created by migration only; there is no
// create/delete here, since a feature key only exists if code charges for it.

interface UpdateAiFeatureBody {
  label?: string;
  description?: string;
  cost?: number;
  showOnCredits?: boolean;
  sortOrder?: number;
}

export async function aiFeatureRoutes(app: FastifyInstance) {
  app.get(
    "/ai-features",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async () => {
      const features = await prisma.aiFeature.findMany({ orderBy: { sortOrder: "asc" } });
      return { data: features, meta: {} };
    }
  );

  app.patch<{ Params: { key: string }; Body: UpdateAiFeatureBody }>(
    "/ai-features/:key",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? {};
      const data: UpdateAiFeatureBody = {};

      if (body.label !== undefined) {
        if (!body.label.trim()) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: "label cannot be empty" } });
        }
        data.label = body.label.trim();
      }
      if (body.description !== undefined) data.description = body.description.trim();
      if (body.cost !== undefined) {
        if (!Number.isInteger(body.cost) || body.cost < 0) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: "cost must be a whole number of 0 or more" } });
        }
        data.cost = body.cost;
      }
      if (body.showOnCredits !== undefined) data.showOnCredits = !!body.showOnCredits;
      if (body.sortOrder !== undefined) {
        if (!Number.isInteger(body.sortOrder)) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: "sortOrder must be a whole number" } });
        }
        data.sortOrder = body.sortOrder;
      }

      const existing = await prisma.aiFeature.findUnique({ where: { key: request.params.key } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "AI feature not found" } });
      }

      const updated = await prisma.aiFeature.update({
        where: { key: request.params.key },
        data: { ...data, updatedBy: request.user.sub },
      });

      // A cost change is a billing change for every teacher - worth a trail.
      if (data.cost !== undefined && data.cost !== existing.cost) {
        const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
        await recordAuditEvent({
          actorUserId: request.user.sub,
          actorEmail: actor?.email ?? "unknown",
          action: "ai_feature.cost_update",
          targetType: "AiFeature",
          targetId: updated.id,
          targetLabel: existing.key,
          metadata: { from: existing.cost, to: data.cost },
        });
      }

      return { data: updated, meta: {} };
    }
  );
}
