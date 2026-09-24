import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { messageProvider } from "../lib/messaging";
import { storage } from "../lib/storage";
import { hashOtpCode, compareOtpCode, OTP_TTL_MS, MAX_OTP_ATTEMPTS } from "../lib/otp";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";
const SELECTION_TOKEN_EXPIRY = "10m";

// Fixed instead of randomly generated for now - App Review can't reliably
// receive real SMS on a reviewer device, so every student login uses this
// code until proper delivery is verified. Matches AuthScreen's 6-digit
// CODE_LENGTH. Revert to generateOtpCode() from lib/otp.ts once SMS
// delivery to reviewers is no longer a concern.
const FIXED_STUDENT_OTP = "123456";

interface RequestOtpBody {
  phone: string;
}

interface VerifyOtpBody {
  phone: string;
  code: string;
}

interface SelectBody {
  selectionToken: string;
  studentStubId: string;
}

export async function studentAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: RequestOtpBody }>(
    "/auth/student/request-otp",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const phone = request.body?.phone?.trim();
    if (!phone) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "phone is required" },
      });
    }

    const code = FIXED_STUDENT_OTP;
    const otpCodeHash = await hashOtpCode(code);

    await prisma.studentOtpRequest.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await prisma.studentOtpRequest.create({
      data: { phone, otpCodeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });

    await messageProvider.send("sms", phone, `Your EduWand login code is ${code}. It expires in 5 minutes.`);

    return {
      data: {
        message: "OTP sent",
        devOtp: process.env.NODE_ENV !== "production" ? code : undefined,
      },
      meta: {},
    };
    }
  );

  app.post<{ Body: VerifyOtpBody }>("/auth/student/verify-otp", async (request, reply) => {
    const phone = request.body?.phone?.trim();
    const code = request.body?.code?.trim();
    if (!phone || !code) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "phone and code are required" },
      });
    }

    const otpRequest = await prisma.studentOtpRequest.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
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
      where: { guardianContact: phone },
      select: { id: true, fullName: true, schoolId: true, classSectionId: true, avatarKey: true, photoMimeType: true },
      orderBy: { fullName: "asc" },
    });

    if (students.length === 0) {
      return reply.code(404).send({
        data: null,
        error: { code: "no_student_found", message: "No student is linked to this phone number" },
      });
    }

    const selectionToken = app.jwt.sign(
      { sub: "", role: "student_pending", schoolId: null, trustId: null, type: "student_select", phone },
      { expiresIn: SELECTION_TOKEN_EXPIRY }
    );

    return { data: { selectionToken, students }, meta: {} };
  });

  // Profile photo for the "which child?" picker shown between verify-otp and
  // select - nobody is signed in yet, so it takes the selection token (as
  // ?token=, since <Image> can't send headers) and only serves students
  // linked to the phone number that token was issued for.
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>("/auth/student/photo/:id", async (request, reply) => {
    let phone: string | undefined;
    try {
      const decoded = app.jwt.verify<{ type: string; phone?: string }>(request.query.token ?? "");
      if (decoded.type === "student_select") phone = decoded.phone;
    } catch {
      phone = undefined;
    }
    if (!phone) {
      return reply.code(401).send({ data: null, error: { code: "unauthorized", message: "Invalid or expired selection token" } });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: request.params.id, guardianContact: phone },
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

    let phone: string;
    try {
      const decoded = app.jwt.verify<{ type: string; phone?: string }>(selectionToken);
      if (decoded.type !== "student_select" || !decoded.phone) {
        throw new Error("Not a student selection token");
      }
      phone = decoded.phone;
    } catch {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Invalid or expired selection token" },
      });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: studentStubId, guardianContact: phone },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found for this phone" } });
    }

    const claims = { sub: student.id, role: "student", schoolId: student.schoolId, trustId: null };
    const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { data: { accessToken, refreshToken }, meta: {} };
  });
}
