import fp from "fastify-plugin";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";

declare module "fastify" {
  interface FastifyInstance {
    requireSchoolScope: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    schoolId: string;
  }
}

// Derives schoolId strictly from the verified JWT for schoolId-bearing users
// (unchanged from before, never a client-supplied value for them), per API
// Specification section 1 and 7. leadership users have a trustId but no single
// schoolId, so for them alone this accepts a ?schoolId= query param, validated
// against their own trust before being trusted.
export const scopePlugin = fp(async (app: FastifyInstance) => {
  app.decorate("requireSchoolScope", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;

    if (user?.schoolId) {
      request.schoolId = user.schoolId;
      return;
    }

    if (user?.role === "leadership" && user.trustId) {
      const schoolId = (request.query as { schoolId?: string } | undefined)?.schoolId;
      if (!schoolId) {
        reply.code(400).send({
          data: null,
          error: {
            code: "school_selection_required",
            message: "Pass ?schoolId= for a school in your trust to view its data",
          },
        });
        return;
      }

      const school = await prisma.school.findFirst({ where: { id: schoolId, trustId: user.trustId } });
      if (!school) {
        reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "School not in your trust" },
        });
        return;
      }

      request.schoolId = school.id;
      return;
    }

    reply.code(403).send({
      data: null,
      error: {
        code: "school_scope_required",
        message: "This endpoint requires a user scoped to a single school",
      },
    });
  });
});
