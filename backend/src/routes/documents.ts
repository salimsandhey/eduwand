import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

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

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "A file is required" } });
      }

      const buffer = await file.toBuffer();
      const key = `${request.schoolId}/documents/${enquiry.id}/${Date.now()}-${file.filename}`;
      const { location } = await storage.save(key, buffer);

      const document = await prisma.document.create({
        data: {
          enquiryId: enquiry.id,
          uploadedByUserId: request.user.sub,
          fileName: file.filename,
          fileLocation: location,
          mimeType: file.mimetype,
          fileSize: buffer.length,
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
