import { FastifyInstance } from "fastify";
import { sendEmailInBackground } from "../lib/email/sender";
import { joinRequestReceivedEmail, joinRequestDecidedEmail, classLabel } from "../lib/email/templates";
import { prisma } from "../lib/prisma";
import { markOnboardingTaskComplete } from "../lib/onboarding";

// Class join-link flow - a student/parent uses the public, unauthenticated
// link (ClassSection.joinCode) to submit a ClassJoinRequest. This NEVER
// grants direct class entry - the teacher must approve it before a real
// StudentStub is created. Available to both individual and institutional
// teachers (not just individual accounts - any teacher may want a faster
// way to add a student directly to their own roster). See Docs/superpowers/
// plans/2026-09-09-individual-teacher-onboarding-and-credits.md.

interface SubmitJoinRequestBody {
  studentName: string;
  dateOfBirth: string;
  guardianName: string;
  guardianContact: string;
  studentEmail?: string;
}

interface DecideJoinRequestBody {
  decision: "approved" | "rejected";
  note?: string;
}

async function requireOwnClassSection(classSectionId: string, caller: { role: string; sub: string; schoolId: string | null }) {
  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, academicYear: { schoolId: caller.schoolId ?? undefined } },
  });
  if (!classSection) return null;
  const assigned = await prisma.classSectionTeacher.findUnique({
    where: { classSectionId_teacherUserId: { classSectionId, teacherUserId: caller.sub } },
  });
  return assigned ? classSection : null;
}

export async function classJoinRoutes(app: FastifyInstance) {
  // --- Public, unauthenticated ---

  app.get<{ Params: { joinCode: string } }>("/public/class-sections/:joinCode", async (request, reply) => {
    const classSection = await prisma.classSection.findFirst({
      where: { joinCode: request.params.joinCode, isActive: true },
      include: {
        academicYear: { include: { school: { select: { name: true } } } },
        teacherAssignments: { include: { teacher: { select: { fullName: true } } } },
      },
    });
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "This class link is invalid or no longer active" } });
    }

    return {
      data: {
        className: classSection.className,
        sectionName: classSection.sectionName,
        schoolName: classSection.academicYear.school.name,
        teacherName: classSection.teacherAssignments[0]?.teacher.fullName ?? null,
      },
      meta: {},
    };
  });

  app.post<{ Params: { joinCode: string }; Body: SubmitJoinRequestBody }>(
    "/public/class-sections/:joinCode/join-requests",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const classSection = await prisma.classSection.findFirst({ where: { joinCode: request.params.joinCode, isActive: true } });
      if (!classSection) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "This class link is invalid or no longer active" } });
      }

      const body = request.body ?? ({} as SubmitJoinRequestBody);
      if (!body.studentName?.trim() || !body.dateOfBirth || !body.guardianName?.trim() || !body.guardianContact?.trim()) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "studentName, dateOfBirth, guardianName, and guardianContact are required" },
        });
      }
      const dob = new Date(body.dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Invalid dateOfBirth" } });
      }

      // Optional here so older join forms keep working, but without it the
      // student can't sign in until the teacher adds an email.
      const studentEmail = body.studentEmail?.trim().toLowerCase();
      if (studentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "studentEmail is not a valid email" } });
      }

      const created = await prisma.classJoinRequest.create({
        data: {
          classSectionId: classSection.id,
          studentName: body.studentName.trim(),
          dateOfBirth: dob,
          guardianName: body.guardianName.trim(),
          guardianContact: body.guardianContact.trim(),
          studentEmail: studentEmail || null,
        },
      });

      // Let the class's teacher(s) know a request is waiting.
      const teachers = await prisma.classSectionTeacher.findMany({
        where: { classSectionId: classSection.id, teacher: { status: "active" } },
        select: { teacher: { select: { fullName: true, email: true } } },
      });
      for (const { teacher } of teachers) {
        sendEmailInBackground(
          teacher.email,
          joinRequestReceivedEmail({
            teacherName: teacher.fullName,
            studentName: created.studentName,
            guardianName: created.guardianName,
            className: classLabel(classSection.className, classSection.sectionName),
          })
        );
      }

      return reply.code(201).send({ data: { id: created.id, status: created.status }, meta: {} });
    }
  );

  // --- Teacher-authenticated ---

  app.get<{ Params: { classSectionId: string } }>(
    "/class-sections/:classSectionId/join-requests",
    { onRequest: [app.authenticate, app.requireSchoolScope] },
    async (request, reply) => {
      const classSection = await requireOwnClassSection(request.params.classSectionId, request.user);
      if (!classSection) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class not found for this teacher" } });
      }

      const status = (request.query as { status?: string })?.status ?? "pending";
      const requests = await prisma.classJoinRequest.findMany({
        where: { classSectionId: classSection.id, ...(status ? { status } : {}) },
        orderBy: { submittedAt: "desc" },
      });
      return { data: requests, meta: {} };
    }
  );

  // All join requests across every class the teacher teaches, for the
  // universal "Invite students" screen - not scoped to one class the way
  // /class-sections/:id/join-requests above is.
  app.get(
    "/join-requests",
    { onRequest: [app.authenticate, app.requireSchoolScope] },
    async (request) => {
      const status = (request.query as { status?: string })?.status;
      const assignments = await prisma.classSectionTeacher.findMany({
        where: { teacherUserId: request.user.sub, classSection: { academicYear: { schoolId: request.schoolId } } },
        select: { classSectionId: true },
      });
      const requests = await prisma.classJoinRequest.findMany({
        where: {
          classSectionId: { in: assignments.map((a) => a.classSectionId) },
          ...(status ? { status } : {}),
        },
        include: { classSection: { select: { className: true, sectionName: true } } },
        orderBy: { submittedAt: "desc" },
      });
      return { data: requests, meta: {} };
    }
  );

  app.patch<{ Params: { id: string }; Body: DecideJoinRequestBody }>(
    "/join-requests/:id",
    { onRequest: [app.authenticate, app.requireSchoolScope] },
    async (request, reply) => {
      const body = request.body ?? ({} as DecideJoinRequestBody);
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "decision must be approved or rejected" } });
      }

      const existing = await prisma.classJoinRequest.findUnique({ where: { id: request.params.id } });
      if (!existing) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Join request not found" } });
      }
      if (existing.status !== "pending") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This request has already been decided" } });
      }

      const classSection = await requireOwnClassSection(existing.classSectionId, request.user);
      if (!classSection) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this class" } });
      }

      const decided = await prisma.$transaction(async (tx) => {
        let createdStudentStubId: string | undefined;
        if (body.decision === "approved") {
          const student = await tx.studentStub.create({
            data: {
              schoolId: request.schoolId!,
              sourceEnquiryId: null,
              fullName: existing.studentName,
              dateOfBirth: existing.dateOfBirth,
              classSectionId: existing.classSectionId,
              guardianName: existing.guardianName,
              guardianContact: existing.guardianContact,
              email: existing.studentEmail,
              admissionDate: new Date(),
              createdBy: request.user.sub,
            },
          });
          createdStudentStubId = student.id;
        }

        return tx.classJoinRequest.update({
          where: { id: existing.id },
          data: {
            status: body.decision,
            decidedAt: new Date(),
            decidedByUserId: request.user.sub,
            createdStudentStubId,
            note: body.note?.trim() || existing.note,
          },
        });
      });

      if (body.decision === "approved" && request.user.role === "teacher") {
        await markOnboardingTaskComplete(request.user.sub, "first_student");
      }

      // Tell the student/guardian who used the link how it turned out.
      if (existing.studentEmail) {
        const [teacher, school] = await Promise.all([
          prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { fullName: true } }),
          prisma.school.findUnique({ where: { id: request.schoolId! }, select: { name: true } }),
        ]);
        sendEmailInBackground(
          existing.studentEmail,
          joinRequestDecidedEmail({
            studentName: existing.studentName,
            className: classLabel(classSection.className, classSection.sectionName),
            approved: body.decision === "approved",
            teacherName: teacher?.fullName,
            schoolName: school?.name,
            note: body.note,
            canSignIn: true,
          })
        );
      }

      return { data: decided, meta: {} };
    }
  );
}
