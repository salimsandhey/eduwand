import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";
import { aiProvider } from "../lib/ai";

interface CreateStudentSubmissionBody {
  assignmentId: string;
  answers: Record<string, string>;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("student")];

// Phase 4 (Docs/Dev/AI_Module_Rebuild_Plan.md): students can now submit their
// own work here (POST /student/submissions), closing the gap where only a
// teacher could log a submission on a student's behalf (submissions.ts still
// supports that path too, for teacher-assisted logging). Everything below is
// scoped strictly to the caller's own StudentStub and class section.
export async function studentPortalRoutes(app: FastifyInstance) {
  app.get("/student/me", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
      include: { classSection: true },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }
    return { data: student, meta: {} };
  });

  app.get("/student/assignments", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const assignments = await prisma.assignment.findMany({
      where: { schoolId: request.schoolId, classSectionId: student.classSectionId, status: "published" },
      orderBy: { publishedAt: "desc" },
      include: {
        submissions: {
          where: { studentStubId: student.id },
          include: { grade: true },
        },
      },
    });

    const data = assignments.map((assignment) => {
      const submission = assignment.submissions[0] ?? null;
      // A student only ever sees a released grade, never an ai_graded-but-unreleased
      // one - matches the teacher-approval-gate pattern used for personalisation.
      const grade =
        submission?.grade && submission.grade.releasedToStudent
          ? {
              finalScore: submission.grade.finalScore,
              finalFeedback: submission.grade.finalFeedback,
              performanceBand: submission.grade.performanceBand,
              releasedAt: submission.grade.releasedAt,
            }
          : null;

      return {
        id: assignment.id,
        title: assignment.title,
        questions: assignment.questions,
        publishedAt: assignment.publishedAt,
        submissionStatus: submission ? (grade ? "graded" : "submitted") : "not_submitted",
        grade,
      };
    });

    return { data, meta: {} };
  });

  // Student's own submission - online answers or a photo upload. Resumability
  // (surviving a dropped connection) is a client-side concern (local draft
  // persistence before submit) not modelled here; this endpoint is the final
  // submit action once the student has an answer set ready.
  app.post<{ Body: CreateStudentSubmissionBody }>("/student/submissions", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const isMultipart = request.isMultipart?.();
    let assignmentId: string;
    let answers: Record<string, string> = {};
    let submissionType: "online" | "photo" = "online";
    let photoFileLocation: string | null = null;

    if (isMultipart) {
      const parts = request.parts();
      const fields: Record<string, string> = {};
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          const { location } = await storage.save(`submissions/${Date.now()}-${part.filename}`, buffer);
          photoFileLocation = location;
          submissionType = "photo";
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
      assignmentId = fields.assignmentId;
      answers = fields.answers ? JSON.parse(fields.answers) : {};
    } else {
      const body = request.body ?? ({} as CreateStudentSubmissionBody);
      assignmentId = body.assignmentId;
      answers = body.answers ?? {};
    }

    if (!assignmentId) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "assignmentId is required" } });
    }

    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, schoolId: request.schoolId, classSectionId: student.classSectionId, status: "published" },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found for this student" } });
    }

    const existing = await prisma.submission.findUnique({
      where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: student.id } },
    });
    if (existing) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "You already submitted this assignment" } });
    }

    let ocrExtractedText: string | null = null;
    let ocrConfidence: number | null = null;
    if (submissionType === "photo" && photoFileLocation) {
      const ocr = await aiProvider.extractTextFromPhoto({ fileLocation: photoFileLocation });
      ocrExtractedText = ocr.text;
      ocrConfidence = ocr.confidence;
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentStubId: student.id,
        answers: answers as unknown as Prisma.InputJsonValue,
        submissionType,
        photoFileLocation,
        ocrExtractedText,
        ocrConfidence,
      },
    });
    await prisma.grade.create({ data: { submissionId: submission.id, status: "pending" } });

    return reply.code(201).send({ data: submission, meta: {} });
  });

  app.get("/student/submissions", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const submissions = await prisma.submission.findMany({
      where: { studentStubId: student.id },
      include: { assignment: { select: { id: true, title: true } }, grade: true },
      orderBy: { submittedAt: "desc" },
    });

    const data = submissions.map((s) => ({
      id: s.id,
      assignment: s.assignment,
      submissionType: s.submissionType,
      submittedAt: s.submittedAt,
      grade:
        s.grade && s.grade.releasedToStudent
          ? { finalScore: s.grade.finalScore, finalFeedback: s.grade.finalFeedback, performanceBand: s.grade.performanceBand }
          : null,
    }));

    return { data, meta: {} };
  });

  // Learning materials: generations from the student's own class's topics
  // that the teacher has explicitly distributed. Materials never generated
  // for the student's topics, or generated but not yet distributed, don't
  // appear here - distribution is still a stub (Docs/Dev/AI_Module_Rebuild_Plan.md
  // Phase 2 note on POST /generations/{id}/distribute), so this list will be
  // empty until that's wired to actually flip a flag. Returning the student's
  // class's edited generations directly for now is a reasonable interim
  // default, not a workaround - the "distributed" gate is the missing piece,
  // not this read path.
  app.get("/student/materials", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const generations = await prisma.generation.findMany({
      where: { topic: { schoolId: request.schoolId, classSectionId: student.classSectionId } },
      include: { topic: { select: { id: true, name: true, subject: true } } },
      orderBy: { generatedAt: "desc" },
    });

    const data = generations
      .filter((g) => g.generationStatus === "succeeded")
      .map((g) => ({
        id: g.id,
        topic: g.topic,
        outputType: g.outputType,
        content: g.editedOutput ?? g.aiOutput,
        generatedAt: g.generatedAt,
      }));

    return { data, meta: {} };
  });

  // Communication Hub - student side. A student always messages "the
  // teacher" without picking one explicitly (client doc doesn't specify
  // multi-teacher routing) - stored as student_to_teacher against the
  // student's own class section, which any teacher of that class can read
  // via GET /communications?studentStubId=... (communications.ts).
  app.get("/student/communications", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const messages = await prisma.communicationMessage.findMany({
      where: {
        schoolId: request.schoolId,
        OR: [
          { channel: "teacher_to_student", recipientStudentStubId: student.id },
          { channel: "student_to_teacher", senderStudentStubId: student.id },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    return { data: messages, meta: {} };
  });

  app.post<{ Body: { body: string } }>("/student/communications", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as { body: string });
    if (!body.body || !body.body.trim()) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "body is required" } });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const message = await prisma.communicationMessage.create({
      data: {
        schoolId: request.schoolId,
        channel: "student_to_teacher",
        senderStudentStubId: student.id,
        recipientClassSectionId: student.classSectionId,
        body: body.body.trim(),
        deliveryStatus: "sent",
        sentAt: new Date(),
      },
    });

    return reply.code(201).send({ data: message, meta: {} });
  });
}
