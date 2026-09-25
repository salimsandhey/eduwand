import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { sendEmail } from "../lib/email/sender";
import { loginCodeEmail } from "../lib/email/templates";
import { storage } from "../lib/storage";
import { generateLoginOtp, isDevOtpMode, hashOtpCode, compareOtpCode, OTP_TTL_MS, MAX_OTP_ATTEMPTS, OTP_REQUEST_WINDOW_MS, MAX_OTP_REQUESTS_PER_WINDOW } from "../lib/otp";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";
const SELECTION_TOKEN_EXPIRY = "10m";

interface RequestOtpBody {
  email: string;
}

interface VerifyOtpBody {
  email: string;
  code: string;
}

interface SelectBody {
  selectionToken: string;
  studentStubId: string;
}

function normalizeEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function studentAuthRoutes(app: FastifyInstance) {
  // Students sign in with their own email + a one-time code. The response is
  // the same whether or not the email belongs to a student, so this can't be
  // used to discover who is enrolled - and a code is only ever emailed to an
  // address that actually is on a student record.
  app.post<{ Body: RequestOtpBody }>(
    "/auth/student/request-otp",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    if (!email) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "A valid email is required" },
      });
    }

    const matches = await prisma.studentStub.findMany({
      where: { email, status: "active" },
      select: { fullName: true, school: { select: { name: true } } },
      orderBy: { fullName: "asc" },
    });
    const known = matches.length;

    const recentRequests = await prisma.studentOtpRequest.count({
      where: { email, createdAt: { gt: new Date(Date.now() - OTP_REQUEST_WINDOW_MS) } },
    });

    let devCode: string | undefined;
    // Over the limit: answer exactly as usual but send nothing.
    if (known > 0 && recentRequests < MAX_OTP_REQUESTS_PER_WINDOW) {
      const code = generateLoginOtp();
      const otpCodeHash = await hashOtpCode(code);

      await prisma.studentOtpRequest.updateMany({
        where: { email, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await prisma.studentOtpRequest.create({
        data: { email, otpCodeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });

      // One email can cover several students; greet by name only when it's unambiguous.
      const sent = await sendEmail(
        email,
        loginCodeEmail({
          name: matches.length === 1 ? matches[0].fullName : undefined,
          code,
          purpose: "student_login",
          schoolName: matches[0].school.name,
        })
      );
      if (!sent.success) console.error(`[student-auth] OTP email to ${email} failed: ${sent.error}`);
      devCode = isDevOtpMode() ? code : undefined;
    }

    return { data: { message: "If that email is registered, a login code has been sent", devOtp: devCode }, meta: {} };
    }
  );

  app.post<{ Body: VerifyOtpBody }>(
    "/auth/student/verify-otp",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const code = request.body?.code?.trim();
    if (!email || !code) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "email and code are required" },
      });
    }

    const otpRequest = await prisma.studentOtpRequest.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRequest || otpRequest.attempts >= MAX_OTP_ATTEMPTS) {
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_or_expired_otp", message: "This code is invalid or has expired" },
      });
    }

    const matches = await compareOtpCode(code, otpRequest.otpCodeHash);
    if (!matches) {
      await prisma.studentOtpRequest.update({
        where: { id: otpRequest.id },
        data: { attempts: { increment: 1 } },
      });
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_otp", message: "Incorrect code" },
      });
    }

    await prisma.studentOtpRequest.update({ where: { id: otpRequest.id }, data: { consumedAt: new Date() } });

    const students = await prisma.studentStub.findMany({
      where: { email, status: "active" },
      select: { id: true, fullName: true, schoolId: true, classSectionId: true, avatarKey: true, photoMimeType: true },
      orderBy: { fullName: "asc" },
    });

    if (students.length === 0) {
      return reply.code(404).send({
        data: null,
        error: { code: "no_student_found", message: "No student is linked to this email" },
      });
    }

    const selectionToken = app.jwt.sign(
      { sub: "", role: "student_pending", schoolId: null, trustId: null, type: "student_select", email },
      { expiresIn: SELECTION_TOKEN_EXPIRY }
    );

    return { data: { selectionToken, students }, meta: {} };
    }
  );

  // Profile photo for the "which child?" picker shown between verify-otp and
  // select - nobody is signed in yet, so it takes the selection token (as
  // ?token=, since <Image> can't send headers) and only serves students
  // linked to the email that token was issued for.
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>("/auth/student/photo/:id", async (request, reply) => {
    let email: string | undefined;
    try {
      const decoded = app.jwt.verify<{ type: string; email?: string }>(request.query.token ?? "");
      if (decoded.type === "student_select") email = decoded.email;
    } catch {
      email = undefined;
    }
    if (!email) {
      return reply.code(401).send({ data: null, error: { code: "unauthorized", message: "Invalid or expired selection token" } });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: request.params.id, email, status: "active" },
      select: { photoLocation: true, photoMimeType: true },
    });
    if (!student?.photoLocation || !student.photoMimeType) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "No photo uploaded" } });
    }

    const buffer = await storage.readBuffer(student.photoLocation);
    reply.type(student.photoMimeType);
    return reply.send(buffer);
  });

  app.post<{ Body: SelectBody }>("/auth/student/select", async (request, reply) => {
    const { selectionToken, studentStubId } = request.body ?? ({} as SelectBody);
    if (!selectionToken || !studentStubId) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "selectionToken and studentStubId are required" },
      });
    }

    let email: string;
    try {
      const decoded = app.jwt.verify<{ type: string; email?: string }>(selectionToken);
      if (decoded.type !== "student_select" || !decoded.email) {
        throw new Error("Not a student selection token");
      }
      email = decoded.email;
    } catch {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Invalid or expired selection token" },
      });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: studentStubId, email, status: "active" },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found for this email" } });
    }

    const claims = { sub: student.id, role: "student", schoolId: student.schoolId, trustId: null, tv: student.tokenVersion };
    const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { data: { accessToken, refreshToken }, meta: {} };
  });
}
