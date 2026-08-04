import { FastifyInstance } from "fastify";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE, INVITABLE_ROLES } from "../lib/roles";

interface InviteUserBody {
  fullName: string;
  email: string;
  role: string;
  schoolId?: string;
  trustId?: string;
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, url-safe
}

// Read-only list for the Admin Dashboard's User and Role Management screen
// (Docs/Dev/EduWand_UI_Screen_Spec.md section 5).
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

  // Invite flow (FR-EG-9, and the onboarding sub-module). No email delivery exists
  // yet - same stub pattern as messaging/storage - so the generated temp password is
  // returned in the response for the caller to relay themselves, and never logged.
  //   - platform_admin: can invite into any school or trust, explicitly named in the body
  //   - admin: can only invite into their own school, and only into non-leadership roles
  //   - leadership: can invite into any school within their own trust (or another
  //     trust-level user), never into a different trust
  app.post<{ Body: InviteUserBody }>("/users", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = request.body ?? ({} as InviteUserBody);
    const caller = request.user;

    if (!body.fullName || !body.email || !body.role) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "fullName, email, and role are required" },
      });
    }

    if (!INVITABLE_ROLES.includes(body.role)) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: `role must be one of ${INVITABLE_ROLES.join(", ")}` },
      });
    }

    let schoolId: string | null = null;
    let trustId: string | null = null;

    if (caller.role === PLATFORM_ADMIN_ROLE) {
      if (!body.schoolId && !body.trustId) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "schoolId or trustId is required" },
        });
      }
      if (body.schoolId) {
        const school = await prisma.school.findUnique({ where: { id: body.schoolId } });
        if (!school) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "School not found" } });
        }
        schoolId = school.id;
        trustId = school.trustId;
      } else {
        const trust = await prisma.trust.findUnique({ where: { id: body.trustId } });
        if (!trust) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Trust not found" } });
        }
        trustId = trust.id;
      }
    } else if (caller.role === "admin") {
      if (!caller.schoolId) {
        return reply.code(403).send({
          data: null,
          error: { code: "school_scope_required", message: "This endpoint requires a user scoped to a single school" },
        });
      }
      if (body.role === "leadership") {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "admin cannot invite a leadership user" },
        });
      }
      schoolId = caller.schoolId;
      trustId = caller.trustId;
    } else if (caller.role === "leadership") {
      if (!caller.trustId) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "No trust scope on this account" } });
      }
      if (body.schoolId) {
        const school = await prisma.school.findFirst({ where: { id: body.schoolId, trustId: caller.trustId } });
        if (!school) {
          return reply.code(404).send({
            data: null,
            error: { code: "not_found", message: "School not found in your trust" },
          });
        }
        schoolId = school.id;
      }
      trustId = caller.trustId;
    } else {
      return reply.code(403).send({
        data: null,
        error: { code: "forbidden", message: "Requires role: platform_admin, admin, or leadership" },
      });
    }

    const existing = await prisma.appUser.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "A user with this email already exists" },
      });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.appUser.create({
      data: {
        schoolId,
        trustId,
        fullName: body.fullName,
        email: body.email,
        role: body.role,
        status: "invited",
        passwordHash,
      },
      select: { id: true, fullName: true, email: true, role: true, status: true },
    });

    return reply.code(201).send({ data: user, meta: { tempPassword } });
  });
}
