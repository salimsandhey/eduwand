import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

interface ListQuery {
  classSectionId?: string;
  page?: string;
  pageSize?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

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
}
