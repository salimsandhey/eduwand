import { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { findPossibleDuplicates, buildActivityFeed, admissionCompletionPercent } from "../lib/enquiries";
import { requireRoles, hasAnyRole } from "../lib/rbac";
import { storage } from "../lib/storage";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

const VALID_SOURCES = ["phone", "walk_in", "website", "referral", "event", "social"];
const VALID_NOTE_TYPES = ["lead_note", "admission_note", "system_note"];
const VALID_GUARDIAN_RELATIONS = ["mother", "father", "guardian", "other"];
const ADMISSION_UNLOCKED_STATUSES = new Set(["application", "admitted", "enrolled"]);

async function validStatusKeys(schoolId: string): Promise<Set<string>> {
  const stages = await prisma.pipelineStage.findMany({ where: { schoolId }, select: { key: true } });
  return new Set(stages.map((s) => s.key));
}

// The school's active admission_detail FormDefinition's fields - fetched at
// each call site (kept out of lib/enquiries.ts's pure admissionCompletionPercent
// and the validation helpers below) so those stay easy to unit test.
async function activeFormFields(schoolId: string, purpose: string) {
  const definition = await prisma.formDefinition.findFirst({
    where: { schoolId, purpose, isActive: true },
    include: { fields: true },
  });
  return definition?.fields ?? [];
}

function requiredDynamicFieldsForStage(fields: { key: string; isRequired: boolean; requiredAtStage: string | null }[], stage: string) {
  return fields.filter((f) => f.isRequired && (f.requiredAtStage === null || f.requiredAtStage === stage));
}

// Enforces the plan's Phase 2 verification criterion: "a required-at-stage
// field blocks status progression past that stage until filled (validated
// server-side, not just client-side)". Uses PipelineStage.order (not a
// hardcoded stage-name list) so a school's custom pipeline - e.g. one with an
// extra "interview" stage inserted between "application" and "admitted" - is
// still covered by order comparison rather than needing an exact status-key
// Only enforce once the target stage reaches "application" or later. If this
// school's pipeline has no stage literally keyed "application" (a fully
// custom pipeline), fall back to the same fixed status set the
// admission-tab-unlock logic historically relied on (ADMISSION_UNLOCKED_STATUSES)
// rather than silently skipping validation.
function isAtOrAfterApplicationOrder(
  orderByKey: Map<string, number>,
  targetOrder: number | undefined,
  targetStatus: string
): boolean {
  const applicationOrder = orderByKey.get("application");
  return targetOrder !== undefined && applicationOrder !== undefined
    ? targetOrder >= applicationOrder
    : ADMISSION_UNLOCKED_STATUSES.has(targetStatus);
}

// match. Returns the admission_detail fields that are required-and-missing
// for the given target status; an empty array means either nothing is
// missing or the target status doesn't reach the "application" threshold yet.
async function missingRequiredAdmissionFields(
  schoolId: string,
  targetStatus: string,
  admissionDraft: Record<string, unknown> | null
): Promise<{ key: string; label: string }[]> {
  const [fields, stages] = await Promise.all([
    activeFormFields(schoolId, "admission_detail"),
    prisma.pipelineStage.findMany({ where: { schoolId }, select: { key: true, order: true } }),
  ]);

  const orderByKey = new Map(stages.map((s) => [s.key, s.order]));
  const targetOrder = orderByKey.get(targetStatus);
  if (!isAtOrAfterApplicationOrder(orderByKey, targetOrder, targetStatus)) return [];

  const draft = admissionDraft ?? {};
  const missing: { key: string; label: string }[] = [];
  for (const field of fields) {
    if (!field.isRequired) continue;
    if (field.requiredAtStage !== null) {
      const requiredOrder = orderByKey.get(field.requiredAtStage);
      // Field is gated to a specific stage - skip it if the target status
      // hasn't reached that stage yet. If either order is unknown (stage key
      // renamed/removed), default to enforcing rather than skipping.
      if (requiredOrder !== undefined && targetOrder !== undefined && targetOrder < requiredOrder) {
        continue;
      }
    }
    const value = draft[field.key];
    const filled = typeof value === "string" ? value.trim().length > 0 : value != null;
    if (!filled) missing.push({ key: field.key, label: field.label });
  }
  return missing;
}

// Rejects any key not in the FormField set - shared by every dynamic-field
// entry point (formResponses, admission-draft's dynamic keys).
function validateUnknownKeys(responses: Record<string, unknown>, fields: { key: string }[]): string | null {
  const validKeys = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(responses)) {
    if (!validKeys.has(key)) {
      return `Unknown field "${key}"`;
    }
  }
  return null;
}

// Rejects unknown keys and enforces presence of any field required at the
// given lifecycle stage (Docs/Dev/GrowthEngine_Rebuild_Plan.md Phase 2). Used
// for formResponses (enquiry_intake), where the full response set is
// resubmitted/merged each time - NOT for admission-draft's incremental
// per-field saves, which only need the unknown-key check above.
function validateFormResponses(
  responses: Record<string, unknown>,
  fields: { key: string; isRequired: boolean; requiredAtStage: string | null }[],
  stage: string
): string | null {
  const unknownKeyError = validateUnknownKeys(responses, fields);
  if (unknownKeyError) return unknownKeyError;
  for (const field of requiredDynamicFieldsForStage(fields, stage)) {
    const value = responses[field.key];
    const filled = typeof value === "string" ? value.trim().length > 0 : value != null;
    if (!filled) {
      return `${field.key} is required`;
    }
  }
  return null;
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
  formResponses?: Record<string, unknown>;
  academicYearId?: string;
  familyId?: string;
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
  formResponses?: Record<string, unknown>;
  feePlanId?: string | null;
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

const ADMISSION_DRAFT_FIXED_KEYS = new Set<string>([
  "fullName",
  "dateOfBirth",
  "classSectionId",
  "guardianName",
  "guardianContact",
  "admissionDate",
]);

interface ListQuery {
  status?: string;
  source?: string;
  ownerUserId?: string;
  academicYearId?: string;
  page?: string;
  pageSize?: string;
}

interface MergeBody {
  sourceEnquiryId: string;
}

interface LinkFamilyBody {
  familyId?: string;
  sourceEnquiryId?: string;
}

interface ConfirmAdmissionBody {
  fullName?: string;
  dateOfBirth?: string;
  classSectionId: string;
  guardianName?: string;
  guardianContact?: string;
  admissionDate: string;
}

const scoped = (app: FastifyInstance) => [
  app.authenticate,
  app.requireSchoolScope,
  requireRoles("front_desk", "admin", "principal", "counsellor", "teacher", "leadership", PLATFORM_ADMIN_ROLE),
];

// counsellor/teacher see only their own leads unless a UserRoleGrant also gives
// them admin/front_desk/principal-level access (grants are additive - see
// hasAnyRole in lib/rbac.ts and D-5 in the Growth Engine plan).
async function isOwnershipRestricted(user: FastifyRequest["user"]): Promise<boolean> {
  const isCounsellorOrTeacher = await hasAnyRole(user, "counsellor", "teacher");
  if (!isCounsellorOrTeacher) return false;
  const hasBroaderAccess = await hasAnyRole(user, "admin", "front_desk", "principal");
  return !hasBroaderAccess;
}

async function canChangeEnquiryStatus(user: FastifyRequest["user"], ownerUserId: string | null): Promise<boolean> {
  return (
    ownerUserId === user.sub ||
    hasAnyRole(user, "admin", "principal", "front_desk", "leadership", PLATFORM_ADMIN_ROLE)
  );
}

async function resolveAcademicYearId(schoolId: string, requestedId?: string): Promise<string | null> {
  if (requestedId) {
    const year = await prisma.academicYear.findFirst({ where: { id: requestedId, schoolId }, select: { id: true } });
    return year?.id ?? null;
  }
  const currentYear = await prisma.academicYear.findFirst({
    where: { schoolId, isCurrent: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return currentYear?.id ?? null;
}

export async function enquiryRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/enquiries",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { status, source, ownerUserId, academicYearId } = request.query;
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
      if (academicYearId) {
        const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId: request.schoolId } });
        if (!year) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "academicYearId must belong to this school" },
          });
        }
      }

      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ...(status ? { status } : {}),
        ...(source ? { source } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(academicYearId ? { academicYearId } : {}),
      };

      if (await isOwnershipRestricted(request.user)) {
        // Own leads only - overrides any ownerUserId the caller tried to pass.
        where.ownerUserId = request.user.sub;
      }

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

      const academicYearId = await resolveAcademicYearId(request.schoolId, body.academicYearId);
      if (!academicYearId) {
        return reply.code(400).send({
          data: null,
          error: {
            code: "academic_year_required",
            message: body.academicYearId
              ? "The selected academic year does not belong to this school"
              : "Set a current academic year before creating enquiries",
          },
        });
      }

      if (body.familyId) {
        const family = await prisma.family.findFirst({ where: { id: body.familyId, schoolId: request.schoolId } });
        if (!family) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "familyId must belong to this school" },
          });
        }
      }

      if (body.guardianRelation && !VALID_GUARDIAN_RELATIONS.includes(body.guardianRelation)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `guardianRelation must be one of ${VALID_GUARDIAN_RELATIONS.join(", ")}` },
        });
      }

      if (body.formResponses) {
        const intakeFields = await activeFormFields(request.schoolId, "enquiry_intake");
        const validationError = validateFormResponses(body.formResponses, intakeFields, "new");
        if (validationError) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: validationError } });
        }
      }

      const enquiry = await prisma.enquiry.create({
        data: {
          schoolId: request.schoolId,
          academicYearId,
          familyId: body.familyId,
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
          formResponses: body.formResponses as Prisma.InputJsonValue | undefined,
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
      const defaultAcademicYearId = await resolveAcademicYearId(request.schoolId);
      if (!defaultAcademicYearId) {
        return reply.code(400).send({
          data: null,
          error: { code: "academic_year_required", message: "Set a current academic year before importing enquiries" },
        });
      }

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
        const academicYearId = row.academicYearId
          ? await resolveAcademicYearId(request.schoolId, row.academicYearId)
          : defaultAcademicYearId;
        if (!academicYearId) {
          errors.push({ row: rowNumber, message: "academicYearId must belong to this school" });
          continue;
        }

        const enquiry = await prisma.enquiry.create({
          data: {
            schoolId: request.schoolId,
            academicYearId,
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

      // 404 (not 403) for a lead a counsellor/teacher doesn't own, so existence
      // isn't leaked to someone who shouldn't see it at all.
      if ((await isOwnershipRestricted(request.user)) && enquiry.ownerUserId !== request.user.sub) {
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

      const admissionDetailFields = await activeFormFields(request.schoolId, "admission_detail");
      const admissionSummary = {
        // Always unlocked: admission-detail prep is meant to happen
        // progressively from the first walk-in, not gated behind reaching
        // Application - the actual stage-progression gate is the
        // missingRequiredAdmissionFields check on the status PATCH itself.
        // Gating this screen behind ADMISSION_UNLOCKED_STATUSES would create
        // a deadlock: you couldn't fill the fields needed to reach
        // Application without first being at Application.
        unlocked: true,
        confirmed: enquiry.studentStub !== null,
        studentStubId: enquiry.studentStub?.id ?? null,
        startedAt: enquiry.admissionStartedAt,
        completedAt: enquiry.admissionCompletedAt,
        completionPercent: admissionCompletionPercent(
          enquiry.admissionDraft as Record<string, unknown> | null,
          admissionDetailFields.filter((f) => f.isRequired)
        ),
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

      if (body.status !== undefined) {
        const validStatuses = await validStatusKeys(request.schoolId);
        if (!validStatuses.has(body.status)) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `status must be one of ${[...validStatuses].join(", ")}` },
          });
        }
      }

      const statusChanged = body.status !== undefined && body.status !== existing.status;
      if (statusChanged && !(await canChangeEnquiryStatus(request.user, existing.ownerUserId))) {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Only the assigned owner or an admissions administrator can change this lead's stage" },
        });
      }

      if (body.status === "lost" && !body.lostReason && !existing.lostReason) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "lostReason is required when status is lost" },
        });
      }

      if (body.status === "admitted" && existing.status === "application") {
        return reply.code(400).send({ data: null, error: { code: "approval_required", message: "Use the approval chain to move an application to Admitted" } });
      }

      if (body.feePlanId !== undefined && body.feePlanId !== null) {
        const feePlan = await prisma.feePlan.findFirst({ where: { id: body.feePlanId, schoolId: request.schoolId, academicYearId: existing.academicYearId, isActive: true } });
        if (!feePlan) return reply.code(400).send({ data: null, error: { code: "validation_error", message: "feePlanId must be an active plan for this enquiry's academic year" } });
      }

      // PATCH doesn't accept admissionDraft fields (only /admission-draft
      // does - see UpdateEnquiryBody), so no merge is needed here: check
      // against the draft as already persisted.
      if (body.status !== undefined) {
        const missingFields = await missingRequiredAdmissionFields(
          request.schoolId,
          body.status,
          existing.admissionDraft as Record<string, unknown> | null
        );
        if (missingFields.length > 0) {
          return reply.code(400).send({
            data: null,
            error: {
              code: "validation_error",
              message: `Cannot move to this stage - required admission fields are missing: ${missingFields.map((f) => f.label).join(", ")}`,
            },
          });
        }
      }

      if (body.guardianRelation && !VALID_GUARDIAN_RELATIONS.includes(body.guardianRelation)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `guardianRelation must be one of ${VALID_GUARDIAN_RELATIONS.join(", ")}` },
        });
      }

      let mergedFormResponses: Record<string, unknown> | undefined;
      if (body.formResponses) {
        const intakeFields = await activeFormFields(request.schoolId, "enquiry_intake");
        const validationError = validateFormResponses(body.formResponses, intakeFields, "new");
        if (validationError) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: validationError } });
        }
        const existingResponses = (existing.formResponses as Record<string, unknown> | null) ?? {};
        mergedFormResponses = { ...existingResponses, ...body.formResponses };
      }

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
          feePlanId: body.feePlanId,
          formResponses: mergedFormResponses as Prisma.InputJsonValue | undefined,
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

  app.post<{ Params: { id: string }; Body: LinkFamilyBody }>(
    "/enquiries/:id/link-family",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { familyId, sourceEnquiryId } = request.body ?? {};
      if ((familyId ? 1 : 0) + (sourceEnquiryId ? 1 : 0) !== 1) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Provide exactly one of familyId or sourceEnquiryId" },
        });
      }

      if (sourceEnquiryId === request.params.id) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "An enquiry cannot be linked to itself as family" },
        });
      }

      const target = await prisma.enquiry.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
      if (!target) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }

      let resolvedFamilyId = familyId;
      if (sourceEnquiryId) {
        const source = await prisma.enquiry.findFirst({ where: { id: sourceEnquiryId, schoolId: request.schoolId } });
        if (!source) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Source enquiry not found" } });
        }
        if (source.duplicateOfEnquiryId || target.duplicateOfEnquiryId) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "Merged enquiries cannot be linked as a family" },
          });
        }
        const updatedTarget = await prisma.$transaction(async (tx) => {
          const family = source.familyId
            ? await tx.family.findFirst({ where: { id: source.familyId, schoolId: request.schoolId } })
            : await tx.family.create({
                data: {
                  schoolId: request.schoolId,
                  primaryContactName: source.contactName,
                  primaryContactPhone: source.contactPhone,
                },
              });
          if (!family) throw new Error("Family not found");
          resolvedFamilyId = family.id;
          await tx.enquiry.update({ where: { id: source.id }, data: { familyId: family.id } });
          return tx.enquiry.update({ where: { id: target.id }, data: { familyId: family.id } });
        });
        return { data: updatedTarget, meta: {} };
      }

      const family = await prisma.family.findFirst({ where: { id: resolvedFamilyId, schoolId: request.schoolId } });
      if (!family) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Family not found" } });
      }
      const updated = await prisma.enquiry.update({ where: { id: target.id }, data: { familyId: family.id } });
      return { data: updated, meta: {} };
    }
  );

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
      const admissionDetailFields = await activeFormFields(request.schoolId, "admission_detail");

      return {
        data: {
          // See the matching comment on GET /enquiries/:id's admissionSummary
          // - always unlocked, prep can start any time.
          unlocked: true,
          confirmed: enquiry.studentStub !== null,
          draft,
          studentStub: enquiry.studentStub,
          startedAt: enquiry.admissionStartedAt,
          completedAt: enquiry.admissionCompletedAt,
          completionPercent: admissionCompletionPercent(draft, admissionDetailFields.filter((f) => f.isRequired)),
          fields: admissionDetailFields,
        },
        meta: {},
      };
    }
  );

  app.patch<{ Params: { id: string }; Body: AdmissionDraftBody & { [key: string]: unknown } }>(
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

      const body = request.body ?? ({} as AdmissionDraftBody & { [key: string]: unknown });
      const admissionDetailFields = await activeFormFields(request.schoolId, "admission_detail");

      // Only the NEW dynamic keys (anything beyond the fixed AdmissionDraftBody
      // fields) are validated against the FormField set - the fixed fields stay
      // accepted as before.
      const dynamicKeys = Object.keys(body).filter((k) => !ADMISSION_DRAFT_FIXED_KEYS.has(k));
      const dynamicResponses: Record<string, unknown> = {};
      for (const key of dynamicKeys) dynamicResponses[key] = body[key];

      const validationError = validateUnknownKeys(dynamicResponses, admissionDetailFields);
      if (validationError) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: validationError } });
      }

      const existingDraft = (enquiry.admissionDraft as Record<string, unknown> | null) ?? {};
      const mergedDraft = { ...existingDraft, ...body };

      const updated = await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          admissionDraft: mergedDraft as Prisma.InputJsonValue,
          admissionStartedAt: enquiry.admissionStartedAt ?? new Date(),
        },
      });

      return {
        data: {
          draft: updated.admissionDraft,
          startedAt: updated.admissionStartedAt,
          completionPercent: admissionCompletionPercent(
            updated.admissionDraft as Record<string, unknown> | null,
            admissionDetailFields.filter((f) => f.isRequired)
          ),
        },
        meta: {},
      };
    }
  );

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

      if (!(await canChangeEnquiryStatus(request.user, enquiry.ownerUserId))) {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Only the assigned owner or an admissions administrator can confirm admission" },
        });
      }

      if (enquiry.studentStub) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "This enquiry has already been admitted" },
        });
      }

      // The client's flow treats Application as a real, distinct CRM stage
      // ("the move happens as and when the application status is updated,
      // same as in any CRM tool") - confirm-admission must not be usable to
      // jump an enquiry straight from an earlier status (e.g. New) to
      // Admitted, skipping Contacted/Visit/Application entirely.
      const stages = await prisma.pipelineStage.findMany({ where: { schoolId: request.schoolId }, select: { key: true, order: true } });
      const orderByKey = new Map(stages.map((s) => [s.key, s.order]));
      if (enquiry.status !== "admitted" && enquiry.status !== "enrolled") {
        return reply.code(400).send({
          data: null,
          error: { code: "approval_required", message: "Complete the approval chain before confirming admission" },
        });
      }

      // Belt-and-braces: also re-check required admission fields here, since
      // this is what actually creates the StudentStub (Docs/Dev/GrowthEngine_Rebuild_Plan.md
      // Phase 2), even though the PATCH /enquiries/:id status-change check
      // above should already have enforced this on the way to Application.
      const missingFields = await missingRequiredAdmissionFields(
        request.schoolId,
        "admitted",
        enquiry.admissionDraft as Record<string, unknown> | null
      );
      if (missingFields.length > 0) {
        return reply.code(400).send({
          data: null,
          error: {
            code: "validation_error",
            message: `Cannot confirm admission - required admission fields are missing: ${missingFields.map((f) => f.label).join(", ")}`,
          },
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
          data: { admissionStartedAt: enquiry.admissionStartedAt ?? new Date(), admissionCompletedAt: new Date() },
        }),
      ]);

      return reply.code(201).send({ data: studentStub, meta: {} });
    }
  );
}
