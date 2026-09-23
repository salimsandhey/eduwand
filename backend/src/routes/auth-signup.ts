import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { grantInitialCredits } from "../lib/credits";
import { BOARDS, isValidBoard } from "../lib/boards";

// Public self-signup for individual teachers - the only account-creation
// path in this codebase that doesn't require an existing admin/leadership
// user to invite the new account. See Docs/superpowers/plans/2026-09-09-
// individual-teacher-onboarding-and-credits.md for the full design.

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";
const MIN_PASSWORD_LENGTH = 8;

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
    "/auth/signup/teacher",
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

      const existing = await prisma.appUser.findUnique({ where: { email } });
      if (existing) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "A user with this email already exists" },
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const { label, startDate, endDate } = currentAcademicYearWindow();

      const user = await prisma.$transaction(async (tx) => {
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

      const claims = {
        sub: user.id,
        role: user.role,
        schoolId: user.schoolId,
        trustId: user.trustId,
      };

      const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
      const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

      return reply.code(201).send({ data: { accessToken, refreshToken }, meta: {} });
    }
  );
}
