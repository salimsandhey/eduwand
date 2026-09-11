import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

// Individual-account class change workflow - same "request only" pattern as
// SubjectChangeRequest. changeType "add" requests one more class beyond the
// limit (nothing existing touched); "replace" archives an existing class
// (isActive=false - all its students/topics/assignments stay intact, it
// just stops counting toward the limit) and creates a new one in its place.
// Institutional schools never use this. See Docs/superpowers/plans/2026-09-
// 09-individual-teacher-onboarding-and-credits.md.

const COOLDOWN_MONTHS = 6;

interface CreateClassChangeRequestBody {
  changeType: "add" | "replace";
  targetClassSectionId?: string;
  requestedClassName: string;
  requestedSectionName: string;
  note?: string;
}

interface DecideClassChangeRequestBody {
  decision: "approved" | "rejected";
  note?: string;
}

export async function classChangeRequestRoutes(app: FastifyInstance) {
  app.post<{ Params: { schoolId: string }; Body: CreateClassChangeRequestBody }>(
    "/schools/:schoolId/class-change-requests",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const caller = request.user;
      const { schoolId } = request.params;

      if (caller.role !== "teacher" || caller.schoolId !== schoolId) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this school" } });
      }

      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { accountType: true } });
      if (!school || school.accountType !== "individual") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Class change requests are only available for individual accounts" },
        });
      }

      const body = request.body ?? ({} as CreateClassChangeRequestBody);
      const requestedClassName = body.requestedClassName?.trim();
      const requestedSectionName = body.requestedSectionName?.trim();
      if (body.changeType !== "add" && body.changeType !== "replace") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "changeType must be add or replace" } });
      }
      if (!requestedClassName || !requestedSectionName) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "requestedClassName and requestedSectionName are required" },
        });
      }
      if (body.changeType === "replace") {
        if (!body.targetClassSectionId) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: "targetClassSectionId is required for a replace request" } });
        }
        const target = await prisma.classSection.findFirst({
          where: { id: body.targetClassSectionId, isActive: true, academicYear: { schoolId } },
        });
        if (!target) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Target class not found for this school" } });
        }
      }

      const pending = await prisma.classChangeRequest.findFirst({ where: { teacherUserId: caller.sub, status: "pending" } });
      if (pending) {
        return reply.code(400).send({
          data: null,
          error: { code: "request_already_pending", message: "You already have a pending class change request" },
        });
      }

      const lastApproved = await prisma.classChangeRequest.findFirst({
        where: { teacherUserId: caller.sub, status: "approved" },
        orderBy: { decidedAt: "desc" },
      });
      if (lastApproved?.decidedAt) {
        const cooldownEnds = new Date(lastApproved.decidedAt);
        cooldownEnds.setMonth(cooldownEnds.getMonth() + COOLDOWN_MONTHS);
        if (cooldownEnds > new Date()) {
          return reply.code(400).send({
            data: null,
            error: {
              code: "cooldown_active",
              message: `Classes can only be changed once every ${COOLDOWN_MONTHS} months. Next change available ${cooldownEnds.toISOString()}`,
            },
          });
        }
      }

      const created = await prisma.classChangeRequest.create({
        data: {
          teacherUserId: caller.sub,
          schoolId,
          changeType: body.changeType,
          targetClassSectionId: body.changeType === "replace" ? body.targetClassSectionId : undefined,
          requestedClassName,
          requestedSectionName,
          note: body.note?.trim() || undefined,
        },
      });

      return reply.code(201).send({ data: created, meta: {} });
    }
  );

  app.get(
    "/admin/class-change-requests",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const status = (request.query as { status?: string })?.status;
      const requests = await prisma.classChangeRequest.findMany({
        where: status ? { status } : undefined,
        orderBy: { requestedAt: "desc" },
        include: { teacher: { select: { fullName: true, email: true } }, school: { select: { name: true } } },
      });
      return { data: requests, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: DecideClassChangeRequestBody }>(
    "/admin/class-change-requests/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as DecideClassChangeRequestBody);
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "decision must be approved or rejected" } });
      }

      const existing = await prisma.classChangeRequest.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class change request not found" } });
      }
      if (existing.status !== "pending") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This request has already been decided" } });
      }

      const decided = await prisma.$transaction(async (tx) => {
        if (body.decision === "approved") {
          const currentYear = await tx.academicYear.findFirst({ where: { schoolId: existing.schoolId, isCurrent: true } });
          if (!currentYear) {
            throw new Error("No current academic year found for this school");
          }

          if (existing.changeType === "replace" && existing.targetClassSectionId) {
            await tx.classSection.update({ where: { id: existing.targetClassSectionId }, data: { isActive: false } });
          }

          const newSection = await tx.classSection.create({
            data: {
              academicYearId: currentYear.id,
              className: existing.requestedClassName,
              sectionName: existing.requestedSectionName,
            },
          });
          await tx.classSectionTeacher.create({
            data: { classSectionId: newSection.id, teacherUserId: existing.teacherUserId },
          });
        }

        return tx.classChangeRequest.update({
          where: { id: existing.id },
          data: {
            status: body.decision,
            decidedAt: new Date(),
            decidedByUserId: request.user.sub,
            note: body.note?.trim() || existing.note,
          },
        });
      });

      return { data: decided, meta: {} };
    }
  );
}
