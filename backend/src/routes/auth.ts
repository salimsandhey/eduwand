import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppJwtPayload } from "../types/fastify-jwt";
import { messageProvider } from "../lib/messaging";
import { generateOtpCode, hashOtpCode, compareOtpCode, OTP_TTL_MS, MAX_OTP_ATTEMPTS } from "../lib/otp";

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

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "email and password are required" },
      });
    }

    const user = await prisma.appUser.findUnique({ where: { email } });

    if (!user || !user.passwordHash || (user.status !== "active" && user.status !== "invited")) {
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_credentials", message: "Incorrect email or password" },
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_credentials", message: "Incorrect email or password" },
      });
    }

    // No separate account-activation flow exists yet - a successful first login with
    // the invite's temp password IS the activation step.
    if (user.status === "invited") {
      await prisma.appUser.update({ where: { id: user.id }, data: { status: "active" } });
    }

    const claims = {
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      trustId: user.trustId,
    };

    const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { data: { accessToken, refreshToken }, meta: {} };
  });

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
        if (!student) {
          throw new Error("Student not found");
        }
        const claims = { sub: student.id, role: "student", schoolId: student.schoolId, trustId: null };
        const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
        return { data: { accessToken }, meta: {} };
      }

      const user = await prisma.appUser.findUnique({ where: { id: decoded.sub } });
      if (!user || user.status !== "active") {
        throw new Error("User no longer active");
      }

      const claims = {
        sub: user.id,
        role: user.role,
        schoolId: user.schoolId,
        trustId: user.trustId,
      };

      const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });

      return { data: { accessToken }, meta: {} };
    } catch {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Invalid or expired refresh token" },
      });
    }
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    if (request.user.role === "student") {
      const student = await prisma.studentStub.findUnique({
        where: { id: request.user.sub },
        select: { id: true, fullName: true, schoolId: true, classSectionId: true },
      });
      if (!student) {
        return { data: null, meta: {} };
      }
      return {
        data: {
          id: student.id,
          fullName: student.fullName,
          email: "",
          role: "student",
          schoolId: student.schoolId,
          trustId: null,
          status: "active",
          classSectionId: student.classSectionId,
        },
        meta: {},
      };
    }

    const user = await prisma.appUser.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        schoolId: true,
        trustId: true,
        status: true,
      },
    });

    return { data: user, meta: {} };
  });

  // Same OTP-over-email pattern as student login (see student-auth.ts) - a
  // 6-digit code is emailed, verifying it directly authorizes setting a new
  // password rather than issuing a session, since this endpoint runs while
  // logged out.
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

    // Always respond the same way whether or not the email exists, so this
    // endpoint can't be used to enumerate accounts.
    let devCode: string | undefined;
    if (user) {
      const code = generateOtpCode();
      const otpCodeHash = await hashOtpCode(code);

      await prisma.passwordResetRequest.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await prisma.passwordResetRequest.create({
        data: { email, otpCodeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });
      await messageProvider.send("email", email, `Your EduWand password reset code is ${code}. It expires in 5 minutes.`);
      devCode = process.env.NODE_ENV !== "production" ? code : undefined;
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
      prisma.appUser.update({ where: { id: user.id }, data: { passwordHash, status: "active" } }),
      prisma.passwordResetRequest.update({ where: { id: resetRequest.id }, data: { consumedAt: new Date() } }),
    ]);

    return { data: { message: "Password updated" }, meta: {} };
    }
  );
}
