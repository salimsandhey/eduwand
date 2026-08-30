import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma";
import { AppJwtPayload } from "../types/fastify-jwt";

// Effective role set for a user = { user.role } union { UserRoleGrant.role for
// each grant row } (Phase 1 of Growth Engine access control, see D-5 in
// Docs/Dev/GrowthEngine_Rebuild_Plan.md) - grants are additive, never restrictive.
export async function hasAnyRole(user: AppJwtPayload, ...roles: string[]): Promise<boolean> {
  if (roles.includes(user.role)) {
    return true;
  }
  const grants = await prisma.userRoleGrant.findMany({
    where: { userId: user.sub },
    select: { role: true },
  });
  return grants.some((grant) => roles.includes(grant.role));
}

export function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await hasAnyRole(request.user, ...roles))) {
      reply.code(403).send({
        data: null,
        error: { code: "forbidden", message: `Requires role: ${roles.join(" or ")}` },
      });
    }
  };
}
