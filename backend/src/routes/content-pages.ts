import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

// Platform-wide long-form pages (Privacy Policy, Terms of Service, About,
// Contact) - see ContentPage in schema.prisma. Reads are public and
// unauthenticated on purpose: Google Play/App Store need a working URL that
// works for a logged-out reviewer, and the mobile app's Legal screens and the
// admin-dashboard's public pages both render from this same source, so
// there's one place to edit a clause rather than three.
const KNOWN_KEYS = ["privacy_policy", "terms_of_service", "about", "contact"];

interface UpdateContentPageBody {
  title?: string;
  bodyMarkdown?: string;
  // Only meaningful for "contact" today ({ email, phone, whatsapp?, address,
  // hours? }) - every client renders those as tappable cards instead of
  // markdown when fields is present. null clears it back to plain text.
  fields?: Record<string, string> | null;
}

function isPlainStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === "string")
  );
}

export async function contentPageRoutes(app: FastifyInstance) {
  app.get("/content-pages", async () => {
    const pages = await prisma.contentPage.findMany({ orderBy: { key: "asc" } });
    return { data: pages, meta: {} };
  });

  app.get<{ Params: { key: string } }>("/content-pages/:key", async (request, reply) => {
    const page = await prisma.contentPage.findUnique({ where: { key: request.params.key } });
    if (!page) return reply.code(404).send({ data: null, error: { code: "not_found", message: "That page does not exist" } });
    return { data: page, meta: {} };
  });

  app.put<{ Params: { key: string }; Body: UpdateContentPageBody }>(
    "/content-pages/:key",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const key = request.params.key;
      if (!KNOWN_KEYS.includes(key)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: `key must be one of ${KNOWN_KEYS.join(", ")}` } });
      }
      const title = request.body?.title?.trim();
      const bodyMarkdown = request.body?.bodyMarkdown;
      if (!bodyMarkdown?.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "bodyMarkdown is required" } });
      }
      const fields = request.body?.fields;
      if (fields !== undefined && fields !== null && !isPlainStringRecord(fields)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "fields must be a flat object of strings" } });
      }

      const existing = await prisma.contentPage.findUnique({ where: { key } });
      const page = await prisma.contentPage.upsert({
        where: { key },
        create: { key, title: title || key, bodyMarkdown, fields: fields as Prisma.InputJsonValue, updatedBy: request.user.sub },
        // version increments on every real edit - a future "you must accept
        // the updated Terms" flow can compare against a per-user acceptedVersion.
        update: {
          ...(title ? { title } : {}),
          bodyMarkdown,
          // undefined (key omitted) leaves fields untouched; null clears it.
          ...(fields !== undefined ? { fields: (fields ?? Prisma.JsonNull) as Prisma.InputJsonValue } : {}),
          version: (existing?.version ?? 1) + 1,
          updatedBy: request.user.sub,
        },
      });
      return { data: page, meta: {} };
    }
  );
}
