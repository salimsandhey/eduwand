import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

// Fixed admission document checklist (per-school configurability deferred).
// "other" covers anything outside this list.
const VALID_DOCUMENT_TYPES = [
  "student_photo",
  "birth_certificate",
  "transfer_certificate",
  "previous_marksheet",
  "id_proof",
  "address_proof",
  "other",
];

// Admission document collection (FR-EG-6) - one file per call, stored via the
// swappable Storage interface (backend/src/lib/storage.ts), same pattern as
// the CSV export files it already handles.
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

      // documentType rides alongside the file as a plain form field (see
      // student-portal.ts's photo-submission handler for the same pattern) -
      // request.file() alone only ever gives you the file part.
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
      if (documentType && !VALID_DOCUMENT_TYPES.includes(documentType)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `documentType must be one of ${VALID_DOCUMENT_TYPES.join(", ")}` },
        });
      }

      const key = `${request.schoolId}/documents/${enquiry.id}/${Date.now()}-${fileName}`;
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
