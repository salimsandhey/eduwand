import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";

interface CreateTrustBody {
  name: string;
  contactEmail?: string;
}

interface UpdateTrustBody {
  name?: string;
  contactEmail?: string;
  status?: string;
}

const TRUST_STATUSES = ["active", "suspended"];

// Onboarding a brand-new client: only platform_admin (internal EduWand/Fovea ops,
// not tied to any school) can create a trust. There is no self-serve signup - a
// school doesn't register itself, per how this product is actually sold (see
// Docs/Dev/EduWand_Engineering_PRD.md).
export async function trustRoutes(app: FastifyInstance) {
  app.get(
    "/trusts",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async () => {
      const trusts = await prisma.trust.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      });
      return { data: trusts, meta: {} };
    }
  );

  app.post<{ Body: CreateTrustBody }>(
    "/trusts",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateTrustBody);

      if (!body.name) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "name is required" },
        });
      }

      const trust = await prisma.trust.create({
        data: { name: body.name, contactEmail: body.contactEmail, status: "active" },
      });

      return reply.code(201).send({ data: trust, meta: {} });
    }
  );

  // platform_admin can view any trust; leadership can view (read-only) their own -
  // they land here from Onboarding/UsersPage links to see their trust's schools.
  app.get<{ Params: { id: string } }>(
    "/trusts/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const caller = request.user;
      if (caller.role !== PLATFORM_ADMIN_ROLE && !(caller.role === "leadership" && caller.trustId === request.params.id)) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized to view this trust" } });
      }

      const trust = await prisma.trust.findUnique({
        where: { id: request.params.id },
        include: { schools: { select: { id: true, name: true, board: true, status: true }, orderBy: { name: "asc" } } },
      });
      if (!trust) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }
      return { data: trust, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateTrustBody }>(
    "/trusts/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdateTrustBody);

      if (body.status && !TRUST_STATUSES.includes(body.status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${TRUST_STATUSES.join(", ")}` },
        });
      }

      const existing = await prisma.trust.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }

      const trust = await prisma.trust.update({
        where: { id: request.params.id },
        data: {
          name: body.name ?? undefined,
          contactEmail: body.contactEmail ?? undefined,
          status: body.status ?? undefined,
        },
      });

      if (body.status && body.status !== existing.status) {
        const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
        await recordAuditEvent({
          actorUserId: request.user.sub,
          actorEmail: actor?.email ?? "unknown",
          action: "trust.status_change",
          targetType: "Trust",
          targetId: trust.id,
          targetLabel: trust.name,
          trustId: trust.id,
          metadata: { from: existing.status, to: trust.status },
        });
      }

      return { data: trust, meta: {} };
    }
  );

  // Hard delete - only safe while the trust has no schools (school.trust_id is
  // ON DELETE RESTRICT). Checked explicitly here for a friendly error instead
  // of surfacing a raw Postgres foreign-key violation to the admin.
  app.delete<{ Params: { id: string } }>(
    "/trusts/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const existing = await prisma.trust.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { schools: true } } },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }
      if (existing._count.schools > 0) {
        return reply.code(409).send({
          data: null,
          error: {
            code: "has_dependents",
            message: `This trust still has ${existing._count.schools} school(s). Delete or move them first.`,
          },
        });
      }

      await prisma.trust.delete({ where: { id: request.params.id } });

      const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: request.user.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "trust.delete",
        targetType: "Trust",
        targetId: existing.id,
        targetLabel: existing.name,
      });

      return { data: { deleted: true }, meta: {} };
    }
  );
}
