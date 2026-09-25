import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { detectImageMime, imageKey, IMAGE_ONLY_ERROR } from "../lib/upload";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";
import { recordAuditEvent } from "../lib/audit";
import { loadStudentMe } from "../lib/student-me";
import { sendEmailInBackground } from "../lib/email/sender";
import { securityAlertEmail } from "../lib/email/templates";

// Self-service profile editing for staff (AppUser). Students (StudentStub)
// have no AppUser row and sign in with phone + OTP, so most handlers here
// reject role === "student" - the exception is the profile picture (photo /
// preset avatar / remove), which students set on their own Profile tab and
// which is stored on their StudentStub instead.
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
  hasDismissedProfilePrompt: true,
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

// Preset avatar sets bundled in unified-app (src/theme/avatars.ts - keep in
// sync). Teachers and students each pick from their own illustrated set;
// every other role still uses the original set.
const DEFAULT_AVATAR_KEYS = Array.from({ length: 10 }, (_, i) => `avatar-${String(i + 1).padStart(2, "0")}`);
const TEACHER_AVATAR_KEYS = Array.from({ length: 20 }, (_, i) => `teacher-avatar-${String(i + 1).padStart(2, "0")}`);
const STUDENT_AVATAR_KEYS = Array.from({ length: 20 }, (_, i) => `student-avatar-${String(i + 1).padStart(2, "0")}`);

function validAvatarKeysForRole(role: string): string[] {
  if (role === "teacher") return TEACHER_AVATAR_KEYS;
  if (role === "student") return STUDENT_AVATAR_KEYS;
  return DEFAULT_AVATAR_KEYS;
}

function isStudent(request: FastifyRequest): boolean {
  return request.user.role === "student";
}

// Writes a student's own picture fields and answers with the same shape as
// GET /auth/me, so the app can drop the result straight into its user state.
async function updateStudentPicture(
  studentId: string,
  data: { photoLocation: string | null; photoMimeType: string | null; avatarKey: string | null }
) {
  const existing = await prisma.studentStub.findUnique({ where: { id: studentId }, select: { photoLocation: true } });
  if (existing?.photoLocation && existing.photoLocation !== data.photoLocation) {
    await storage.remove(existing.photoLocation);
  }
  await prisma.studentStub.update({ where: { id: studentId }, data });
  return loadStudentMe(studentId);
}
const MIN_PASSWORD_LENGTH = 8;

interface UpdateMeBody {
  fullName?: string;
  phone?: string | null;
}

interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}

interface DeleteMeBody {
  password?: string;
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
      // Ends every existing session (other devices, a stolen refresh token); the
      // app signs the user back in with the new password.
      const updated = await prisma.appUser.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });

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

      sendEmailInBackground(user.email, securityAlertEmail({ name: user.fullName, event: "password_changed" }));

      // Fresh tokens for this device so the person who just changed their password
      // stays signed in here while every other session is ended.
      const claims = { sub: user.id, role: user.role, schoolId: user.schoolId, trustId: user.trustId, tv: updated.tokenVersion };
      return {
        data: {
          message: "Password updated",
          accessToken: app.jwt.sign({ ...claims, type: "access" }, { expiresIn: "15m" }),
          refreshToken: app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: "30d" }),
        },
        meta: {},
      };
    }
  );

  // Self-service account deletion (Apple Guideline 5.1.1(v) / Play Data
  // Safety require an in-app path for a user to delete an account they can
  // create in-app - individual teachers sign up from AuthScreen, so this
  // has to exist). AppUser rows are referenced by institutional records
  // (enquiries, generations, assessments, audit log, ...) that belong to
  // the school, not the person, so this anonymizes and disables the
  // account rather than hard-deleting the row - the login identity and all
  // personal fields are erased, which is what "delete my account" means to
  // the person even though the id stays for referential integrity.
  app.delete<{ Body: DeleteMeBody }>(
    "/auth/me",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (rejectStudents(request, reply)) return;

      const { password } = request.body ?? {};
      if (!password) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "password is required to confirm account deletion" },
        });
      }

      const user = await prisma.appUser.findUnique({ where: { id: request.user.sub } });
      if (!user) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Account not found" } });
      }
      if (user.status === "deleted") {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Account not found" } });
      }

      if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.code(401).send({
          data: null,
          error: { code: "invalid_credentials", message: "Incorrect password" },
        });
      }

      if (user.photoLocation) {
        await storage.remove(user.photoLocation);
      }

      await prisma.appUser.update({
        where: { id: user.id },
        data: {
          status: "deleted",
          tokenVersion: { increment: 1 },
          fullName: "Deleted user",
          email: `deleted-${user.id}@deleted.eduwand.invalid`,
          phone: null,
          passwordHash: null,
          authProviderId: null,
          photoLocation: null,
          photoMimeType: null,
          avatarKey: null,
        },
      });

      await recordAuditEvent({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "user.self_delete",
        targetType: "AppUser",
        targetId: user.id,
        targetLabel: user.email,
        schoolId: user.schoolId,
        trustId: user.trustId,
      });

      // Sent to the address the account had, which the update above just erased.
      sendEmailInBackground(user.email, securityAlertEmail({ name: user.fullName, event: "account_deleted" }));

      return { data: { message: "Account deleted" }, meta: {} };
    }
  );

  app.post(
    "/auth/me/photo",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "A file is required" } });
      }
      const buffer = await file.toBuffer();
      // Identify the image by its bytes, not the client-declared type.
      const imageMime = detectImageMime(buffer);
      if (!imageMime) return reply.code(400).send(IMAGE_ONLY_ERROR);

      if (isStudent(request)) {
        const key = imageKey(`${request.user.schoolId}/student-photos/${request.user.sub}`, imageMime);
        const { location } = await storage.save(key, buffer);
        const me = await updateStudentPicture(request.user.sub, { photoLocation: location, photoMimeType: imageMime, avatarKey: null });
        return reply.code(201).send({ data: me, meta: {} });
      }

      const key = imageKey(`staff-photos/${request.user.sub}`, imageMime);
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
        data: { photoLocation: location, photoMimeType: imageMime, avatarKey: null },
        select: ME_SELECT,
      });

      return reply.code(201).send({ data: flattenAccountType(user), meta: {} });
    }
  );

  app.patch<{ Body: SetAvatarBody }>(
    "/auth/me/avatar",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const avatarKey = request.body?.avatarKey;
      const validAvatarKeys = validAvatarKeysForRole(request.user.role);
      if (!avatarKey || !validAvatarKeys.includes(avatarKey)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `avatarKey must be one of ${validAvatarKeys.join(", ")}` },
        });
      }

      if (isStudent(request)) {
        return { data: await updateStudentPicture(request.user.sub, { avatarKey, photoLocation: null, photoMimeType: null }), meta: {} };
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
    async (request) => {
      if (isStudent(request)) {
        return { data: await updateStudentPicture(request.user.sub, { photoLocation: null, photoMimeType: null, avatarKey: null }), meta: {} };
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
      const select = { photoLocation: true, photoMimeType: true } as const;
      const user = isStudent(request)
        ? await prisma.studentStub.findUnique({ where: { id: request.user.sub }, select })
        : await prisma.appUser.findUnique({ where: { id: request.user.sub }, select });
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

  // "Complete your profile" prompt - called when the user taps Skip, so it
  // never shows again for this account (on any device).
  app.post("/auth/me/profile-prompt-dismissed", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (rejectStudents(request, reply)) return;
    await prisma.appUser.update({
      where: { id: request.user.sub },
      data: { hasDismissedProfilePrompt: true },
    });
    return { data: { hasDismissedProfilePrompt: true }, meta: {} };
  });
}
