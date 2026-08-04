import { FastifyReply, FastifyRequest } from "fastify";

// Lightweight role guard for endpoints restricted to specific roles.
// Full RBAC coverage across every route is a separate, later sub-module (FR-EG-9) -
// this exists now to satisfy the API spec's explicit 403 example: "a teacher
// calling an admin-only analytics endpoint".
export function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({
        data: null,
        error: { code: "forbidden", message: `Requires role: ${roles.join(" or ")}` },
      });
    }
  };
}
