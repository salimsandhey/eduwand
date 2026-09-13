import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";
import { authorizeForSchool } from "./academic-structure";

const VALID_APPLIES_TO = ["generation", "attainment_report"];
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

interface SaveTemplateBody {
  templateBody: string;
}

export async function schoolFormatTemplateRoutes(app: FastifyInstance) {
  app.get<{ Params: { schoolId: string } }>(
    "/schools/:schoolId/format-templates",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const templates = await prisma.schoolFormatTemplate.findMany({
        where: { schoolId: request.params.schoolId },
      });

      return {
        data: {
          generation: templates.find((t) => t.appliesTo === "generation") ?? null,
          attainmentReport: templates.find((t) => t.appliesTo === "attainment_report") ?? null,
        },
        meta: {},
      };
    }
  );

  app.put<{ Params: { schoolId: string; appliesTo: string }; Body: SaveTemplateBody }>(
    "/schools/:schoolId/format-templates/:appliesTo",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      if (!VALID_APPLIES_TO.includes(request.params.appliesTo)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `appliesTo must be one of ${VALID_APPLIES_TO.join(", ")}` },
        });
      }

      const body = request.body ?? ({} as SaveTemplateBody);
      if (!body.templateBody || !body.templateBody.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "templateBody is required" } });
      }

      const template = await prisma.schoolFormatTemplate.upsert({
        where: { schoolId_appliesTo: { schoolId: request.params.schoolId, appliesTo: request.params.appliesTo } },
        create: { schoolId: request.params.schoolId, appliesTo: request.params.appliesTo, templateBody: body.templateBody.trim() },
        update: { templateBody: body.templateBody.trim() },
      });

      return { data: template, meta: {} };
    }
  );

  app.delete<{ Params: { schoolId: string; appliesTo: string } }>(
    "/schools/:schoolId/format-templates/:appliesTo",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      await prisma.schoolFormatTemplate.deleteMany({
        where: { schoolId: request.params.schoolId, appliesTo: request.params.appliesTo },
      });

      return { data: { deleted: true }, meta: {} };
    }
  );

  // Presentation "School format" template branding - logo + brand colors.
  // Non-sensitive public branding (unlike a profile photo), so logoUrl is
  // stored/served as a plain public URL - no auth-gated file proxy needed.
  app.get<{ Params: { schoolId: string } }>(
    "/schools/:schoolId/branding",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const school = await prisma.school.findUnique({
        where: { id: request.params.schoolId },
        select: { logoUrl: true, primaryColor: true, secondaryColor: true },
      });
      return { data: school, meta: {} };
    }
  );

  // POST, not PUT - the shared multipart upload helper on the frontend
  // (unified-app's xhrRequest) is POST-only, same as every other file-upload
  // endpoint in this app (context sources, profile photo, submissions).
  app.post<{ Params: { schoolId: string } }>(
    "/schools/:schoolId/branding",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      let primaryColor: string | undefined;
      let secondaryColor: string | undefined;
      let logoLocation: string | undefined;

      if (request.isMultipart?.()) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const buffer = await part.toBuffer();
            const { location } = await storage.save(`school-branding/${request.params.schoolId}/${Date.now()}-${part.filename}`, buffer);
            logoLocation = location;
          } else if (part.fieldname === "primaryColor") {
            primaryColor = part.value as string;
          } else if (part.fieldname === "secondaryColor") {
            secondaryColor = part.value as string;
          }
        }
      } else {
        const body = (request.body ?? {}) as { primaryColor?: string; secondaryColor?: string };
        primaryColor = body.primaryColor;
        secondaryColor = body.secondaryColor;
      }

      if (primaryColor && !HEX_COLOR_RE.test(primaryColor)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "primaryColor must be a hex color like #4C4CE0" } });
      }
      if (secondaryColor && !HEX_COLOR_RE.test(secondaryColor)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "secondaryColor must be a hex color like #4C4CE0" } });
      }

      if (logoLocation) {
        const existing = await prisma.school.findUnique({ where: { id: request.params.schoolId }, select: { logoUrl: true } });
        if (existing?.logoUrl) await storage.remove(existing.logoUrl);
      }

      const updated = await prisma.school.update({
        where: { id: request.params.schoolId },
        data: {
          ...(logoLocation ? { logoUrl: logoLocation } : {}),
          ...(primaryColor ? { primaryColor } : {}),
          ...(secondaryColor ? { secondaryColor } : {}),
        },
        select: { logoUrl: true, primaryColor: true, secondaryColor: true },
      });

      return { data: updated, meta: {} };
    }
  );
}
