import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";
import { recordAuditEvent } from "../lib/audit";

// Self-service profile editing for staff (AppUser). Students (StudentStub) are
// deliberately out of scope - they have no AppUser row and sign in with phone +
// OTP, so every handler here rejects role === "student".
//
// Field policy: only personal / cosmetic fields are self-editable. Anything an
// RBAC check, a tenancy scope, or the login lookup depends on (email, role,
// status, schoolId, trustId) stays admin-only via /users/:id.

const ME_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  schoolId: true,
  trustId: true,
  status: true,
  photoMimeType: true,
  avatarKey: true,
  hasSeenOnboardingTour: true,
  school: { select: { accountType: true } },
} as const;

// Every ME_SELECT response nests accountType under `school` - flatten it so
// the shape matches GET /auth/me (auth.ts) and the mobile CurrentUser type.
// See Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.
function flattenAccountType<T extends { school: { accountType: string } | null }>(user: T) {
  const { school, ...rest } = user;
  return { ...rest, accountType: school?.accountType ?? null };
}

const VALID_AVATAR_KEYS = Array.from({ length: 10 }, (_, i) => `avatar-${String(i + 1).padStart(2, "0")}`);
const MIN_PASSWORD_LENGTH = 8;

interface UpdateMeBody {
  fullName?: string;
  phone?: string | null;
}

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

interface SetAvatarBody {
  avatarKey?: string;
}

function rejectStudents(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.role === "student") {
    reply.code(403).send({
      data: null,
      error: { code: "forbidden", message: "Profile editing is not available for student accounts" },
    });
    return true;
  }
  return false;
}

// <img>/<Image source={{uri}}> can't attach an Authorization header, so the
// photo GET also accepts ?token= - same helper enquiry-photo.ts uses.
function authenticateFromHeaderOrQuery(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) {
      const token = (request.query as { token?: string } | undefined)?.token;
      if (token) request.headers.authorization = `Bearer ${token}`;
    }
    await app.authenticate(request, reply);
  };
}

export async function authMeRoutes(app: FastifyInstance) {
  app.patch<{ Body: UpdateMeBody }>(
    "/auth/me",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (rejectStudents(request, reply)) return;

      const body = request.body ?? {};
      const data: { fullName?: string; phone?: string | null } = {};

      if (body.fullName !== undefined) {
        const trimmed = body.fullName.trim();
        if (trimmed.length < 2) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "fullName must be at least 2 characters" },
          });
        }
        data.fullName = trimmed;
      }

      if (body.phone !== undefined) {
        const trimmed = body.phone?.trim() ?? "";
        data.phone = trimmed.length > 0 ? trimmed : null;
      }

      if (Object.keys(data).length === 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Nothing to update" },
        });
      }

      const user = await prisma.appUser.update({
        where: { id: request.user.sub },
        data,
        select: ME_SELECT,
      });

      await recordAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "user.self_update",
        targetType: "AppUser",
        targetId: user.id,
        targetLabel: user.email,
        schoolId: user.schoolId,
        trustId: user.trustId,
        metadata: { fields: Object.keys(data) },
      });

      return { data: flattenAccountType(user), meta: {} };
    }
  );

  app.post<{ Body: ChangePasswordBody }>(
    "/auth/me/change-password",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (rejectStudents(request, reply)) return;

      const { currentPassword, newPassword } = request.body ?? {};

      if (!currentPassword || !newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({
          data: null,
          error: {
            code: "validation_error",
            message: `currentPassword and a newPassword of at least ${MIN_PASSWORD_LENGTH} characters are required`,
          },
        });
      }

      const user = await prisma.appUser.findUnique({ where: { id: request.user.sub } });
      if (!user || !user.passwordHash) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Account not found" } });
      }

      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) {
        return reply.code(401).send({
          data: null,
          error: { code: "invalid_credentials", message: "Current password is incorrect" },
        });
      }

      if (await bcrypt.compare(newPassword, user.passwordHash)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "New password must be different from the current one" },
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.appUser.update({ where: { id: user.id }, data: { passwordHash } });

      await recordAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "user.self_password_change",
        targetType: "AppUser",
        targetId: user.id,
        targetLabel: user.email,
        schoolId: user.schoolId,
        trustId: user.trustId,
      });

      return { data: { message: "Password updated" }, meta: {} };
    }
  );

  app.post(
    "/auth/me/photo",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (rejectStudents(request, reply)) return;

      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "A file is required" } });
      }
      if (!file.mimetype.startsWith("image/")) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Photo must be an image file" } });
      }

      const buffer = await file.toBuffer();
      const key = `staff-photos/${request.user.sub}/${Date.now()}-${file.filename}`;
      const { location } = await storage.save(key, buffer);

      const existing = await prisma.appUser.findUnique({
        where: { id: request.user.sub },
        select: { photoLocation: true },
      });
      if (existing?.photoLocation) {
        await storage.remove(existing.photoLocation);
      }

      const user = await prisma.appUser.update({
        where: { id: request.user.sub },
        data: { photoLocation: location, photoMimeType: file.mimetype, avatarKey: null },
        select: ME_SELECT,
      });

      return reply.code(201).send({ data: flattenAccountType(user), meta: {} });
    }
  );

  app.patch<{ Body: SetAvatarBody }>(
    "/auth/me/avatar",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (rejectStudents(request, reply)) return;

      const avatarKey = request.body?.avatarKey;
      if (!avatarKey || !VALID_AVATAR_KEYS.includes(avatarKey)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `avatarKey must be one of ${VALID_AVATAR_KEYS.join(", ")}` },
        });
      }

      const existing = await prisma.appUser.findUnique({
        where: { id: request.user.sub },
        select: { photoLocation: true },
      });
      if (existing?.photoLocation) {
        await storage.remove(existing.photoLocation);
      }

      const user = await prisma.appUser.update({
        where: { id: request.user.sub },
        data: { avatarKey, photoLocation: null, photoMimeType: null },
        select: ME_SELECT,
      });

      return { data: flattenAccountType(user), meta: {} };
    }
  );

  app.delete(
    "/auth/me/photo",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (rejectStudents(request, reply)) return;

      const existing = await prisma.appUser.findUnique({
        where: { id: request.user.sub },
        select: { photoLocation: true },
      });
      if (existing?.photoLocation) {
        await storage.remove(existing.photoLocation);
      }

      const user = await prisma.appUser.update({
        where: { id: request.user.sub },
        data: { photoLocation: null, photoMimeType: null, avatarKey: null },
        select: ME_SELECT,
      });

      return { data: flattenAccountType(user), meta: {} };
    }
  );

  app.get(
    "/auth/me/photo",
    { onRequest: [authenticateFromHeaderOrQuery(app)] },
    async (request, reply) => {
      if (request.user.role === "student") {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "No photo" } });
      }

      const user = await prisma.appUser.findUnique({
        where: { id: request.user.sub },
        select: { photoLocation: true, photoMimeType: true },
      });
      if (!user || !user.photoLocation || !user.photoMimeType) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "No photo uploaded" } });
      }

      const buffer = await storage.readBuffer(user.photoLocation);
      reply.type(user.photoMimeType);
      return reply.send(buffer);
    }
  );

  // First-login product tour (mobile, teacher role only for now) - called
  // once the teacher dismisses/completes the tour so it never shows again.
  app.post("/auth/me/onboarding-tour-seen", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (rejectStudents(request, reply)) return;
    await prisma.appUser.update({
      where: { id: request.user.sub },
      data: { hasSeenOnboardingTour: true },
    });
    return { data: { hasSeenOnboardingTour: true }, meta: {} };
  });
}
