import { FastifyInstance } from "fastify";
import { uploadKey } from "../lib/upload";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

// documentType is validated against the school's active document_checklist
// FormDefinition's field keys (Docs/Dev/GrowthEngine_Rebuild_Plan.md Phase 2),
// replacing the old hardcoded VALID_DOCUMENT_TYPES list so the checklist is
// per-school configurable. "other" is always accepted as a catch-all, same as
// before - this also keeps uploads working (instead of every non-"other" type
// 400ing) for the edge case where a school somehow has no active
// document_checklist FormDefinition (definition is null): every school should
// have one via seedDefaultFormDefinitions on creation (routes/schools.ts) plus
// the one-off backfill (prisma/backfill-form-definitions.ts) for schools that
// predate the form-builder feature, but a mid-request deactivation race or a
// future data issue would otherwise hard-fail all uploads for that school.
async function validDocumentTypeKeys(schoolId: string): Promise<Set<string>> {
  const definition = await prisma.formDefinition.findFirst({
    where: { schoolId, purpose: "document_checklist", isActive: true },
    include: { fields: { select: { key: true } } },
  });
  const keys = new Set(definition?.fields.map((f) => f.key) ?? []);
  keys.add("other");
  return keys;
}

export async function documentRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/enquiries/:id/documents",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      let fileBuffer: Buffer | null = null;
      let fileName = "";
      let mimeType = "";
      let documentType: string | undefined;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          fileBuffer = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        } else if (part.fieldname === "documentType") {
          documentType = part.value as string;
        }
      }

      if (!fileBuffer) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "A file is required" } });
      }
      if (documentType) {
        const validTypes = await validDocumentTypeKeys(request.schoolId);
        if (!validTypes.has(documentType)) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `documentType must be one of ${[...validTypes].join(", ")}` },
          });
        }
      }

      const key = uploadKey(`${request.schoolId}/documents/${enquiry.id}`, fileName);
      const { location } = await storage.save(key, fileBuffer);

      const document = await prisma.document.create({
        data: {
          enquiryId: enquiry.id,
          uploadedByUserId: request.user.sub,
          fileName,
          fileLocation: location,
          mimeType,
          fileSize: fileBuffer.length,
          documentType: documentType ?? "other",
        },
      });

      return reply.code(201).send({ data: document, meta: {} });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/enquiries/:id/documents",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      const documents = await prisma.document.findMany({
        where: { enquiryId: enquiry.id },
        orderBy: { uploadedAt: "desc" },
      });

      return { data: documents, meta: {} };
    }
  );
}
