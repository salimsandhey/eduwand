import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface CreateTrustBody {
  name: string;
  contactEmail?: string;
}

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
}
