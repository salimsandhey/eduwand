import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { Validator } from "../lib/validation";
import { recordAuditEvent } from "../lib/audit";

// Where the mobile app can be downloaded. Platform admins set the two store
// links in the dashboard (Settings, App download links); the public website
// reads them from the public endpoint and shows a button for each one that is
// set. Stored as two PlatformSetting rows; an empty value means "not live yet".

const PLAY_KEY = "play_store_url";
const APP_KEY = "app_store_url";

interface AppLinksBody {
  playStoreUrl?: string;
  appStoreUrl?: string;
}

async function readLinks() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [PLAY_KEY, APP_KEY] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value.trim()]));
  return { playStoreUrl: byKey.get(PLAY_KEY) ?? "", appStoreUrl: byKey.get(APP_KEY) ?? "" };
}

export async function appLinkRoutes(app: FastifyInstance) {
  app.get("/public/app-links", async () => ({ data: await readLinks(), meta: {} }));

  app.put<{ Body: AppLinksBody }>(
    "/app-links",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? {};
      const v = new Validator();
      // Empty clears the link (the website then hides that button).
      const playStoreUrl = v.url("playStoreUrl", body.playStoreUrl ?? "", false, "Play Store link") ?? "";
      const appStoreUrl = v.url("appStoreUrl", body.appStoreUrl ?? "", false, "App Store link") ?? "";
      if (v.hasErrors) return v.reject(reply);

      for (const [key, value] of [[PLAY_KEY, playStoreUrl], [APP_KEY, appStoreUrl]] as const) {
        await prisma.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: request.user.sub },
          update: { value, updatedBy: request.user.sub },
        });
      }

      const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: request.user.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "app_links.update",
        targetType: "platform_setting",
        targetLabel: "App download links",
        metadata: { playStoreUrl, appStoreUrl },
      });

      return { data: { playStoreUrl, appStoreUrl }, meta: {} };
    }
  );
}
