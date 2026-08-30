import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { authorizeForSchool } from "./academic-structure";

interface CreateSubjectBody {
  name: string;
}

export async function subjectRoutes(app: FastifyInstance) {
  app.get<{ Params: { schoolId: string } }>(
    "/schools/:schoolId/subjects",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const subjects = await prisma.subject.findMany({
        where: { schoolId: request.params.schoolId },
        orderBy: { name: "asc" },
      });

      return { data: subjects, meta: {} };
    }
  );

  app.post<{ Params: { schoolId: string }; Body: CreateSubjectBody }>(
    "/schools/:schoolId/subjects",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const body = request.body ?? ({} as CreateSubjectBody);
      const name = body.name?.trim();
      if (!name) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "name is required" } });
      }

      const subject = await prisma.subject.upsert({
        where: { schoolId_name: { schoolId: request.params.schoolId, name } },
        create: { schoolId: request.params.schoolId, name },
        update: {},
      });

      return reply.code(201).send({ data: subject, meta: {} });
    }
  );

  app.delete<{ Params: { schoolId: string; id: string } }>(
    "/schools/:schoolId/subjects/:id",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;

      const existing = await prisma.subject.findFirst({
        where: { id: request.params.id, schoolId: request.params.schoolId },
      });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Subject not found" } });
      }

      await prisma.subject.delete({ where: { id: existing.id } });

      return { data: { deleted: true }, meta: {} };
    }
  );

  app.get(
    "/subjects",
    { onRequest: [app.authenticate, app.requireSchoolScope] },
    async (request) => {
      const subjects = await prisma.subject.findMany({
        where: { schoolId: request.schoolId },
        orderBy: { name: "asc" },
      });

      return { data: subjects, meta: {} };
    }
  );
}
