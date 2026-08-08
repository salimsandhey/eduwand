import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface CreateSchoolBody {
  trustId?: string;
  name: string;
  board: string;
  address?: string;
  timezone?: string;
}

interface UpdateSchoolBody {
  name?: string;
  board?: string;
  address?: string;
  timezone?: string;
  status?: string;
}

const SCHOOL_STATUSES = ["onboarding", "active", "suspended"];

// Two ways to reach this endpoint (Docs/Dev/EduWand_Engineering_PRD.md section 4.1:
// "many buyers run 2 to 5 schools under one trust"):
//   - platform_admin: onboarding a school under ANY trust, must name it explicitly
//   - leadership: adding a school to their OWN trust only - trustId is forced from
//     the token, never taken from the request body, same rule as school_id scoping
//     elsewhere in this API
async function requirePlatformAdminOrLeadership(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== PLATFORM_ADMIN_ROLE && request.user.role !== "leadership") {
    reply.code(403).send({
      data: null,
      error: { code: "forbidden", message: "Requires role: platform_admin or leadership" },
    });
  }
}

export async function schoolRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateSchoolBody }>(
    "/schools",
    { onRequest: [app.authenticate, requirePlatformAdminOrLeadership] },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateSchoolBody);

      if (!body.name || !body.board) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "name and board are required" },
        });
      }

      let trustId: string;
      if (request.user.role === PLATFORM_ADMIN_ROLE) {
        if (!body.trustId) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "trustId is required" },
          });
        }
        trustId = body.trustId;
      } else {
        // leadership - trustId always comes from the token, never the body
        trustId = request.user.trustId as string;
      }

      const trust = await prisma.trust.findUnique({ where: { id: trustId } });
      if (!trust) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
      }

      const school = await prisma.school.create({
        data: {
          trustId,
          name: body.name,
          board: body.board,
          address: body.address,
          timezone: body.timezone ?? "Asia/Kolkata",
          status: "onboarding",
        },
      });

      return reply.code(201).send({ data: school, meta: {} });
    }
  );

  // List schools. platform_admin sees everything (optionally filtered by ?trustId=),
  // leadership only ever sees their own trust's schools - trustId is forced from the
  // token, same rule as elsewhere in this route file - and a bare admin sees just
  // their own single school.
  app.get<{ Querystring: { trustId?: string } }>(
    "/schools",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const caller = request.user;

      if (caller.role === PLATFORM_ADMIN_ROLE) {
        const schools = await prisma.school.findMany({
          where: request.query.trustId ? { trustId: request.query.trustId } : {},
          select: { id: true, trustId: true, name: true, board: true, status: true },
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
          select: { id: true, trustId: true, name: true, board: true, status: true },
          orderBy: { name: "asc" },
        });
        return { data: schools, meta: {} };
      }

      if (caller.schoolId) {
        const schools = await prisma.school.findMany({
          where: { id: caller.schoolId },
          select: { id: true, trustId: true, name: true, board: true, status: true },
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

      return { data: school, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateSchoolBody }>(
    "/schools/:id",
    { onRequest: [app.authenticate, requirePlatformAdminOrLeadership] },
    async (request, reply) => {
      const caller = request.user;
      const body = request.body ?? ({} as UpdateSchoolBody);

      if (body.status && !SCHOOL_STATUSES.includes(body.status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${SCHOOL_STATUSES.join(", ")}` },
        });
      }

      const existing = await prisma.school.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
      }
      if (caller.role === "leadership" && existing.trustId !== caller.trustId) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "School not in your trust" } });
      }

      const school = await prisma.school.update({
        where: { id: request.params.id },
        data: {
          name: body.name ?? undefined,
          board: body.board ?? undefined,
          address: body.address ?? undefined,
          timezone: body.timezone ?? undefined,
          status: body.status ?? undefined,
        },
      });

      return { data: school, meta: {} };
    }
  );
}
