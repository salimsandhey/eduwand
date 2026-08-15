import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

interface SendToStudentBody {
  studentStubId: string;
  body: string;
}

interface SendToClassBody {
  classSectionId: string;
  body: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// Communication Hub (Docs/Dev/AI_Module_Rebuild_Plan.md, Phase 4).
// teacher_to_student/teacher_to_class/student_to_teacher are in-app
// messaging between accounts that already exist in EduWand, so they deliver
// immediately (deliveryStatus defaults to "sent" - see schema.prisma). Only
// parent_weekly_update is blocked: parents have no EduWand account (PRD
// section 3, receive-only), so that channel needs a real external mechanism
// (SMS/email) the client doc's own Q-08 gap leaves unresolved (Section 7.3
// references a Q-08 that Section 8 never defines) - those rows alone are
// created with deliveryStatus:"pending" and never actually sent by this code.
export async function communicationRoutes(app: FastifyInstance) {
  app.get("/communications", { onRequest: scoped(app) }, async (request) => {
    const query = (request.query ?? {}) as { studentStubId?: string; classSectionId?: string };

    // With studentStubId, return the full two-way thread (teacher's own
    // sent messages to this student, plus this student's own
    // student_to_teacher replies) rather than only what this teacher sent -
    // a thread view needs both directions.
    if (query.studentStubId) {
      const messages = await prisma.communicationMessage.findMany({
        where: {
          schoolId: request.schoolId,
          OR: [
            { channel: "teacher_to_student", senderUserId: request.user.sub, recipientStudentStubId: query.studentStubId },
            { channel: "student_to_teacher", senderStudentStubId: query.studentStubId },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
      return { data: messages, meta: {} };
    }

    const messages = await prisma.communicationMessage.findMany({
      where: {
        schoolId: request.schoolId,
        senderUserId: request.user.sub,
        ...(query.classSectionId ? { recipientClassSectionId: query.classSectionId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return { data: messages, meta: {} };
  });

  app.post<{ Body: SendToStudentBody }>("/communications/teacher-to-student", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as SendToStudentBody);
    if (!body.studentStubId || !body.body?.trim()) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "studentStubId and body are required" } });
    }

    const student = await prisma.studentStub.findFirst({ where: { id: body.studentStubId, schoolId: request.schoolId } });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const message = await prisma.communicationMessage.create({
      data: {
        schoolId: request.schoolId,
        channel: "teacher_to_student",
        senderUserId: request.user.sub,
        recipientStudentStubId: student.id,
        body: body.body.trim(),
        deliveryStatus: "sent",
        sentAt: new Date(),
      },
    });

    return reply.code(201).send({ data: message, meta: {} });
  });

  app.post<{ Body: SendToClassBody }>("/communications/teacher-to-class", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as SendToClassBody);
    if (!body.classSectionId || !body.body?.trim()) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "classSectionId and body are required" } });
    }

    const classSection = await prisma.classSection.findFirst({
      where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
    });
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    const message = await prisma.communicationMessage.create({
      data: {
        schoolId: request.schoolId,
        channel: "teacher_to_class",
        senderUserId: request.user.sub,
        recipientClassSectionId: classSection.id,
        body: body.body.trim(),
        deliveryStatus: "sent",
        sentAt: new Date(),
      },
    });

    return reply.code(201).send({ data: message, meta: {} });
  });

  // Preview pending weekly parent updates before they send (client doc
  // acceptance criterion: teacher can review/stop one). Generation of these
  // rows is a worker job (Docs/Dev/AI_Module_Rebuild_Plan.md Phase 4) not yet
  // built - this lists whatever exists with channel:parent_weekly_update and
  // deliveryStatus:pending, which will be empty until that worker job exists.
  app.get("/communications/parent-weekly-update/pending", { onRequest: scoped(app) }, async (request) => {
    const pending = await prisma.communicationMessage.findMany({
      where: { schoolId: request.schoolId, channel: "parent_weekly_update", deliveryStatus: "pending" },
      orderBy: { createdAt: "desc" },
    });
    return { data: pending, meta: {} };
  });

  app.post<{ Params: { id: string } }>(
    "/communications/parent-weekly-update/:id/hold",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const message = await prisma.communicationMessage.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId, channel: "parent_weekly_update" },
      });
      if (!message) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Pending update not found" } });
      }
      if (message.deliveryStatus !== "pending") {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This update is no longer pending" } });
      }

      const updated = await prisma.communicationMessage.update({
        where: { id: message.id },
        data: { deliveryStatus: "held" },
      });

      return { data: updated, meta: {} };
    }
  );
}
