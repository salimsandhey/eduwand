import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

// Read-only for now, for the Admin Dashboard's User and Role Management screen
// (Docs/Dev/EduWand_UI_Screen_Spec.md section 5). Invite/role-change/disable actions
// need a real invite flow (email, auth_provider_id issuance) that hasn't been
// designed yet - this endpoint only lists existing users.
export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/users",
    { onRequest: [app.authenticate, app.requireSchoolScope, requireRoles("admin", "leadership")] },
    async (request) => {
      const users = await prisma.appUser.findMany({
        where: { schoolId: request.schoolId },
        select: { id: true, fullName: true, email: true, role: true, status: true },
        orderBy: { fullName: "asc" },
      });

      return { data: users, meta: {} };
    }
  );
}
