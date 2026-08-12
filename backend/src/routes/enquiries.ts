import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { findPossibleDuplicates, buildActivityFeed } from "../lib/enquiries";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";

const VALID_SOURCES = ["phone", "walk_in", "website", "referral", "event", "social"];

// Pipeline stages are configurable per school (FR-EG-3, backend/src/routes/pipeline-stages.ts)
// rather than a fixed enum, so status validation looks up the school's own stage keys.
async function validStatusKeys(schoolId: string): Promise<Set<string>> {
  const stages = await prisma.pipelineStage.findMany({ where: { schoolId }, select: { key: true } });
  return new Set(stages.map((s) => s.key));
}

interface CreateEnquiryBody {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  source: string;
  gradeInterest?: string;
  ownerUserId?: string;
  consentCaptured?: boolean;
}

interface UpdateEnquiryBody {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  source?: string;
  gradeInterest?: string;
  ownerUserId?: string;
  consentCaptured?: boolean;
  status?: string;
  lostReason?: string;
}

interface CreateNoteBody {
  body: string;
}

interface ListQuery {
  status?: string;
  source?: string;
  ownerUserId?: string;
  page?: string;
  pageSize?: string;
}

interface MergeBody {
  sourceEnquiryId: string;
}

interface ConfirmAdmissionBody {
  fullName?: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName?: string;
  guardianContact?: string;
  admissionDate: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

export async function enquiryRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/enquiries",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { status, source, ownerUserId } = request.query;
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));

      if (status) {
        const validStatuses = await validStatusKeys(request.schoolId);
        if (!validStatuses.has(status)) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `status must be one of ${[...validStatuses].join(", ")}` },
          });
        }
      }
      if (source && !VALID_SOURCES.includes(source)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `source must be one of ${VALID_SOURCES.join(", ")}` },
        });
      }

      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ...(status ? { status } : {}),
        ...(source ? { source } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
      };

      const [items, totalCount] = await Promise.all([
        prisma.enquiry.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.enquiry.count({ where }),
      ]);

      return {
        data: items,
        meta: { page, pageSize, totalCount },
      };
    }
  );

  app.post<{ Body: CreateEnquiryBody }>(
    "/enquiries",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateEnquiryBody);

      if (!body.contactName || !body.contactPhone || !body.source) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "contactName, contactPhone, and source are required" },
        });
      }

      if (!VALID_SOURCES.includes(body.source)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `source must be one of ${VALID_SOURCES.join(", ")}` },
        });
      }

      const enquiry = await prisma.enquiry.create({
        data: {
          schoolId: request.schoolId,
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail,
          source: body.source,
          gradeInterest: body.gradeInterest,
          ownerUserId: body.ownerUserId ?? request.user.sub,
          consentCaptured: body.consentCaptured ?? false,
          status: "new",
        },
      });

      await prisma.enquiryStageHistory.create({
        data: {
          enquiryId: enquiry.id,
          fromStatus: null,
          toStatus: "new",
          changedByUserId: request.user.sub,
        },
      });

      const possibleDuplicates = await findPossibleDuplicates(request.schoolId, enquiry.contactPhone, enquiry.id);

      return reply.code(201).send({ data: enquiry, meta: { possibleDuplicates } });
    }
  );

  // Bulk intake for event/expo enquiries (FR-EG-2). The client parses the
  // picked CSV into rows itself and posts them as JSON - per-row errors are
  // reported back rather than failing the whole batch on one bad row.
  app.post<{ Body: { rows: CreateEnquiryBody[] } }>(
    "/enquiries/bulk",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const rows = request.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "rows must be a non-empty array" },
        });
      }
      if (rows.length > 500) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "A single bulk upload is capped at 500 rows" },
        });
      }

      const errors: { row: number; message: string }[] = [];
      let createdCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] ?? ({} as CreateEnquiryBody);
        const rowNumber = i + 1;

        if (!row.contactName || !row.contactPhone || !row.source) {
          errors.push({ row: rowNumber, message: "contactName, contactPhone, and source are required" });
          continue;
        }
        if (!VALID_SOURCES.includes(row.source)) {
          errors.push({ row: rowNumber, message: `source must be one of ${VALID_SOURCES.join(", ")}` });
          continue;
        }

        const enquiry = await prisma.enquiry.create({
          data: {
            schoolId: request.schoolId,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            contactEmail: row.contactEmail,
            source: row.source,
            gradeInterest: row.gradeInterest,
            ownerUserId: row.ownerUserId ?? request.user.sub,
            consentCaptured: row.consentCaptured ?? false,
            status: "new",
          },
        });
        await prisma.enquiryStageHistory.create({
          data: { enquiryId: enquiry.id, fromStatus: null, toStatus: "new", changedByUserId: request.user.sub },
        });
        createdCount += 1;
      }

      return reply.code(201).send({ data: { createdCount, errors }, meta: {} });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/enquiries/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: {
          stageHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { fullName: true } } } },
          notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { fullName: true } } } },
          followUpTasks: { orderBy: { createdAt: "asc" }, include: { assignedTo: { select: { fullName: true } } } },
        },
      });

      if (!enquiry) {
        return reply.code(404).send({
          data: null,
          error: { code: "not_found", message: "Enquiry not found" },
        });
      }

      const possibleDuplicates = enquiry.duplicateOfEnquiryId
        ? []
        : await findPossibleDuplicates(request.schoolId, enquiry.contactPhone, enquiry.id);

      const activity = buildActivityFeed(enquiry);

      return { data: { ...enquiry, activity }, meta: { possibleDuplicates } };
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateEnquiryBody }>(
    "/enquiries/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const existing = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });

      if (!existing) {
        return reply.code(404).send({
          data: null,
          error: { code: "not_found", message: "Enquiry not found" },
        });
      }

      const body = request.body ?? {};

      if (body.status) {
        const validStatuses = await validStatusKeys(request.schoolId);
        if (!validStatuses.has(body.status)) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `status must be one of ${[...validStatuses].join(", ")}` },
          });
        }
      }

      if (body.status === "lost" && !body.lostReason && !existing.lostReason) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "lostReason is required when status is lost" },
        });
      }

      const statusChanged = body.status !== undefined && body.status !== existing.status;

      const updated = await prisma.enquiry.update({
        where: { id: existing.id },
        data: {
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          contactEmail: body.contactEmail,
          source: body.source,
          gradeInterest: body.gradeInterest,
          ownerUserId: body.ownerUserId,
          consentCaptured: body.consentCaptured,
          status: body.status,
          lostReason: body.lostReason,
        },
      });

      if (statusChanged) {
        await prisma.enquiryStageHistory.create({
          data: {
            enquiryId: existing.id,
            fromStatus: existing.status,
            toStatus: updated.status,
            changedByUserId: request.user.sub,
          },
        });
      }

      return { data: updated, meta: {} };
    }
  );

  app.post<{ Params: { id: string }; Body: CreateNoteBody }>(
    "/enquiries/:id/notes",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body?.body?.trim();

      if (!body) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "body is required" },
        });
      }

      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });

      if (!enquiry) {
        return reply.code(404).send({
          data: null,
          error: { code: "not_found", message: "Enquiry not found" },
        });
      }

      const note = await prisma.enquiryNote.create({
        data: {
          enquiryId: enquiry.id,
          authorUserId: request.user.sub,
          body,
        },
        include: { author: { select: { fullName: true } } },
      });

      return reply.code(201).send({ data: note, meta: {} });
    }
  );

  app.post<{ Params: { id: string }; Body: MergeBody }>(
    "/enquiries/:id/merge",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const sourceEnquiryId = request.body?.sourceEnquiryId;

      if (!sourceEnquiryId) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "sourceEnquiryId is required" },
        });
      }

      if (sourceEnquiryId === request.params.id) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "An enquiry cannot be merged into itself" },
        });
      }

      const [target, source] = await Promise.all([
        prisma.enquiry.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } }),
        prisma.enquiry.findFirst({ where: { id: sourceEnquiryId, schoolId: request.schoolId } }),
      ]);

      if (!target || !source) {
        return reply.code(404).send({
          data: null,
          error: { code: "not_found", message: "Enquiry not found" },
        });
      }

      if (target.duplicateOfEnquiryId) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Cannot merge into an enquiry that is itself already merged" },
        });
      }

      if (source.duplicateOfEnquiryId) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Source enquiry is already merged" },
        });
      }

      const updatedSource = await prisma.enquiry.update({
        where: { id: source.id },
        data: { duplicateOfEnquiryId: target.id },
      });

      return { data: updatedSource, meta: {} };
    }
  );

  // DPDP right-to-erasure (FR-EG-9) - anonymize, don't hard-delete: status,
  // source, timestamps, and stage history are untouched so funnel/counsellor
  // analytics counts stay historically accurate. Uploaded documents are the
  // one thing actually deleted (they're the highest-sensitivity PII on file).
  app.post<{ Params: { id: string } }>(
    "/enquiries/:id/erase",
    { onRequest: [...scoped(app), requireRoles("admin", "leadership")] },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { documents: true, studentStub: true },
      });
      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }
      if (enquiry.erasedAt) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "This enquiry has already been erased" },
        });
      }

      for (const doc of enquiry.documents) {
        await storage.remove(doc.fileLocation);
      }
      await prisma.document.deleteMany({ where: { enquiryId: enquiry.id } });
      await prisma.enquiryNote.updateMany({ where: { enquiryId: enquiry.id }, data: { body: "[redacted]" } });

      if (enquiry.studentStub) {
        await prisma.studentStub.update({
          where: { id: enquiry.studentStub.id },
          data: { fullName: "Redacted", guardianName: "Redacted", guardianContact: "REDACTED" },
        });
      }

      const updated = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          contactName: "Redacted",
          contactPhone: "REDACTED",
          contactEmail: null,
          erasedAt: new Date(),
        },
      });

      return { data: updated, meta: {} };
    }
  );

  app.post<{ Params: { id: string }; Body: ConfirmAdmissionBody }>(
    "/enquiries/:id/confirm-admission",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as ConfirmAdmissionBody);

      if (!body.dateOfBirth || !body.classSectionId || !body.admissionDate) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "dateOfBirth, classSectionId, and admissionDate are required" },
        });
      }

      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { studentStub: true },
      });

      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      if (enquiry.duplicateOfEnquiryId) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Cannot confirm admission for a merged/duplicate enquiry" },
        });
      }

      if (enquiry.studentStub) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "This enquiry has already been admitted" },
        });
      }

      const classSection = await prisma.classSection.findFirst({
        where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
      });

      if (!classSection) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
      }

      const [studentStub] = await prisma.$transaction([
        prisma.studentStub.create({
          data: {
            schoolId: request.schoolId,
            sourceEnquiryId: enquiry.id,
            fullName: body.fullName ?? enquiry.contactName,
            dateOfBirth: new Date(body.dateOfBirth),
            classSectionId: classSection.id,
            guardianName: body.guardianName ?? enquiry.contactName,
            guardianContact: body.guardianContact ?? enquiry.contactPhone,
            admissionDate: new Date(body.admissionDate),
          },
        }),
        prisma.enquiry.update({ where: { id: enquiry.id }, data: { status: "admitted" } }),
        prisma.enquiryStageHistory.create({
          data: {
            enquiryId: enquiry.id,
            fromStatus: enquiry.status,
            toStatus: "admitted",
            changedByUserId: request.user.sub,
          },
        }),
      ]);

      return reply.code(201).send({ data: studentStub, meta: {} });
    }
  );
}
