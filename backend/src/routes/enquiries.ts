import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { findPossibleDuplicates, buildActivityFeed, admissionCompletionPercent } from "../lib/enquiries";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";

const VALID_SOURCES = ["phone", "walk_in", "website", "referral", "event", "social"];
const VALID_NOTE_TYPES = ["lead_note", "admission_note", "system_note"];
const VALID_GUARDIAN_RELATIONS = ["mother", "father", "guardian", "other"];
// Mirrors the unified-app EnquiryDetailScreen's Admission-tab unlock gate -
// see the ADMISSION_STAGE_KEYS comment in lib/enquiries.ts for the caveat
// about custom per-school stage keys.
const ADMISSION_UNLOCKED_STATUSES = new Set(["application", "admitted", "enrolled"]);

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
  studentName?: string;
  studentDateOfBirth?: string;
  guardianRelation?: string;
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
  studentName?: string;
  studentDateOfBirth?: string;
  guardianRelation?: string;
}

interface CreateNoteBody {
  body: string;
  type?: string;
}

interface AdmissionDraftBody {
  fullName?: string;
  dateOfBirth?: string;
  classSectionId?: string;
  guardianName?: string;
  guardianContact?: string;
  admissionDate?: string;
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
  dateOfBirth?: string;
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

      if (body.guardianRelation && !VALID_GUARDIAN_RELATIONS.includes(body.guardianRelation)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `guardianRelation must be one of ${VALID_GUARDIAN_RELATIONS.join(", ")}` },
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
          studentName: body.studentName,
          studentDateOfBirth: body.studentDateOfBirth ? new Date(body.studentDateOfBirth) : undefined,
          guardianRelation: body.guardianRelation,
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
          studentStub: { select: { id: true } },
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

      const currentStage = await prisma.pipelineStage.findFirst({
        where: { schoolId: request.schoolId, key: enquiry.status },
        select: { key: true, label: true, order: true, isTerminal: true, isConverted: true },
      });

      const pipeline = {
        status: enquiry.status,
        stage: currentStage ?? null,
      };

      const followUpSummary = {
        total: enquiry.followUpTasks.length,
        pending: enquiry.followUpTasks.filter((t) => t.status === "pending").length,
        sent: enquiry.followUpTasks.filter((t) => t.status === "sent").length,
        overdue: enquiry.followUpTasks.filter((t) => t.status === "pending" && t.dueAt < new Date()).length,
      };

      const admissionSummary = {
        unlocked: ADMISSION_UNLOCKED_STATUSES.has(enquiry.status),
        confirmed: enquiry.studentStub !== null,
        studentStubId: enquiry.studentStub?.id ?? null,
        startedAt: enquiry.admissionStartedAt,
        completedAt: enquiry.admissionCompletedAt,
        completionPercent: admissionCompletionPercent(enquiry.admissionDraft as Record<string, unknown> | null),
      };

      return { data: { ...enquiry, activity, pipeline, followUpSummary, admissionSummary }, meta: { possibleDuplicates } };
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

      if (body.guardianRelation && !VALID_GUARDIAN_RELATIONS.includes(body.guardianRelation)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `guardianRelation must be one of ${VALID_GUARDIAN_RELATIONS.join(", ")}` },
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
          studentName: body.studentName,
          studentDateOfBirth: body.studentDateOfBirth ? new Date(body.studentDateOfBirth) : undefined,
          guardianRelation: body.guardianRelation,
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
      const type = request.body?.type ?? "lead_note";

      if (!body) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "body is required" },
        });
      }

      if (!VALID_NOTE_TYPES.includes(type)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `type must be one of ${VALID_NOTE_TYPES.join(", ")}` },
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
          type,
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

  // Admission-in-progress state, read before the final confirm-admission call
  // that creates the StudentStub. completionPercent scores the draft against
  // the fields the Admission tab's form collects (lib/enquiries.ts).
  app.get<{ Params: { id: string } }>(
    "/enquiries/:id/admission",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { studentStub: true },
      });

      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      const draft = enquiry.admissionDraft as Record<string, unknown> | null;

      return {
        data: {
          unlocked: ADMISSION_UNLOCKED_STATUSES.has(enquiry.status),
          confirmed: enquiry.studentStub !== null,
          draft,
          studentStub: enquiry.studentStub,
          startedAt: enquiry.admissionStartedAt,
          completedAt: enquiry.admissionCompletedAt,
          completionPercent: admissionCompletionPercent(draft),
        },
        meta: {},
      };
    }
  );

  // Merges partial admission-form fields into the draft as the counsellor fills
  // them in, ahead of the final POST confirm-admission. Rejects once admission
  // is already confirmed - the StudentStub, not the draft, is authoritative past
  // that point.
  app.patch<{ Params: { id: string }; Body: AdmissionDraftBody }>(
    "/enquiries/:id/admission-draft",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { studentStub: { select: { id: true } } },
      });

      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      if (enquiry.studentStub) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Admission is already confirmed for this enquiry" },
        });
      }

      const body = request.body ?? ({} as AdmissionDraftBody);
      const existingDraft = (enquiry.admissionDraft as Record<string, unknown> | null) ?? {};
      const mergedDraft = { ...existingDraft, ...body };

      const updated = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          admissionDraft: mergedDraft,
          admissionStartedAt: enquiry.admissionStartedAt ?? new Date(),
        },
      });

      return {
        data: {
          draft: updated.admissionDraft,
          startedAt: updated.admissionStartedAt,
          completionPercent: admissionCompletionPercent(updated.admissionDraft as Record<string, unknown> | null),
        },
        meta: {},
      };
    }
  );

  // Hard delete (distinct from /erase, which anonymizes PII but keeps the
  // record for analytics/history). Restricted to admin/leadership since it's
  // destructive and, unlike erase, removes the row itself. Blocked once a
  // StudentStub exists - a confirmed admission is a real student record, not
  // a lead to discard - and blocked if other enquiries were merged into this
  // one (their duplicateOfEnquiryId FK would otherwise orphan).
  app.delete<{ Params: { id: string } }>(
    "/enquiries/:id",
    { onRequest: [...scoped(app), requireRoles("admin", "leadership")] },
    async (request, reply) => {
      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { studentStub: { select: { id: true } }, documents: true, duplicates: { select: { id: true } } },
      });

      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      if (enquiry.studentStub) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Cannot delete an enquiry that has already been admitted" },
        });
      }

      if (enquiry.duplicates.length > 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Cannot delete a lead that other enquiries were merged into" },
        });
      }

      for (const doc of enquiry.documents) {
        await storage.remove(doc.fileLocation);
      }
      if (enquiry.photoLocation) {
        await storage.remove(enquiry.photoLocation);
      }

      await prisma.$transaction([
        prisma.document.deleteMany({ where: { enquiryId: enquiry.id } }),
        prisma.enquiryNote.deleteMany({ where: { enquiryId: enquiry.id } }),
        prisma.followUpTask.deleteMany({ where: { enquiryId: enquiry.id } }),
        prisma.enquiryStageHistory.deleteMany({ where: { enquiryId: enquiry.id } }),
        prisma.enquiry.delete({ where: { id: enquiry.id } }),
      ]);

      return { data: { id: enquiry.id }, meta: {} };
    }
  );

  app.post<{ Params: { id: string }; Body: ConfirmAdmissionBody }>(
    "/enquiries/:id/confirm-admission",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as ConfirmAdmissionBody);

      const enquiry = await prisma.enquiry.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { studentStub: true },
      });

      // dateOfBirth can come from the intake-time studentDateOfBirth field
      // instead of being re-typed at confirm time, if it was captured there.
      const dateOfBirth = body.dateOfBirth ?? (enquiry?.studentDateOfBirth ? enquiry.studentDateOfBirth.toISOString().slice(0, 10) : undefined);

      if (!dateOfBirth || !body.classSectionId || !body.admissionDate) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "dateOfBirth, classSectionId, and admissionDate are required" },
        });
      }

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
            fullName: body.fullName ?? enquiry.studentName ?? enquiry.contactName,
            dateOfBirth: new Date(dateOfBirth),
            classSectionId: classSection.id,
            guardianName: body.guardianName ?? enquiry.contactName,
            guardianContact: body.guardianContact ?? enquiry.contactPhone,
            admissionDate: new Date(body.admissionDate),
          },
        }),
        prisma.enquiry.update({
          where: { id: enquiry.id },
          data: {
            status: "admitted",
            admissionStartedAt: enquiry.admissionStartedAt ?? new Date(),
            admissionCompletedAt: new Date(),
          },
        }),
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
