import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface CreateAcademicYearBody {
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
  copyFromAcademicYearId?: string;
}

interface UpdateAcademicYearBody {
  isCurrent?: boolean;
}

interface CreateClassSectionBody {
  academicYearId: string;
  className: string;
  sectionName: string;
}

interface BulkCreateClassSectionsBody {
  academicYearId: string;
  classNames: string[];
  sectionNames: string[];
}

interface AssignTeacherBody {
  teacherUserId: string;
}

// A brand-new school (created via POST /schools) has zero academic years and
// zero class sections, and nothing else in the API could create either - the
// mobile app's /class-sections is read-only, and admission confirmation
// requires a class_section_id. These are the only write paths for either, so
// platform_admin/leadership/admin can actually finish setting up a school.
export async function authorizeForSchool(request: FastifyRequest, reply: FastifyReply, schoolId: string): Promise<boolean> {
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
        include: {
          classSections: {
            orderBy: [{ className: "asc" }, { sectionName: "asc" }],
            include: {
              teacherAssignments: {
                include: { teacher: { select: { id: true, fullName: true, email: true } } },
              },
            },
          },
        },
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
        const created = await tx.academicYear.create({
          data: {
            schoolId,
            label: body.label,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            isCurrent,
          },
        });

        // Optional copy-forward: bring over the previous year's class-section
        // structure (className + sectionName only, not teacher assignments,
        // since teachers are typically reassigned each year). Silently skip
        // if the source year doesn't belong to this school or has no sections.
        if (body.copyFromAcademicYearId) {
          const sourceYear = await tx.academicYear.findFirst({
            where: { id: body.copyFromAcademicYearId, schoolId },
          });
          if (sourceYear) {
            const sourceSections = await tx.classSection.findMany({
              where: { academicYearId: sourceYear.id },
            });
            if (sourceSections.length > 0) {
              await tx.classSection.createMany({
                data: sourceSections.map((section) => ({
                  academicYearId: created.id,
                  className: section.className,
                  sectionName: section.sectionName,
                })),
              });
            }
          }
        }

        return created;
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

  // Cross-product bulk create: e.g. classNames ["Grade 1","Grade 2"] x
  // sectionNames ["A","B"] creates up to 4 class sections in one call,
  // skipping any pair that already exists in this academic year.
  app.post<{ Params: { schoolId: string }; Body: BulkCreateClassSectionsBody }>(
    "/schools/:schoolId/class-sections/bulk",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const body = request.body ?? ({} as BulkCreateClassSectionsBody);
      if (!body.academicYearId || !Array.isArray(body.classNames) || !Array.isArray(body.sectionNames)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "academicYearId, classNames, and sectionNames are required" },
        });
      }

      const academicYear = await prisma.academicYear.findFirst({
        where: { id: body.academicYearId, schoolId: request.params.schoolId },
      });
      if (!academicYear) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Academic year not found for this school" } });
      }

      const classNames = [...new Set(body.classNames.map((name) => name.trim()).filter((name) => name.length > 0))];
      const sectionNames = [...new Set(body.sectionNames.map((name) => name.trim()).filter((name) => name.length > 0))];

      if (classNames.length === 0 || sectionNames.length === 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "At least one class name and one section name are required" },
        });
      }

      const existingSections = await prisma.classSection.findMany({
        where: { academicYearId: academicYear.id },
        select: { className: true, sectionName: true },
      });
      const existingKeys = new Set(existingSections.map((section) => `${section.className} ${section.sectionName}`));

      const pairsToCreate: { className: string; sectionName: string }[] = [];
      let skipped = 0;
      for (const className of classNames) {
        for (const sectionName of sectionNames) {
          const key = `${className} ${sectionName}`;
          if (existingKeys.has(key)) {
            skipped += 1;
            continue;
          }
          existingKeys.add(key);
          pairsToCreate.push({ className, sectionName });
        }
      }

      const created = await Promise.all(
        pairsToCreate.map((pair) =>
          prisma.classSection.create({
            data: { academicYearId: academicYear.id, className: pair.className, sectionName: pair.sectionName },
          })
        )
      );

      return reply.code(201).send({ data: { created, skipped }, meta: {} });
    }
  );

  // Which teacher(s) are assigned to a class section - drives the mobile app's
  // Lesson Studio "My Classes" scoping (GET /class-sections in class-sections.ts).
  app.post<{ Params: { schoolId: string; classSectionId: string }; Body: AssignTeacherBody }>(
    "/schools/:schoolId/class-sections/:classSectionId/teachers",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const body = request.body ?? ({} as AssignTeacherBody);
      if (!body.teacherUserId) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "teacherUserId is required" } });
      }

      const classSection = await prisma.classSection.findFirst({
        where: { id: request.params.classSectionId, academicYear: { schoolId: request.params.schoolId } },
      });
      if (!classSection) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found for this school" } });
      }

      const teacher = await prisma.appUser.findFirst({
        where: { id: body.teacherUserId, schoolId: request.params.schoolId, role: "teacher" },
      });
      if (!teacher) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Teacher not found for this school" } });
      }

      // Idempotent - re-assigning an already-assigned teacher is a no-op, not
      // a duplicate-key error.
      const assignment = await prisma.classSectionTeacher.upsert({
        where: { classSectionId_teacherUserId: { classSectionId: classSection.id, teacherUserId: teacher.id } },
        create: { classSectionId: classSection.id, teacherUserId: teacher.id },
        update: {},
      });

      return reply.code(201).send({ data: assignment, meta: {} });
    }
  );

  app.delete<{ Params: { schoolId: string; classSectionId: string; teacherUserId: string } }>(
    "/schools/:schoolId/class-sections/:classSectionId/teachers/:teacherUserId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const existing = await prisma.classSectionTeacher.findFirst({
        where: {
          classSectionId: request.params.classSectionId,
          teacherUserId: request.params.teacherUserId,
          classSection: { academicYear: { schoolId: request.params.schoolId } },
        },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
      }

      await prisma.classSectionTeacher.delete({ where: { id: existing.id } });

      return { data: { deleted: true }, meta: {} };
    }
  );
}
