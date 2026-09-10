import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

// Individual-account subject swap workflow - fixed set of exactly 2
// subjects, changeable only via an approved request, at most once every 6
// months. Institutional schools never use this. See Docs/superpowers/plans/
// 2026-09-09-individual-teacher-onboarding-and-credits.md.

const REQUIRED_SUBJECT_COUNT = 2;
const COOLDOWN_MONTHS = 6;

interface CreateSubjectChangeRequestBody {
  requestedSubjects: string[];
  note?: string;
}

interface DecideSubjectChangeRequestBody {
  decision: "approved" | "rejected";
  note?: string;
}

export async function subjectChangeRequestRoutes(app: FastifyInstance) {
  app.post<{ Params: { schoolId: string }; Body: CreateSubjectChangeRequestBody }>(
    "/schools/:schoolId/subject-change-requests",
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
          error: { code: "validation_error", message: "Subject change requests are only available for individual accounts" },
        });
      }

      const body = request.body ?? ({} as CreateSubjectChangeRequestBody);
      const requestedSubjects = Array.from(
        new Set((body.requestedSubjects ?? []).map((name) => name.trim()).filter((name) => name.length > 0))
      );
      if (requestedSubjects.length !== REQUIRED_SUBJECT_COUNT) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `requestedSubjects must contain exactly ${REQUIRED_SUBJECT_COUNT} distinct subject names` },
        });
      }

      const pending = await prisma.subjectChangeRequest.findFirst({
        where: { teacherUserId: caller.sub, status: "pending" },
      });
      if (pending) {
        return reply.code(400).send({
          data: null,
          error: { code: "request_already_pending", message: "You already have a pending subject change request" },
        });
      }

      const lastApproved = await prisma.subjectChangeRequest.findFirst({
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
              message: `Subjects can only be changed once every ${COOLDOWN_MONTHS} months. Next change available ${cooldownEnds.toISOString()}`,
            },
          });
        }
      }

      const currentSubjects = (await prisma.subject.findMany({ where: { schoolId }, select: { name: true } })).map((s) => s.name);

      const created = await prisma.subjectChangeRequest.create({
        data: {
          teacherUserId: caller.sub,
          schoolId,
          currentSubjects,
          requestedSubjects,
          note: body.note?.trim() || undefined,
        },
      });

      return reply.code(201).send({ data: created, meta: {} });
    }
  );

  app.get(
    "/admin/subject-change-requests",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const status = (request.query as { status?: string })?.status;
      const requests = await prisma.subjectChangeRequest.findMany({
        where: status ? { status } : undefined,
        orderBy: { requestedAt: "desc" },
        include: { teacher: { select: { fullName: true, email: true } }, school: { select: { name: true } } },
      });
      return { data: requests, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: DecideSubjectChangeRequestBody }>(
    "/admin/subject-change-requests/:id",
    { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const body = request.body ?? ({} as DecideSubjectChangeRequestBody);
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "decision must be approved or rejected" },
        });
      }

      const existing = await prisma.subjectChangeRequest.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Subject change request not found" } });
      }
      if (existing.status !== "pending") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "This request has already been decided" },
        });
      }

      const decided = await prisma.$transaction(async (tx) => {
        if (body.decision === "approved") {
          await tx.subject.deleteMany({ where: { schoolId: existing.schoolId, name: { in: existing.currentSubjects } } });
          for (const name of existing.requestedSubjects) {
            await tx.subject.upsert({
              where: { schoolId_name: { schoolId: existing.schoolId, name } },
              create: { schoolId: existing.schoolId, name },
              update: {},
            });
          }
        }

        return tx.subjectChangeRequest.update({
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
