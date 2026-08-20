import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { authorizeForSchool } from "./academic-structure";

const VALID_APPLIES_TO = ["generation", "attainment_report"];

interface SaveTemplateBody {
  templateBody: string;
}

// One template per (school, appliesTo) - "standardised across the
// institution" (client build doc) means a single school-wide format, not a
// list a teacher picks from. appliesTo: "generation" is consumed by
// backend/src/routes/generations.ts today; "attainment_report" is stored but
// not applied anywhere yet, since PDF export doesn't exist (still 501).
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
}
