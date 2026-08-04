import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

const VALID_STATUSES = ["new", "contacted", "visit", "application", "admitted", "enrolled", "lost"];
const VALID_SOURCES = ["phone", "walk_in", "website", "referral", "event", "social"];

interface CreateEnquiryBody {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  source: string;
  gradeInterest?: string;
  notes?: string;
  ownerUserId?: string;
  consentCaptured?: boolean;
}

interface UpdateEnquiryBody {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  source?: string;
  gradeInterest?: string;
  notes?: string;
  ownerUserId?: string;
  consentCaptured?: boolean;
  status?: string;
  lostReason?: string;
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

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

// Duplicate detection (FR-EG-7): flags other, not-already-merged enquiries in the
// same school sharing the same contact phone number.
async function findPossibleDuplicates(schoolId: string, contactPhone: string, excludeId?: string) {
  return prisma.enquiry.findMany({
    where: {
      schoolId,
      contactPhone,
      duplicateOfEnquiryId: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, contactName: true, status: true, createdAt: true },
  });
}

export async function enquiryRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/enquiries",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { status, source, ownerUserId } = request.query;
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));

      if (status && !VALID_STATUSES.includes(status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${VALID_STATUSES.join(", ")}` },
        });
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
          notes: body.notes,
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

  app.get<{ Params: { id: string } }>(
    "/enquiries/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { stageHistory: { orderBy: { changedAt: "asc" } } },
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

      return { data: enquiry, meta: { possibleDuplicates } };
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

      if (body.status && !VALID_STATUSES.includes(body.status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${VALID_STATUSES.join(", ")}` },
        });
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
          notes: body.notes,
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
}
