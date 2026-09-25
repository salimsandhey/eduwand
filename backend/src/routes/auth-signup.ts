import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { grantInitialCredits } from "../lib/credits";
import { BOARDS, isValidBoard } from "../lib/boards";
import { sendEmail, sendEmailInBackground } from "../lib/email/sender";
import { loginCodeEmail, teacherWelcomeEmail, accountExistsEmail } from "../lib/email/templates";
import { generateLoginOtp, isDevOtpMode, hashOtpCode, compareOtpCode, OTP_TTL_MS, MAX_OTP_ATTEMPTS, OTP_REQUEST_WINDOW_MS, MAX_OTP_REQUESTS_PER_WINDOW } from "../lib/otp";

// Public self-signup for individual teachers - the only account-creation
// path in this codebase that doesn't require an existing admin/leadership
// user to invite the new account. Two steps: request-otp validates the form
// and emails a code (nothing is created yet), verify-otp confirms the code
// and only then creates the account - so every individual teacher's email is
// proven to be theirs. See Docs/superpowers/plans/2026-09-09-
// individual-teacher-onboarding-and-credits.md for the full design.

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";
const MIN_PASSWORD_LENGTH = 8;

interface PendingTeacherSignup {
  fullName: string;
  email: string;
  passwordHash: string;
  board: string;
  phone?: string;
  workspaceName?: string;
}

interface VerifySignupBody {
  email: string;
  code: string;
}

interface SignupTeacherBody {
  fullName: string;
  email: string;
  password: string;
  board: string;
  phone?: string;
  workspaceName?: string;
}

// Indian academic-year convention already used by prisma/seed.ts: June 1 -
// April 30. Computed relative to "now" so every new individual school opens
// on whichever academic year is currently in progress.
function currentAcademicYearWindow(): { label: string; startDate: Date; endDate: Date } {
  const now = new Date();
  const startYear = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const endYear = startYear + 1;
  return {
    label: `${startYear}-${endYear}`,
    startDate: new Date(Date.UTC(startYear, 5, 1)),
    endDate: new Date(Date.UTC(endYear, 3, 30)),
  };
}

export async function authSignupRoutes(app: FastifyInstance) {
  app.post<{ Body: SignupTeacherBody }>(
    "/auth/signup/teacher/request-otp",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body ?? ({} as SignupTeacherBody);
      const fullName = body.fullName?.trim();
      const email = body.email?.trim().toLowerCase();
      const password = body.password;
      const board = body.board?.trim();
      const phone = body.phone?.trim() || undefined;
      const workspaceName = body.workspaceName?.trim() || undefined;

      if (!fullName || fullName.length < 2) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "fullName must be at least 2 characters" },
        });
      }
      if (!email || !email.includes("@")) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "A valid email is required" },
        });
      }
      if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        });
      }
      if (!isValidBoard(board)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `board must be one of ${BOARDS.join(", ")}` },
        });
      }

      // Answer identically whether or not the email already has an account, so this
      // form can't be used to find out who is registered. An existing account gets
      // an email saying so (with a way in) instead of a code.
      const existing = await prisma.appUser.findUnique({ where: { email } });
      if (existing) {
        sendEmailInBackground(email, accountExistsEmail({ name: existing.fullName }));
        return reply.send({ data: { message: "Verification code sent" }, meta: {} });
      }

      const recentRequests = await prisma.signupOtpRequest.count({
        where: { email, createdAt: { gt: new Date(Date.now() - OTP_REQUEST_WINDOW_MS) } },
      });
      if (recentRequests >= MAX_OTP_REQUESTS_PER_WINDOW) {
        return reply.code(429).send({
          data: null,
          error: { code: "too_many_requests", message: "Too many codes requested for this email. Please wait a few minutes and try again." },
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const code = generateLoginOtp();
      const pending: PendingTeacherSignup = { fullName, email, passwordHash, board, phone, workspaceName };

      await prisma.signupOtpRequest.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: new Date() } });
      await prisma.signupOtpRequest.create({
        data: {
          email,
          otpCodeHash: await hashOtpCode(code),
          pendingData: pending as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });

      const sent = await sendEmail(email, loginCodeEmail({ name: fullName, code, purpose: "teacher_signup" }));
      if (!sent.success) {
        request.log.error({ err: sent.error }, "signup OTP email failed");
        return reply.code(502).send({
          data: null,
          error: { code: "email_send_failed", message: "We couldn't send the verification email. Please check the address and try again." },
        });
      }

      return reply.send({
        data: { message: "Verification code sent", devOtp: isDevOtpMode() ? code : undefined },
        meta: {},
      });
    }
  );

  app.post<{ Body: VerifySignupBody }>(
    "/auth/signup/teacher/verify-otp",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const email = request.body?.email?.trim().toLowerCase();
      const code = request.body?.code?.trim();
      if (!email || !code) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "email and code are required" },
        });
      }

      const otpRequest = await prisma.signupOtpRequest.findFirst({
        where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!otpRequest || otpRequest.attempts >= MAX_OTP_ATTEMPTS) {
        return reply.code(401).send({
          data: null,
          error: { code: "invalid_or_expired_otp", message: "This code is invalid or has expired" },
        });
      }
      if (!(await compareOtpCode(code, otpRequest.otpCodeHash))) {
        await prisma.signupOtpRequest.update({ where: { id: otpRequest.id }, data: { attempts: { increment: 1 } } });
        return reply.code(401).send({ data: null, error: { code: "invalid_otp", message: "Incorrect code" } });
      }

      const { fullName, passwordHash, board, phone, workspaceName } = otpRequest.pendingData as unknown as PendingTeacherSignup;

      // Someone may have registered this email while the code was in flight.
      if (await prisma.appUser.findUnique({ where: { email } })) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "A user with this email already exists" },
        });
      }

      const { label, startDate, endDate } = currentAcademicYearWindow();

      const user = await prisma.$transaction(async (tx) => {
        await tx.signupOtpRequest.update({ where: { id: otpRequest.id }, data: { consumedAt: new Date() } });

        const trust = await tx.trust.create({
          data: {
            name: `${fullName} (Individual)`,
            trustType: "individual",
            status: "active",
          },
        });

        const school = await tx.school.create({
          data: {
            trustId: trust.id,
            name: workspaceName || `${fullName}'s Classroom`,
            board,
            accountType: "individual",
            status: "active",
          },
        });

        await tx.academicYear.create({
          data: {
            schoolId: school.id,
            label,
            startDate,
            endDate,
            isCurrent: true,
          },
        });

        const createdUser = await tx.appUser.create({
          data: {
            trustId: trust.id,
            schoolId: school.id,
            fullName,
            email,
            phone,
            role: "teacher",
            status: "active",
            passwordHash,
          },
        });

        await grantInitialCredits(tx, createdUser.id, trust.id);

        return createdUser;
      });

      const credits = await prisma.teacherCreditAccount.findUnique({ where: { teacherUserId: user.id }, select: { balance: true } });
      sendEmailInBackground(
        user.email,
        teacherWelcomeEmail({ name: user.fullName, workspaceName: workspaceName || `${fullName}'s Classroom`, credits: credits?.balance })
      );

      const claims = {
        sub: user.id,
        role: user.role,
        schoolId: user.schoolId,
        trustId: user.trustId,
        tv: user.tokenVersion,
      };

      const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
      const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

      return reply.code(201).send({ data: { accessToken, refreshToken }, meta: {} });
    }
  );
}
