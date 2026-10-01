import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { Validator } from "../lib/validation";

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
      const v = new Validator();
      const value = v.note("value", request.body?.value, "Value", { required: true, max: 500 });
      // A setting that is currently a whole number (limits, credit grants) has to stay one.
      const current = await prisma.platformSetting.findUnique({ where: { key: request.params.key } });
      if (value !== undefined && current && /^\d+$/.test(current.value.trim())) {
        v.number("value", value, "Value", { required: true, integer: true, min: 0, max: 10_000_000 });
      }
      if (v.hasErrors || value === undefined) return v.reject(reply);

      const setting = await prisma.platformSetting.upsert({
        where: { key: request.params.key },
        create: { key: request.params.key, value, updatedBy: request.user.sub },
        update: { value, updatedBy: request.user.sub },
      });

      return { data: setting, meta: {} };
    }
  );
}
