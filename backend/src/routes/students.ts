import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface ListQuery {
  classSectionId?: string;
  page?: string;
  pageSize?: string;
}

interface CreateStudentBody {
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  admissionDate?: string;
  feeStatus?: string;
}

interface UpdateStudentBody {
  fullName?: string;
  dateOfBirth?: string;
  classSectionId?: string;
  guardianName?: string;
  guardianContact?: string;
  feeStatus?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];
// Guardian contact doubles as the student's login credential (phone + OTP),
// so creating/editing a student record is restricted to staff who manage
// enrolment, not every role that can merely view the roster.
const manageScoped = (app: FastifyInstance) => [
  app.authenticate,
  app.requireSchoolScope,
  requireRoles("front_desk", "admin", "principal", "leadership", PLATFORM_ADMIN_ROLE),
];

export async function studentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/students",
    { onRequest: scoped(app) },
    async (request) => {
      const { classSectionId } = request.query;
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));

      const where = {
        schoolId: request.schoolId,
        ...(classSectionId ? { classSectionId } : {}),
      };

      const [items, totalCount] = await Promise.all([
        prisma.studentStub.findMany({
          where,
          orderBy: { admissionDate: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.studentStub.count({ where }),
      ]);

      return { data: items, meta: { page, pageSize, totalCount } };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/students/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const student = await prisma.studentStub.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { classSection: true },
      });

      if (!student) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }

      return { data: student, meta: {} };
    }
  );

  // Direct add - for a student who never went through the Enquiry pipeline
  // (e.g. a school onboarding its existing roster). sourceEnquiryId is left
  // null; nothing else about the record differs from an admissions-created one.
  app.post<{ Body: CreateStudentBody }>("/students", { onRequest: manageScoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as CreateStudentBody);
    if (!body.fullName?.trim() || !body.dateOfBirth || !body.classSectionId || !body.guardianName?.trim() || !body.guardianContact?.trim()) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "fullName, dateOfBirth, classSectionId, guardianName, and guardianContact are required" },
      });
    }

    const classSection = await prisma.classSection.findFirst({
      where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
    });
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    const student = await prisma.studentStub.create({
      data: {
        schoolId: request.schoolId,
        sourceEnquiryId: null,
        fullName: body.fullName.trim(),
        dateOfBirth: new Date(body.dateOfBirth),
        classSectionId: classSection.id,
        guardianName: body.guardianName.trim(),
        guardianContact: body.guardianContact.trim(),
        admissionDate: body.admissionDate ? new Date(body.admissionDate) : new Date(),
        feeStatus: body.feeStatus ?? "pending",
        createdBy: request.user.sub,
      },
    });

    return reply.code(201).send({ data: student, meta: {} });
  });

  // Fixes the gap that previously had no edit path at all - most importantly
  // guardianContact, since a wrong/outdated number locks the student's
  // guardian out of OTP login with no way to self-recover.
  app.patch<{ Params: { id: string }; Body: UpdateStudentBody }>(
    "/students/:id",
    { onRequest: manageScoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdateStudentBody);
      const student = await prisma.studentStub.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!student) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }

      if (body.classSectionId) {
        const classSection = await prisma.classSection.findFirst({
          where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
        });
        if (!classSection) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
        }
      }
      if (body.fullName !== undefined && !body.fullName.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "fullName cannot be empty" } });
      }
      if (body.guardianName !== undefined && !body.guardianName.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "guardianName cannot be empty" } });
      }
      if (body.guardianContact !== undefined && !body.guardianContact.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "guardianContact cannot be empty" } });
      }

      const updated = await prisma.studentStub.update({
        where: { id: student.id },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName.trim() } : {}),
          ...(body.dateOfBirth !== undefined ? { dateOfBirth: new Date(body.dateOfBirth) } : {}),
          ...(body.classSectionId !== undefined ? { classSectionId: body.classSectionId } : {}),
          ...(body.guardianName !== undefined ? { guardianName: body.guardianName.trim() } : {}),
          ...(body.guardianContact !== undefined ? { guardianContact: body.guardianContact.trim() } : {}),
          ...(body.feeStatus !== undefined ? { feeStatus: body.feeStatus } : {}),
          updatedBy: request.user.sub,
        },
      });

      return { data: updated, meta: {} };
    }
  );
}
