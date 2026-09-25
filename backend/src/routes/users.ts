import { FastifyInstance } from "fastify";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE, INVITABLE_ROLES } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";
import { grantInitialCredits } from "../lib/credits";
import { sendEmailInBackground } from "../lib/email/sender";
import { staffInviteEmail, adminPasswordResetEmail } from "../lib/email/templates";

interface InviteUserBody {
  fullName: string;
  email: string;
  role: string;
  schoolId?: string;
  trustId?: string;
}

interface UpdateUserBody {
  role?: string;
  status?: string;
  schoolId?: string;
}

interface CreateRoleGrantBody {
  role: string;
}

const USER_STATUSES = ["active", "invited", "disabled"];

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/users",
    { onRequest: [app.authenticate, app.requireSchoolScope, requireRoles("admin", "leadership", PLATFORM_ADMIN_ROLE)] },
    async (request) => {
      const users = await prisma.appUser.findMany({
        where: { schoolId: request.schoolId },
        select: { id: true, fullName: true, email: true, role: true, status: true, schoolId: true },
        orderBy: { fullName: "asc" },
      });

      return { data: users, meta: {} };
    }
  );

  app.post<{ Body: InviteUserBody }>(
    "/users",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
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

    // Teacher seats are the billed unit - self-service invite is capped at
    // the trust's plan (Plan.teacherSeatLimit). A trust with no plan
    // assigned is grandfathered as unlimited, so this never retroactively
    // breaks an existing institutional customer. platform_admin always
    // bypasses this. See Docs/superpowers/plans/2026-09-09-individual-
    // teacher-onboarding-and-credits.md.
    if (body.role === "teacher" && trustId && caller.role !== PLATFORM_ADMIN_ROLE) {
      const trust = await prisma.trust.findUnique({ where: { id: trustId }, select: { plan: true } });
      if (trust?.plan) {
        const currentTeacherCount = await prisma.appUser.count({
          where: { trustId, role: "teacher", status: { not: "disabled" } },
        });
        if (currentTeacherCount >= trust.plan.teacherSeatLimit) {
          return reply.code(400).send({
            data: null,
            error: {
              code: "teacher_seat_limit_reached",
              message: `Your plan includes ${trust.plan.teacherSeatLimit} teacher seat${trust.plan.teacherSeatLimit === 1 ? "" : "s"}. Contact EduWand to add more.`,
            },
          });
        }
      }
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

    // Credits are billed per teacher seat regardless of account type - grant
    // at whichever path creates the AppUser (individual signup handles its
    // own grant inside its transaction; this is the institutional-invite
    // path). See Docs/superpowers/plans/2026-09-09-individual-teacher-
    // onboarding-and-credits.md.
    if (body.role === "teacher") {
      await grantInitialCredits(prisma, user.id, trustId);
    }

    await recordAuditEvent({
      actorUserId: caller.sub,
      actorEmail: (await prisma.appUser.findUnique({ where: { id: caller.sub }, select: { email: true } }))?.email ?? "unknown",
      action: "user.invite",
      targetType: "AppUser",
      targetId: user.id,
      targetLabel: user.email,
      schoolId,
      trustId,
      metadata: { role: user.role },
    });

    // Still returned in the response for the admin, but also emailed so the
    // new person doesn't depend on being handed it out-of-band.
    const [inviter, school] = await Promise.all([
      prisma.appUser.findUnique({ where: { id: caller.sub }, select: { fullName: true } }),
      schoolId ? prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }) : null,
    ]);
    sendEmailInBackground(
      user.email,
      staffInviteEmail({
        name: user.fullName,
        email: user.email,
        role: user.role,
        schoolName: school?.name,
        invitedByName: inviter?.fullName,
        tempPassword,
      })
    );

    return reply.code(201).send({ data: user, meta: { tempPassword } });
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateUserBody }>(
    "/users/:id",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const caller = request.user;
      const body = request.body ?? ({} as UpdateUserBody);

      if (body.role && !INVITABLE_ROLES.includes(body.role)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `role must be one of ${INVITABLE_ROLES.join(", ")}` },
        });
      }
      if (body.status && !USER_STATUSES.includes(body.status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${USER_STATUSES.join(", ")}` },
        });
      }

      const target = await prisma.appUser.findUnique({ where: { id: request.params.id } });
      if (!target) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "User not found" } });
      }

      if (target.id === caller.sub) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Cannot change your own role or status" } });
      }

      let newSchoolId: string | undefined;
      if (body.schoolId !== undefined) {
        if (caller.role === PLATFORM_ADMIN_ROLE) {
          const destSchool = await prisma.school.findUnique({ where: { id: body.schoolId } });
          if (!destSchool) {
            return reply.code(404).send({ data: null, error: { code: "not_found", message: "Destination school not found" } });
          }
          newSchoolId = destSchool.id;
        } else if (caller.role === "leadership") {
          if (!caller.trustId || target.trustId !== caller.trustId) {
            return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your trust" } });
          }
          const destSchool = await prisma.school.findFirst({ where: { id: body.schoolId, trustId: caller.trustId } });
          if (!destSchool) {
            return reply.code(404).send({ data: null, error: { code: "not_found", message: "Destination school not found in your trust" } });
          }
          newSchoolId = destSchool.id;
        } else {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Only platform_admin or leadership can reassign a user's school" } });
        }
      }

      if (caller.role === PLATFORM_ADMIN_ROLE) {
      } else if (caller.role === "admin") {
        if (target.schoolId !== caller.schoolId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your school" } });
        }
        if (target.role === "leadership" || body.role === "leadership") {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "admin cannot manage leadership users" } });
        }
      } else if (caller.role === "leadership") {
        if (target.trustId !== caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your trust" } });
        }
      } else {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Requires role: platform_admin, admin, or leadership" },
        });
      }

      const user = await prisma.appUser.update({
        where: { id: target.id },
        data: {
          role: body.role ?? undefined,
          status: body.status ?? undefined,
          schoolId: newSchoolId,
          // Changing role, school or status must not leave old sessions with the old access.
          ...(body.role || body.status || newSchoolId !== undefined ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: { id: true, fullName: true, email: true, role: true, status: true, schoolId: true },
      });

      const actor = await prisma.appUser.findUnique({ where: { id: caller.sub }, select: { email: true } });
      const changes: Record<string, unknown> = {};
      if (body.role) changes.role = { from: target.role, to: body.role };
      if (body.status) changes.status = { from: target.status, to: body.status };
      if (newSchoolId) changes.schoolId = { from: target.schoolId, to: newSchoolId };

      await recordAuditEvent({
        actorUserId: caller.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "user.update",
        targetType: "AppUser",
        targetId: user.id,
        targetLabel: user.email,
        schoolId: user.schoolId,
        trustId: target.trustId,
        metadata: changes,
      });

      return { data: user, meta: {} };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/users/:id/reset-password",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const caller = request.user;

      const target = await prisma.appUser.findUnique({ where: { id: request.params.id } });
      if (!target) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "User not found" } });
      }
      if (target.id === caller.sub) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Use the self-service Forgot Password flow for your own account" } });
      }

      if (caller.role === PLATFORM_ADMIN_ROLE) {
      } else if (caller.role === "admin") {
        if (target.schoolId !== caller.schoolId || target.role === "leadership") {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this user" } });
        }
      } else if (caller.role === "leadership") {
        if (target.trustId !== caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your trust" } });
        }
      } else {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Requires role: platform_admin, admin, or leadership" },
        });
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const user = await prisma.appUser.update({
        where: { id: target.id },
        data: { passwordHash, status: "invited", tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
        select: { id: true, fullName: true, email: true, role: true, status: true },
      });

      const actor = await prisma.appUser.findUnique({ where: { id: caller.sub }, select: { email: true, fullName: true } });
      const targetSchool = target.schoolId ? await prisma.school.findUnique({ where: { id: target.schoolId }, select: { name: true } }) : null;
      sendEmailInBackground(
        user.email,
        adminPasswordResetEmail({
          name: user.fullName,
          email: user.email,
          tempPassword,
          resetByName: actor?.fullName,
          schoolName: targetSchool?.name,
        })
      );
      await recordAuditEvent({
        actorUserId: caller.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "user.admin_password_reset",
        targetType: "AppUser",
        targetId: user.id,
        targetLabel: user.email,
        schoolId: target.schoolId,
        trustId: target.trustId,
      });

      return { data: user, meta: { tempPassword } };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/users/:id/role-grants",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const caller = request.user;

      const target = await prisma.appUser.findUnique({ where: { id: request.params.id } });
      if (!target) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "User not found" } });
      }

      if (caller.role === PLATFORM_ADMIN_ROLE) {
      } else if (caller.role === "admin") {
        if (target.schoolId !== caller.schoolId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your school" } });
        }
        if (target.role === "leadership") {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "admin cannot manage leadership users" } });
        }
      } else if (caller.role === "leadership") {
        if (target.trustId !== caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your trust" } });
        }
      } else {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Requires role: platform_admin, admin, or leadership" },
        });
      }

      const grants = await prisma.userRoleGrant.findMany({
        where: { userId: target.id },
        select: { id: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      return { data: grants, meta: {} };
    }
  );

  app.post<{ Params: { id: string }; Body: CreateRoleGrantBody }>(
    "/users/:id/role-grants",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const caller = request.user;
      const body = request.body ?? ({} as CreateRoleGrantBody);

      if (!body.role || !INVITABLE_ROLES.includes(body.role)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `role must be one of ${INVITABLE_ROLES.join(", ")}` },
        });
      }

      const target = await prisma.appUser.findUnique({ where: { id: request.params.id } });
      if (!target) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "User not found" } });
      }

      if (target.id === caller.sub) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Cannot grant yourself an additional role" } });
      }

      if (caller.role === PLATFORM_ADMIN_ROLE) {
      } else if (caller.role === "admin") {
        if (target.schoolId !== caller.schoolId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your school" } });
        }
        if (target.role === "leadership" || body.role === "leadership") {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "admin cannot manage leadership users" } });
        }
      } else if (caller.role === "leadership") {
        if (target.trustId !== caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your trust" } });
        }
      } else {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Requires role: platform_admin, admin, or leadership" },
        });
      }

      if (target.role === body.role) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "User already has this role as their primary role" },
        });
      }

      const existingGrant = await prisma.userRoleGrant.findFirst({ where: { userId: target.id, role: body.role } });
      if (existingGrant) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "User already has this role granted" },
        });
      }

      const grant = await prisma.userRoleGrant.create({
        data: { userId: target.id, role: body.role },
        select: { id: true, role: true, createdAt: true },
      });

      const actor = await prisma.appUser.findUnique({ where: { id: caller.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: caller.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "user.role_grant_added",
        targetType: "AppUser",
        targetId: target.id,
        targetLabel: target.email,
        schoolId: target.schoolId,
        trustId: target.trustId,
        metadata: { role: body.role },
      });

      return reply.code(201).send({ data: grant, meta: {} });
    }
  );

  app.delete<{ Params: { id: string; grantId: string } }>(
    "/users/:id/role-grants/:grantId",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const caller = request.user;

      const target = await prisma.appUser.findUnique({ where: { id: request.params.id } });
      if (!target) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "User not found" } });
      }

      if (target.id === caller.sub) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Cannot remove your own role grant" } });
      }

      if (caller.role === PLATFORM_ADMIN_ROLE) {
      } else if (caller.role === "admin") {
        if (target.schoolId !== caller.schoolId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your school" } });
        }
        if (target.role === "leadership") {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "admin cannot manage leadership users" } });
        }
      } else if (caller.role === "leadership") {
        if (target.trustId !== caller.trustId) {
          return reply.code(403).send({ data: null, error: { code: "forbidden", message: "User not in your trust" } });
        }
      } else {
        return reply.code(403).send({
          data: null,
          error: { code: "forbidden", message: "Requires role: platform_admin, admin, or leadership" },
        });
      }

      const grant = await prisma.userRoleGrant.findUnique({ where: { id: request.params.grantId } });
      if (!grant || grant.userId !== target.id) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Role grant not found" } });
      }

      await prisma.userRoleGrant.delete({ where: { id: grant.id } });

      const actor = await prisma.appUser.findUnique({ where: { id: caller.sub }, select: { email: true } });
      await recordAuditEvent({
        actorUserId: caller.sub,
        actorEmail: actor?.email ?? "unknown",
        action: "user.role_grant_removed",
        targetType: "AppUser",
        targetId: target.id,
        targetLabel: target.email,
        schoolId: target.schoolId,
        trustId: target.trustId,
        metadata: { role: grant.role },
      });

      return { data: { id: grant.id }, meta: {} };
    }
  );
}
