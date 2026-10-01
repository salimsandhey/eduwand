import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { BOARDS, isValidBoard } from "../lib/boards";
import { seedDefaultPipelineStages } from "../lib/pipeline-stages";
import { seedDefaultFormDefinitions } from "../lib/form-definitions";
import { recordAuditEvent } from "../lib/audit";
import { Validator } from "../lib/validation";
import { seedDefaultApprovalChain } from "../lib/approval-chain";

// An explicitly empty string clears an optional text column; otherwise the
// validated value (or undefined = leave untouched).
const orBlank = <T>(raw: unknown, value: T | undefined): T | "" | undefined => (raw === "" ? "" : value);

interface CreateSchoolBody {
  trustId?: string;
  name: string;
  board: string;
  address?: string;
  timezone?: string;
  principalName?: string;
  principalPhone?: string;
  expectedStudentStrength?: number;
}

interface UpdateSchoolBody {
  name?: string;
  board?: string;
  address?: string;
  timezone?: string;
  principalName?: string;
  principalPhone?: string;
  expectedStudentStrength?: number;
  status?: string;
  // Per-teacher class/subject limit overrides for individual accounts - null
  // clears the override (falls back to the platform default). See
  // Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
  // credits.md.
  classLimit?: number | null;
  subjectLimit?: number | null;
}

async function computeReadiness(schoolId: string) {
  const [currentYear, staffCount] = await Promise.all([
    prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      include: { _count: { select: { classSections: true } } },
    }),
    prisma.appUser.count({ where: { schoolId, role: { in: ["admin", "leadership"] }, status: { not: "disabled" } } }),
  ]);

  const hasCurrentAcademicYear = !!currentYear;
  const hasClassSections = (currentYear?._count.classSections ?? 0) > 0;
  const hasAdmin = staffCount > 0;

  const missing: string[] = [];
  if (!hasCurrentAcademicYear) missing.push("no current academic year set");
  if (!hasClassSections) missing.push("no class sections in the current academic year");
  if (!hasAdmin) missing.push("no admin or leadership user invited");

  return { hasCurrentAcademicYear, hasClassSections, hasAdmin, ready: missing.length === 0, missing };
}

const SCHOOL_STATUSES = ["onboarding", "active", "suspended"];

async function requirePlatformAdminOrLeadership(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== PLATFORM_ADMIN_ROLE && request.user.role !== "leadership") {
    reply.code(403).send({
      data: null,
      error: { code: "forbidden", message: "Requires role: platform_admin or leadership" },
    });
  }
}

async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== PLATFORM_ADMIN_ROLE) {
    reply.code(403).send({
      data: null,
      error: { code: "forbidden", message: "Requires role: platform_admin" },
    });
  }
}

export async function schoolRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateSchoolBody }>(
    "/schools",
    { onRequest: [app.authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateSchoolBody);

      const v = new Validator();
      const name = v.label("name", body.name, "School name", true, 120);
      if (!body.board) v.fail("board", "Board is required");
      else if (!isValidBoard(body.board)) v.fail("board", `Board must be one of ${BOARDS.join(", ")}`);
      if (!body.trustId) v.fail("trustId", "Trust is required");
      const address = v.note("address", body.address, "Address", { max: 300 });
      const principalName = v.personName("principalName", body.principalName, "Principal name", false);
      const principalPhone = v.phone("principalPhone", body.principalPhone, false, "Principal phone number");
      const strength = v.number("expectedStudentStrength", body.expectedStudentStrength, "Expected student strength", { integer: true, min: 0, max: 100000 });
      const timezone = v.timezone("timezone", body.timezone);
      if (v.hasErrors || !name || !body.trustId) return v.reject(reply);

      const trust = await prisma.trust.findUnique({ where: { id: body.trustId } });
      if (!trust) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }

      const duplicate = await prisma.school.findFirst({
        where: { trustId: body.trustId, name: { equals: name, mode: "insensitive" } },
      });
      if (duplicate) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `A school named "${duplicate.name}" already exists in this trust` },
        });
      }

      const school = await prisma.school.create({
        data: {
          trustId: body.trustId,
          name,
          board: body.board,
          address,
          timezone: timezone ?? "Asia/Kolkata",
          principalName,
          principalPhone,
          expectedStudentStrength: strength,
          status: "onboarding",
        },
      });

      await seedDefaultPipelineStages(school.id);
      await seedDefaultFormDefinitions(school.id);
      await seedDefaultApprovalChain(school.id);

      return reply.code(201).send({ data: school, meta: {} });
    }
  );

  app.get<{ Querystring: { trustId?: string } }>(
    "/schools",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const caller = request.user;

      if (caller.role === PLATFORM_ADMIN_ROLE) {
        const schools = await prisma.school.findMany({
          where: request.query.trustId ? { trustId: request.query.trustId } : {},
          select: { id: true, trustId: true, name: true, board: true, accountType: true, classLimit: true, subjectLimit: true, status: true },
          orderBy: { name: "asc" },
        });
        return { data: schools, meta: {} };
      }

      if (caller.role === "leadership") {
        if (!caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "No trust scope on this account" } });
        }
        const schools = await prisma.school.findMany({
          where: { trustId: caller.trustId },
          select: { id: true, trustId: true, name: true, board: true, accountType: true, classLimit: true, subjectLimit: true, status: true },
          orderBy: { name: "asc" },
        });
        return { data: schools, meta: {} };
      }

      if (caller.schoolId) {
        const schools = await prisma.school.findMany({
          where: { id: caller.schoolId },
          select: { id: true, trustId: true, name: true, board: true, accountType: true, classLimit: true, subjectLimit: true, status: true },
        });
        return { data: schools, meta: {} };
      }

      return reply.code(403).send({ data: null, error: { code: "forbidden", message: "No school or trust scope on this account" } });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/schools/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const caller = request.user;
      const school = await prisma.school.findUnique({ where: { id: request.params.id } });
      if (!school) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
      }

      const allowed =
        caller.role === PLATFORM_ADMIN_ROLE ||
        (caller.role === "leadership" && caller.trustId === school.trustId) ||
        caller.schoolId === school.id;
      if (!allowed) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized to view this school" } });
      }

      const readiness = await computeReadiness(school.id);
      return { data: { ...school, readiness }, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateSchoolBody }>(
    "/schools/:id",
    { onRequest: [app.authenticate, requirePlatformAdminOrLeadership] },
    async (request, reply) => {
      const caller = request.user;
      const body = request.body ?? ({} as UpdateSchoolBody);

      const v = new Validator();
      const name = body.name !== undefined ? v.label("name", body.name, "School name", true, 120) : undefined;
      const address = body.address !== undefined ? v.note("address", body.address, "Address", { max: 300 }) : undefined;
      const principalName = body.principalName !== undefined ? v.personName("principalName", body.principalName, "Principal name", false) : undefined;
      const principalPhone = body.principalPhone !== undefined ? v.phone("principalPhone", body.principalPhone, false, "Principal phone number") : undefined;
      const strength = v.number("expectedStudentStrength", body.expectedStudentStrength, "Expected student strength", { integer: true, min: 0, max: 100000 });
      const updatedTimezone = body.timezone !== undefined ? v.timezone("timezone", body.timezone) : undefined;
      if (body.classLimit !== undefined && body.classLimit !== null) v.number("classLimit", body.classLimit, "Class limit", { integer: true, min: 0, max: 200 });
      if (body.subjectLimit !== undefined && body.subjectLimit !== null) v.number("subjectLimit", body.subjectLimit, "Subject limit", { integer: true, min: 0, max: 200 });
      if (body.status && !SCHOOL_STATUSES.includes(body.status)) v.fail("status", `Status must be one of ${SCHOOL_STATUSES.join(", ")}`);
      if (v.hasErrors) return v.reject(reply);

      const existing = await prisma.school.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
      }
      if (caller.role === "leadership" && existing.trustId !== caller.trustId) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "School not in your trust" } });
      }

      // Board is a request/approval-only setting for every school, individual
      // or institutional - there is no self-service edit path. Raise a
      // BoardChangeTicket (POST /schools/:id/board-change-tickets) instead.
      // See Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-
      // and-credits.md.
      if (body.board !== undefined && body.board !== existing.board) {
        return reply.code(400).send({
          data: null,
          error: {
            code: "board_change_requires_ticket",
            message: "Board can't be changed directly - submit a board change ticket for approval",
          },
        });
      }

      if (body.status === "active" && existing.status !== "active") {
        const readiness = await computeReadiness(existing.id);
        if (!readiness.ready) {
          return reply.code(400).send({
            data: null,
            error: {
              code: "not_ready",
              message: `This school isn't ready to go active yet: ${readiness.missing.join("; ")}`,
            },
          });
        }
      }

      const school = await prisma.school.update({
        where: { id: request.params.id },
        data: {
          name,
          board: body.board ?? undefined,
          address: orBlank(body.address, address),
          timezone: updatedTimezone,
          principalName: orBlank(body.principalName, principalName),
          principalPhone: orBlank(body.principalPhone, principalPhone),
          expectedStudentStrength: strength,
          status: body.status ?? undefined,
          // Explicit null clears the override; omitted key leaves it untouched.
          classLimit: body.classLimit !== undefined ? body.classLimit : undefined,
          subjectLimit: body.subjectLimit !== undefined ? body.subjectLimit : undefined,
        },
      });

      if (body.status && body.status !== existing.status) {
        const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
        await recordAuditEvent({
          actorUserId: request.user.sub,
          actorEmail: actor?.email ?? "unknown",
          action: "school.status_change",
          targetType: "School",
          targetId: school.id,
          targetLabel: school.name,
          schoolId: school.id,
          trustId: school.trustId,
          metadata: { from: existing.status, to: school.status },
        });
      }

      const readiness = await computeReadiness(school.id);
      return { data: { ...school, readiness }, meta: {} };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/schools/:id",
    { onRequest: [app.authenticate, requirePlatformAdmin] },
    async (request, reply) => {
      const existing = await prisma.school.findUnique({
        where: { id: request.params.id },
        include: {
          _count: {
            select: {
              academicYears: true,
              enquiries: true,
              studentStubs: true,
              csvExportLogs: true,
              pipelineStages: true,
              lessonPlans: true,
              researchReports: true,
              assignments: true,
              aiUsageLogs: true,
              userSchoolAccess: true,
            },
          },
        },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
      }

      const dependentCount = Object.values(existing._count).reduce((sum, n) => sum + n, 0);
      if (dependentCount > 0) {
        return reply.code(409).send({
          data: null,
          error: {
            code: "has_dependents",
            message: "This school still has admissions, staff assignments, or other records. It can't be hard-deleted - suspend it instead.",
          },
        });
      }

      try {
        await prisma.school.delete({ where: { id: request.params.id } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
          return reply.code(409).send({
            data: null,
            error: { code: "has_dependents", message: "This school still has related records and can't be hard-deleted." },
          });
        }
        throw err;
      }

      const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: request.user.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "school.delete",
        targetType: "School",
        targetId: existing.id,
        targetLabel: existing.name,
        trustId: existing.trustId,
      });

      return { data: { deleted: true }, meta: {} };
    }
  );
}
