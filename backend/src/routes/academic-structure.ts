import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface CreateAcademicYearBody {
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

interface UpdateAcademicYearBody {
  isCurrent?: boolean;
}

interface CreateClassSectionBody {
  academicYearId: string;
  className: string;
  sectionName: string;
}

// A brand-new school (created via POST /schools) has zero academic years and
// zero class sections, and nothing else in the API could create either - the
// mobile app's /class-sections is read-only, and admission confirmation
// requires a class_section_id. These are the only write paths for either, so
// platform_admin/leadership/admin can actually finish setting up a school.
async function authorizeForSchool(request: FastifyRequest, reply: FastifyReply, schoolId: string): Promise<boolean> {
  const caller = request.user;
  if (caller.role === PLATFORM_ADMIN_ROLE) return true;

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
    return false;
  }

  if (caller.role === "leadership" && caller.trustId === school.trustId) return true;
  if (caller.role === "admin" && caller.schoolId === school.id) return true;

  reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this school" } });
  return false;
}

export async function academicStructureRoutes(app: FastifyInstance) {
  app.get<{ Params: { schoolId: string } }>(
    "/schools/:schoolId/academic-years",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const academicYears = await prisma.academicYear.findMany({
        where: { schoolId: request.params.schoolId },
        include: { classSections: { orderBy: [{ className: "asc" }, { sectionName: "asc" }] } },
        orderBy: { startDate: "desc" },
      });

      return { data: academicYears, meta: {} };
    }
  );

  app.post<{ Params: { schoolId: string }; Body: CreateAcademicYearBody }>(
    "/schools/:schoolId/academic-years",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const body = request.body ?? ({} as CreateAcademicYearBody);
      if (!body.label || !body.startDate || !body.endDate) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "label, startDate, and endDate are required" },
        });
      }

      const schoolId = request.params.schoolId;
      const existingCount = await prisma.academicYear.count({ where: { schoolId } });
      // The very first academic year for a school is automatically "current" -
      // otherwise a freshly onboarded school still has no usable class sections
      // for the mobile app's GET /class-sections (isCurrent: true filter).
      const isCurrent = existingCount === 0 ? true : body.isCurrent ?? false;

      const academicYear = await prisma.$transaction(async (tx) => {
        if (isCurrent) {
          await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
        }
        return tx.academicYear.create({
          data: {
            schoolId,
            label: body.label,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            isCurrent,
          },
        });
      });

      return reply.code(201).send({ data: academicYear, meta: {} });
    }
  );

  app.patch<{ Params: { schoolId: string; id: string }; Body: UpdateAcademicYearBody }>(
    "/schools/:schoolId/academic-years/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const existing = await prisma.academicYear.findFirst({
        where: { id: request.params.id, schoolId: request.params.schoolId },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Academic year not found" } });
      }

      const body = request.body ?? ({} as UpdateAcademicYearBody);
      if (body.isCurrent === undefined) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "isCurrent is required" } });
      }

      const schoolId = request.params.schoolId;
      const academicYear = await prisma.$transaction(async (tx) => {
        if (body.isCurrent) {
          await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
        }
        return tx.academicYear.update({ where: { id: existing.id }, data: { isCurrent: body.isCurrent } });
      });

      return { data: academicYear, meta: {} };
    }
  );

  app.post<{ Params: { schoolId: string }; Body: CreateClassSectionBody }>(
    "/schools/:schoolId/class-sections",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const body = request.body ?? ({} as CreateClassSectionBody);
      if (!body.academicYearId || !body.className || !body.sectionName) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "academicYearId, className, and sectionName are required" },
        });
      }

      const academicYear = await prisma.academicYear.findFirst({
        where: { id: body.academicYearId, schoolId: request.params.schoolId },
      });
      if (!academicYear) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Academic year not found for this school" } });
      }

      const classSection = await prisma.classSection.create({
        data: { academicYearId: academicYear.id, className: body.className, sectionName: body.sectionName },
      });

      return reply.code(201).send({ data: classSection, meta: {} });
    }
  );
}
