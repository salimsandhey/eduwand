import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendEmailInBackground } from "../lib/email/sender";
import { studentEmailChangedEmail } from "../lib/email/templates";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { markOnboardingTaskComplete } from "../lib/onboarding";
import { Validator } from "../lib/validation";

const MAX_SEAT_NUMBER = 40; // matches the reference clicker firmware/demo's cap

interface ListQuery {
  classSectionId?: string;
  page?: string;
  pageSize?: string;
}

interface CreateStudentBody {
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  email: string;
  admissionDate?: string;
  feeStatus?: string;
}

interface BulkStudentRow {
  fullName: string;
  dateOfBirth: string;
  guardianName: string;
  guardianContact: string;
  email: string;
}

interface BulkCreateStudentsBody {
  classSectionId: string;
  students: BulkStudentRow[];
}

interface UpdateStudentBody {
  fullName?: string;
  dateOfBirth?: string;
  classSectionId?: string;
  guardianName?: string;
  guardianContact?: string;
  email?: string | null;
  feeStatus?: string;
  // The physical clicker's DEVICE_ID this student is assigned to, within
  // their class - null clears the assignment. See clicker.ino / present.ts.
  seatNumber?: number | null;
}

interface BulkReassignBody {
  classSectionId: string;
  studentIds: string[];
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];
// The student's email is their login credential (email + OTP), so
// creating/editing a student record is restricted to staff who manage
// enrolment, not every role that can merely view the roster. "teacher" is
// included so a teacher can add students directly to a class they teach
// (bulk upload / join-link approval) - teacherOwnsClassSection below is the
// per-class ownership check that keeps this scoped to their own classes.
const manageScoped = (app: FastifyInstance) => [
  app.authenticate,
  app.requireSchoolScope,
  requireRoles("front_desk", "admin", "principal", "leadership", "teacher", PLATFORM_ADMIN_ROLE),
];

function authenticateFromHeaderOrQuery(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) {
      const token = (request.query as { token?: string } | undefined)?.token;
      if (token) request.headers.authorization = `Bearer ${token}`;
    }
    await app.authenticate(request, reply);
  };
}

async function resolveClassSectionForCaller(
  schoolId: string,
  classSectionId: string,
  caller: { role: string; sub: string }
) {
  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, academicYear: { schoolId } },
  });
  if (!classSection) return null;

  if (caller.role === "teacher") {
    const assigned = await prisma.classSectionTeacher.findUnique({
      where: { classSectionId_teacherUserId: { classSectionId, teacherUserId: caller.sub } },
    });
    if (!assigned) return null;
  }

  return classSection;
}

export async function studentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/students",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { classSectionId } = request.query;
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));

      // A teacher only ever sees students in classes they actually teach -
      // previously unscoped, meaning any teacher could list every student in
      // the whole school. Fine for a 1-teacher individual account, but a
      // real gap once this feature is shared with institutional teachers.
      // See Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-
      // and-credits.md.
      let classSectionFilter: { in: string[] } | string | undefined = classSectionId;
      if (request.user.role === "teacher") {
        if (classSectionId) {
          const owned = await resolveClassSectionForCaller(request.schoolId!, classSectionId, request.user);
          if (!owned) {
            return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
          }
        } else {
          const assignments = await prisma.classSectionTeacher.findMany({
            where: { teacherUserId: request.user.sub, classSection: { academicYear: { schoolId: request.schoolId } } },
            select: { classSectionId: true },
          });
          classSectionFilter = { in: assignments.map((a) => a.classSectionId) };
        }
      }

      const where = {
        schoolId: request.schoolId,
        status: "active",
        ...(classSectionFilter ? { classSectionId: classSectionFilter } : {}),
      };

      const [items, totalCount] = await Promise.all([
        prisma.studentStub.findMany({
          where,
          include: { classSection: true },
          orderBy: { admissionDate: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.studentStub.count({ where }),
      ]);

      return { data: items, meta: { page, pageSize, totalCount } };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/students/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const student = await prisma.studentStub.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: { classSection: true },
      });

      if (!student) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }
      if (request.user.role === "teacher" && !(await resolveClassSectionForCaller(request.schoolId!, student.classSectionId, request.user))) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }

      return { data: student, meta: {} };
    }
  );

  // The student's own uploaded profile photo (they set it on their Profile tab
  // - see auth-me.ts), for staff screens that list students. <Image> can't
  // send an Authorization header, so ?token= is accepted too. A teacher only
  // sees photos of students in classes they teach, same as GET /students/:id.
  app.get<{ Params: { id: string } }>(
    "/students/:id/photo",
    { onRequest: [authenticateFromHeaderOrQuery(app), app.requireSchoolScope] },
    async (request, reply) => {
      const student = await prisma.studentStub.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        select: { classSectionId: true, photoLocation: true, photoMimeType: true },
      });
      // A student may only read their own photo; a teacher only their classes'.
      const allowed =
        !!student &&
        (request.user.role === "student"
          ? request.user.sub === request.params.id
          : request.user.role !== "teacher" || !!(await resolveClassSectionForCaller(request.schoolId!, student.classSectionId, request.user)));
      if (!student || !allowed || !student.photoLocation || !student.photoMimeType) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "No photo uploaded for this student" } });
      }

      const buffer = await storage.readBuffer(student.photoLocation);
      reply.type(student.photoMimeType);
      return reply.send(buffer);
    }
  );

  // Direct add - for a student who never went through the Enquiry pipeline
  // (e.g. a school onboarding its existing roster). sourceEnquiryId is left
  // null; nothing else about the record differs from an admissions-created one.
  app.post<{ Body: CreateStudentBody }>("/students", { onRequest: manageScoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as CreateStudentBody);
    const v = new Validator();
    const fullName = v.personName("fullName", body.fullName, "Student name");
    const dateOfBirth = v.dateOfBirth("dateOfBirth", body.dateOfBirth);
    const guardianName = v.personName("guardianName", body.guardianName, "Guardian name");
    const guardianContact = v.phone("guardianContact", body.guardianContact, true, "Guardian phone number");
    // The email is what the student signs in with, so it must be a real address.
    const email = v.email("email", body.email, true, "Student email");
    const admissionDate = v.date("admissionDate", body.admissionDate, "Admission date", false);
    v.dateNotBefore("admissionDate", admissionDate, dateOfBirth, "Admission date", "the date of birth");
    if (!body.classSectionId) v.fail("classSectionId", "Choose a class");
    if (v.hasErrors || !fullName || !dateOfBirth || !guardianName || !guardianContact || !email) return v.reject(reply);

    const classSection = await resolveClassSectionForCaller(request.schoolId!, body.classSectionId, request.user);
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    const student = await prisma.studentStub.create({
      data: {
        schoolId: request.schoolId,
        sourceEnquiryId: null,
        fullName,
        dateOfBirth,
        classSectionId: classSection.id,
        guardianName,
        guardianContact,
        email,
        admissionDate: admissionDate ?? new Date(),
        feeStatus: body.feeStatus ?? "pending",
        createdBy: request.user.sub,
      },
    });

    if (request.user.role === "teacher") {
      await markOnboardingTaskComplete(request.user.sub, "first_student");
    }

    return reply.code(201).send({ data: student, meta: {} });
  });

  // Bulk add via CSV upload - the mobile client parses the file client-side
  // (same pattern as the enrolment Bulk Upload screen) and posts rows here.
  // Rows that fail validation are skipped and reported back, not fatal to
  // the whole batch. See Docs/superpowers/plans/2026-09-09-individual-
  // teacher-onboarding-and-credits.md.
  app.post<{ Body: BulkCreateStudentsBody }>("/students/bulk", { onRequest: manageScoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as BulkCreateStudentsBody);
    if (!body.classSectionId || !Array.isArray(body.students) || body.students.length === 0) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "classSectionId and a non-empty students array are required" },
      });
    }
    if (body.students.length > 200) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Maximum 200 students per upload" } });
    }

    const classSection = await resolveClassSectionForCaller(request.schoolId!, body.classSectionId, request.user);
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    const created: unknown[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < body.students.length; i++) {
      const row = body.students[i] ?? ({} as BulkStudentRow);
      const rv = new Validator();
      const rowName = rv.personName("fullName", row.fullName, "Student name");
      const dob = rv.dateOfBirth("dateOfBirth", row.dateOfBirth);
      const rowGuardian = rv.personName("guardianName", row.guardianName, "Guardian name");
      const rowContact = rv.phone("guardianContact", row.guardianContact, true, "Guardian phone number");
      const rowEmail = rv.email("email", row.email, true, "Student email");
      if (rv.hasErrors || !rowName || !dob || !rowGuardian || !rowContact || !rowEmail) {
        skipped.push({ row: i + 1, reason: Object.values(rv.errors).join("; ") });
        continue;
      }

      const student = await prisma.studentStub.create({
        data: {
          schoolId: request.schoolId,
          sourceEnquiryId: null,
          fullName: rowName,
          dateOfBirth: dob,
          classSectionId: classSection.id,
          guardianName: rowGuardian,
          guardianContact: rowContact,
          email: rowEmail,
          admissionDate: new Date(),
          createdBy: request.user.sub,
        },
      });
      created.push(student);
    }

    if (created.length > 0 && request.user.role === "teacher") {
      await markOnboardingTaskComplete(request.user.sub, "first_student");
    }

    return reply.code(201).send({ data: { created: created.length, skipped }, meta: {} });
  });

  // Fixes the gap that previously had no edit path at all - most importantly
  // the student's email, since a wrong/outdated address locks them out of
  // OTP login with no way to self-recover.
  app.patch<{ Params: { id: string }; Body: UpdateStudentBody }>(
    "/students/:id",
    { onRequest: manageScoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdateStudentBody);
      const student = await prisma.studentStub.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!student) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
      }
      if (request.user.role === "teacher" && !(await resolveClassSectionForCaller(request.schoolId!, student.classSectionId, request.user))) {
        return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this student's class" } });
      }

      if (body.classSectionId) {
        const classSection = await resolveClassSectionForCaller(request.schoolId!, body.classSectionId, request.user);
        if (!classSection) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
        }
      }
      const v = new Validator();
      const patchName = body.fullName !== undefined ? v.personName("fullName", body.fullName, "Student name") : undefined;
      const patchDob = body.dateOfBirth !== undefined ? v.dateOfBirth("dateOfBirth", body.dateOfBirth) : undefined;
      const patchGuardian = body.guardianName !== undefined ? v.personName("guardianName", body.guardianName, "Guardian name") : undefined;
      const patchContact = body.guardianContact !== undefined ? v.phone("guardianContact", body.guardianContact, true, "Guardian phone number") : undefined;
      const patchEmail = body.email !== undefined ? v.email("email", body.email, true, "Student email") : undefined;
      if (body.seatNumber !== undefined && body.seatNumber !== null) {
        v.number("seatNumber", body.seatNumber, "Clicker number", { integer: true, min: 1, max: MAX_SEAT_NUMBER });
      }
      if (v.hasErrors) return v.reject(reply);

      try {
        const updated = await prisma.studentStub.update({
          where: { id: student.id },
          data: {
            ...(patchName !== undefined ? { fullName: patchName } : {}),
            ...(patchDob !== undefined ? { dateOfBirth: patchDob } : {}),
            ...(body.classSectionId !== undefined ? { classSectionId: body.classSectionId } : {}),
            ...(patchGuardian !== undefined ? { guardianName: patchGuardian } : {}),
            ...(patchContact !== undefined ? { guardianContact: patchContact } : {}),
            ...(patchEmail !== undefined ? { email: patchEmail } : {}),
            ...(patchEmail !== undefined && patchEmail !== student.email ? { tokenVersion: { increment: 1 } } : {}),
            ...(body.feeStatus !== undefined ? { feeStatus: body.feeStatus } : {}),
            ...(body.seatNumber !== undefined ? { seatNumber: body.seatNumber } : {}),
            updatedBy: request.user.sub,
          },
        });

        if (patchEmail !== undefined && patchEmail !== student.email) {
          const school = await prisma.school.findUnique({ where: { id: student.schoolId }, select: { name: true } });
          if (student.email) {
            sendEmailInBackground(
              student.email,
              studentEmailChangedEmail({ studentName: student.fullName, oldEmail: student.email, newEmail: patchEmail, audience: "old", schoolName: school?.name })
            );
          }
          sendEmailInBackground(
            patchEmail,
            studentEmailChangedEmail({ studentName: student.fullName, oldEmail: student.email, newEmail: patchEmail, audience: "new", schoolName: school?.name })
          );
        }

        return { data: updated, meta: {} };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(400).send({
            data: null,
            error: { code: "seat_number_taken", message: "That clicker number is already assigned to another student in this class" },
          });
        }
        throw err;
      }
    }
  );

  // Bulk-assign several existing students to one class in a single action -
  // both the target class AND each student's current class must be one the
  // caller (if a teacher) actually owns. Mirrors the {created,skipped}
  // reporting shape /students/bulk already uses.
  app.post<{ Body: BulkReassignBody }>("/students/bulk-reassign", { onRequest: manageScoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as BulkReassignBody);
    if (!body.classSectionId || !Array.isArray(body.studentIds) || body.studentIds.length === 0) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "classSectionId and a non-empty studentIds array are required" },
      });
    }

    const targetClass = await resolveClassSectionForCaller(request.schoolId!, body.classSectionId, request.user);
    if (!targetClass) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    let updated = 0;
    const skipped: { studentId: string; reason: string }[] = [];

    for (const studentId of body.studentIds) {
      const student = await prisma.studentStub.findFirst({ where: { id: studentId, schoolId: request.schoolId, status: "active" } });
      if (!student) {
        skipped.push({ studentId, reason: "Not found" });
        continue;
      }
      if (request.user.role === "teacher" && !(await resolveClassSectionForCaller(request.schoolId!, student.classSectionId, request.user))) {
        skipped.push({ studentId, reason: "Not authorized for this student's current class" });
        continue;
      }
      await prisma.studentStub.update({ where: { id: studentId }, data: { classSectionId: targetClass.id, updatedBy: request.user.sub } });
      updated += 1;
    }

    return { data: { updated, skipped }, meta: {} };
  });

  // Soft delete only - see the schema comment on StudentStub.status. Removed
  // students disappear from normal listings but their submission/grade
  // history is never touched.
  app.delete<{ Params: { id: string } }>("/students/:id", { onRequest: manageScoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }
    if (request.user.role === "teacher" && !(await resolveClassSectionForCaller(request.schoolId!, student.classSectionId, request.user))) {
      return reply.code(403).send({ data: null, error: { code: "forbidden", message: "Not authorized for this student's class" } });
    }

    await prisma.studentStub.update({ where: { id: student.id }, data: { status: "removed", tokenVersion: { increment: 1 }, updatedBy: request.user.sub } });

    return { data: { deleted: true }, meta: {} };
  });
}
