import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

// Admin-editable key/value platform config. See Docs/superpowers/plans/2026-
// 09-09-individual-teacher-onboarding-and-credits.md - "individual_default_
// credits" backstops credit-grant resolution (lib/credits.ts) so the 5000
// figure is never hardcoded outside this seeded row.

interface UpsertPlatformSettingBody {
  value: string;
}

export async function platformSettingRoutes(app: FastifyInstance) {
  app.get(
    "/platform-settings",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async () => {
      const settings = await prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
      return { data: settings, meta: {} };
    }
  );

  app.put<{ Params: { key: string }; Body: UpsertPlatformSettingBody }>(
    "/platform-settings/:key",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const value = request.body?.value;
      if (value === undefined || value === null || value === "") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "value is required" } });
      }

      const setting = await prisma.platformSetting.upsert({
        where: { key: request.params.key },
        create: { key: request.params.key, value, updatedBy: request.user.sub },
        update: { value, updatedBy: request.user.sub },
      });

      return { data: setting, meta: {} };
    }
  );
}
