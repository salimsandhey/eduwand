import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

// Read-only lookup for the Admission Confirmation screen's class/section selector
// (Docs/Dev/EduWand_UI_Screen_Spec.md, Admission Confirmation). Not in the original
// API spec table - added because that screen has no other way to list valid
// class_section_id values to submit with POST /enquiries/:id/confirm-admission.
export async function classSectionRoutes(app: FastifyInstance) {
  app.get("/class-sections", { onRequest: scoped(app) }, async (request) => {
    const classSections = await prisma.classSection.findMany({
      where: {
        academicYear: { schoolId: request.schoolId, isCurrent: true },
        // Teachers only see classes school admin has assigned them to
        // (Lesson Studio's "My Classes" screen). Every other role (front_desk,
        // admin, etc.) keeps seeing everything - this route is shared with the
        // Admission Confirmation screen above.
        ...(request.user.role === "teacher"
          ? { teacherAssignments: { some: { teacherUserId: request.user.sub } } }
          : {}),
      },
      orderBy: [{ className: "asc" }, { sectionName: "asc" }],
    });

    return { data: classSections, meta: {} };
  });
}
