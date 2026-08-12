import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface ListQuery {
  schoolId?: string;
  page?: string;
  pageSize?: string;
}

export async function auditLogRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/audit-log",
    { onRequest: [app.authenticate, requireRoles("admin", "leadership", PLATFORM_ADMIN_ROLE)] },
    async (request, reply) => {
      const caller = request.user;
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 30));

      let where: { schoolId?: string; trustId?: string } = {};

      if (caller.role === PLATFORM_ADMIN_ROLE) {
        if (request.query.schoolId) where = { schoolId: request.query.schoolId };
        // otherwise unscoped - platform_admin sees everything
      } else if (caller.role === "leadership") {
        if (!caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "No trust scope on this account" } });
        }
        if (request.query.schoolId) {
          const school = await prisma.school.findFirst({ where: { id: request.query.schoolId, trustId: caller.trustId } });
          if (!school) {
            return reply.code(403).send({ data: null, error: { code: "forbidden", message: "School not in your trust" } });
          }
          where = { schoolId: school.id };
        } else {
          where = { trustId: caller.trustId };
        }
      } else {
        if (!caller.schoolId) {
          return reply.code(403).send({
            data: null,
            error: { code: "school_scope_required", message: "This endpoint requires a user scoped to a single school" },
          });
        }
        where = { schoolId: caller.schoolId };
      }

      const [items, totalCount] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return { data: items, meta: { page, pageSize, totalCount } };
    }
  );
}
