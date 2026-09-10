import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

// Billing plans, attached at Trust level (Trust.planId). See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

interface CreatePlanBody {
  name: string;
  creditsPerTeacherSeat: number;
  isDefault?: boolean;
}

interface UpdatePlanBody {
  name?: string;
  creditsPerTeacherSeat?: number;
  isDefault?: boolean;
}

export async function planRoutes(app: FastifyInstance) {
  app.get(
    "/plans",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async () => {
      const plans = await prisma.plan.findMany({ orderBy: { name: "asc" } });
      return { data: plans, meta: {} };
    }
  );

  app.post<{ Body: CreatePlanBody }>(
    "/plans",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreatePlanBody);
      const name = body.name?.trim();
      if (!name || !Number.isFinite(body.creditsPerTeacherSeat) || body.creditsPerTeacherSeat < 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "name and a non-negative creditsPerTeacherSeat are required" },
        });
      }

      const plan = await prisma.$transaction(async (tx) => {
        if (body.isDefault) {
          await tx.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.plan.create({
          data: { name, creditsPerTeacherSeat: Math.round(body.creditsPerTeacherSeat), isDefault: !!body.isDefault },
        });
      });

      return reply.code(201).send({ data: plan, meta: {} });
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdatePlanBody }>(
    "/plans/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const existing = await prisma.plan.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Plan not found" } });
      }

      const body = request.body ?? ({} as UpdatePlanBody);
      if (body.creditsPerTeacherSeat !== undefined && (!Number.isFinite(body.creditsPerTeacherSeat) || body.creditsPerTeacherSeat < 0)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "creditsPerTeacherSeat must be a non-negative number" } });
      }

      const plan = await prisma.$transaction(async (tx) => {
        if (body.isDefault) {
          await tx.plan.updateMany({ where: { isDefault: true, id: { not: existing.id } }, data: { isDefault: false } });
        }
        return tx.plan.update({
          where: { id: existing.id },
          data: {
            name: body.name?.trim() ?? undefined,
            creditsPerTeacherSeat: body.creditsPerTeacherSeat !== undefined ? Math.round(body.creditsPerTeacherSeat) : undefined,
            isDefault: body.isDefault ?? undefined,
          },
        });
      });

      return { data: plan, meta: {} };
    }
  );
}
