import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { Validator } from "../lib/validation";

// Billing plans, attached at Trust level (Trust.planId). See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

interface CreatePlanBody {
  name: string;
  creditsPerTeacherSeat: number;
  teacherSeatLimit: number;
  isDefault?: boolean;
}

interface UpdatePlanBody {
  name?: string;
  creditsPerTeacherSeat?: number;
  teacherSeatLimit?: number;
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
      const v = new Validator();
      const name = v.label("name", body.name, "Plan name", true, 60);
      const credits = v.number("creditsPerTeacherSeat", body.creditsPerTeacherSeat, "Credits per teacher seat", { required: true, integer: true, min: 0, max: 10_000_000 });
      const seats = v.number("teacherSeatLimit", body.teacherSeatLimit, "Teacher seat limit", { required: true, integer: true, min: 1, max: 100_000 });
      if (v.hasErrors || !name || credits === undefined || seats === undefined) return v.reject(reply);

      const plan = await prisma.$transaction(async (tx) => {
        if (body.isDefault) {
          await tx.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.plan.create({
          data: {
            name,
            creditsPerTeacherSeat: credits,
            teacherSeatLimit: seats,
            isDefault: !!body.isDefault,
          },
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
      const v = new Validator();
      const updatedName = body.name !== undefined ? v.label("name", body.name, "Plan name", true, 60) : undefined;
      const updatedCredits = body.creditsPerTeacherSeat !== undefined ? v.number("creditsPerTeacherSeat", body.creditsPerTeacherSeat, "Credits per teacher seat", { required: true, integer: true, min: 0, max: 10_000_000 }) : undefined;
      const updatedSeats = body.teacherSeatLimit !== undefined ? v.number("teacherSeatLimit", body.teacherSeatLimit, "Teacher seat limit", { required: true, integer: true, min: 1, max: 100_000 }) : undefined;
      if (v.hasErrors) return v.reject(reply);

      const plan = await prisma.$transaction(async (tx) => {
        if (body.isDefault) {
          await tx.plan.updateMany({ where: { isDefault: true, id: { not: existing.id } }, data: { isDefault: false } });
        }
        return tx.plan.update({
          where: { id: existing.id },
          data: {
            name: updatedName,
            creditsPerTeacherSeat: updatedCredits,
            teacherSeatLimit: updatedSeats,
            isDefault: body.isDefault ?? undefined,
          },
        });
      });

      return { data: plan, meta: {} };
    }
  );
}
