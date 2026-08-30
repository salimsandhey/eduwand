import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

export async function classSectionRoutes(app: FastifyInstance) {
  app.get("/class-sections", { onRequest: scoped(app) }, async (request) => {
    const classSections = await prisma.classSection.findMany({
      where: {
        academicYear: { schoolId: request.schoolId, isCurrent: true },
        ...(request.user.role === "teacher"
          ? { teacherAssignments: { some: { teacherUserId: request.user.sub } } }
          : {}),
      },
      orderBy: [{ className: "asc" }, { sectionName: "asc" }],
    });

    return { data: classSections, meta: {} };
  });
}
