import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { loadStudentMe } from "../lib/student-me";
import { AppJwtPayload } from "../types/fastify-jwt";
import { sendEmail, sendEmailInBackground } from "../lib/email/sender";
import { loginCodeEmail, securityAlertEmail } from "../lib/email/templates";
import { generateOtpCode, isDevOtpMode, hashOtpCode, compareOtpCode, OTP_TTL_MS, MAX_OTP_ATTEMPTS, OTP_REQUEST_WINDOW_MS, MAX_OTP_REQUESTS_PER_WINDOW } from "../lib/otp";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

interface LoginBody {
  email: string;
  password: string;
}

interface RequestPasswordResetBody {
  email: string;
}

interface ResetPasswordBody {
  email: string;
  code: string;
  newPassword: string;
}

// Five wrong passwords lock the account for 15 minutes. Hashed once at boot so a
// login for an email that doesn't exist still costs a bcrypt compare - otherwise
// the faster response would reveal which emails have accounts.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const TIMING_DECOY_HASH = bcrypt.hashSync("eduwand-timing-decoy", 10);

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { password } = request.body ?? {};
    const email = request.body?.email?.trim().toLowerCase();

    if (!email || !password) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "email and password are required" },
      });
    }

    const user = await prisma.appUser.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });

    if (!user || !user.passwordHash || (user.status !== "active" && user.status !== "invited")) {
      await bcrypt.compare(password, TIMING_DECOY_HASH);
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_credentials", message: "Incorrect email or password" },
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      return reply.code(429).send({
        data: null,
        error: { code: "account_locked", message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.` },
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_LOGINS;
      await prisma.appUser.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
          : { failedLoginAttempts: attempts },
      });
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_credentials", message: "Incorrect email or password" },
      });
    }

    if (user.status === "invited" || user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.appUser.update({
        where: { id: user.id },
        data: { status: "active", failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const claims = {
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      trustId: user.trustId,
      tv: user.tokenVersion,
    };

    const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { data: { accessToken, refreshToken }, meta: {} };
    }
  );

  app.post("/auth/refresh", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const refreshToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!refreshToken) {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Missing refresh token" },
      });
    }

    try {
      const decoded = app.jwt.verify<AppJwtPayload>(refreshToken);
      if (decoded.type !== "refresh") {
        throw new Error("Not a refresh token");
      }

      if (decoded.role === "student") {
        const student = await prisma.studentStub.findUnique({ where: { id: decoded.sub } });
        // A removed student, or one whose sessions were revoked, can't renew.
        if (!student || student.status !== "active" || student.tokenVersion !== (decoded.tv ?? 0)) {
          throw new Error("Student no longer active");
        }
        const claims = { sub: student.id, role: "student", schoolId: student.schoolId, trustId: null, tv: student.tokenVersion };
        const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
        const newRefreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });
        return { data: { accessToken, refreshToken: newRefreshToken }, meta: {} };
      }

      const user = await prisma.appUser.findUnique({ where: { id: decoded.sub } });
      if (!user || user.status !== "active" || user.tokenVersion !== (decoded.tv ?? 0)) {
        throw new Error("User no longer active");
      }

      const claims = {
        sub: user.id,
        role: user.role,
        schoolId: user.schoolId,
        trustId: user.trustId,
        tv: user.tokenVersion,
      };

      const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
      const newRefreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

      return { data: { accessToken, refreshToken: newRefreshToken }, meta: {} };
    } catch {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Invalid or expired refresh token" },
      });
    }
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    if (request.user.role === "student") {
      return { data: await loadStudentMe(request.user.sub), meta: {} };
    }

    const user = await prisma.appUser.findUnique({
      where: { id: request.user.sub },
      select: {
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
        school: { select: { accountType: true, board: true } },
      },
    });

    if (!user) {
      return { data: null, meta: {} };
    }

    // accountType flattened onto the response - "individual" gates the
    // self-serve class/subject setup UI in the mobile app (see Docs/
    // superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
    // credits.md). null for staff with no school (e.g. platform_admin).
    const { school, ...rest } = user;
    return { data: { ...rest, accountType: school?.accountType ?? null, board: school?.board ?? null }, meta: {} };
  });

  app.post<{ Body: RequestPasswordResetBody }>(
    "/auth/request-password-reset",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    if (!email) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "email is required" },
      });
    }

    const user = await prisma.appUser.findUnique({ where: { email } });

    const recentRequests = user
      ? await prisma.passwordResetRequest.count({ where: { email, createdAt: { gt: new Date(Date.now() - OTP_REQUEST_WINDOW_MS) } } })
      : 0;

    let devCode: string | undefined;
    if (user && recentRequests < MAX_OTP_REQUESTS_PER_WINDOW) {
      const code = generateOtpCode();
      const otpCodeHash = await hashOtpCode(code);

      await prisma.passwordResetRequest.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await prisma.passwordResetRequest.create({
        data: { email, otpCodeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });
      const sent = await sendEmail(email, loginCodeEmail({ name: user.fullName, code, purpose: "password_reset" }));
      if (!sent.success) console.error(`[auth] password reset email to ${email} failed: ${sent.error}`);
      devCode = isDevOtpMode() ? code : undefined;
    }

    return { data: { message: "If that email exists, a reset code has been sent", devOtp: devCode }, meta: {} };
    }
  );

  app.post<{ Body: ResetPasswordBody }>(
    "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const code = request.body?.code?.trim();
    const newPassword = request.body?.newPassword;

    if (!email || !code || !newPassword || newPassword.length < 8) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "email, code, and a newPassword of at least 8 characters are required" },
      });
    }

    const resetRequest = await prisma.passwordResetRequest.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!resetRequest || resetRequest.attempts >= MAX_OTP_ATTEMPTS) {
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_or_expired_otp", message: "This code is invalid or has expired" },
      });
    }

    const matches = await compareOtpCode(code, resetRequest.otpCodeHash);
    if (!matches) {
      await prisma.passwordResetRequest.update({
        where: { id: resetRequest.id },
        data: { attempts: { increment: 1 } },
      });
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_otp", message: "Incorrect code" },
      });
    }

    const user = await prisma.appUser.findUnique({ where: { email } });
    if (!user) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Account not found" } });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.appUser.update({
        where: { id: user.id },
        data: { passwordHash, status: "active", tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null },
      }),
      prisma.passwordResetRequest.update({ where: { id: resetRequest.id }, data: { consumedAt: new Date() } }),
    ]);

    sendEmailInBackground(user.email, securityAlertEmail({ name: user.fullName, event: "password_reset_completed" }));

    return { data: { message: "Password updated" }, meta: {} };
    }
  );
}
