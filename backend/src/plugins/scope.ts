import fp from "fastify-plugin";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    requireSchoolScope: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    schoolId: string;
  }
}

// Derives schoolId strictly from the verified JWT, never from a client-supplied
// param/query/body value, per API Specification section 1 and 7.
export const scopePlugin = fp(async (app: FastifyInstance) => {
  app.decorate("requireSchoolScope", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.schoolId) {
      reply.code(403).send({
        data: null,
        error: {
          code: "school_scope_required",
          message: "This endpoint requires a user scoped to a single school",
        },
      });
      return;
    }

    request.schoolId = request.user.schoolId;
  });
});
