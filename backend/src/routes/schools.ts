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
}
