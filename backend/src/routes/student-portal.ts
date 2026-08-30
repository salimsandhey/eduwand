import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";
import { aiProvider } from "../lib/ai";
import { selectQuestionsForMix } from "../lib/personalisation";

interface CreateStudentSubmissionBody {
  assignmentId: string;
  answers: Record<string, string>;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("student")];

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

    // Personalisation actually takes effect here: a student with an
    // approved/overridden PersonalisationSuggestion sees only the subset of
    // questions their mix selects, not the full assignment (see
    // lib/personalisation.ts - previously the mix was decided and stored but
    // nothing ever read it back).
    const suggestions = await prisma.personalisationSuggestion.findMany({
      where: { studentStubId: student.id, assignmentId: { in: assignments.map((a) => a.id) } },
    });
    const mixByAssignment = new Map(suggestions.map((s) => [s.assignmentId, s.appliedMix as Record<string, number> | null]));

    const data = assignments.map((assignment) => {
      const submission = assignment.submissions[0] ?? null;
      const grade =
        submission?.grade && submission.grade.releasedToStudent
          ? {
              finalScore: submission.grade.finalScore,
              finalFeedback: submission.grade.finalFeedback,
              performanceBand: submission.grade.performanceBand,
              releasedAt: submission.grade.releasedAt,
            }
          : null;

      const allQuestions = assignment.questions as unknown as { id: string; prompt: string; difficulty?: string }[];
      const questions = assignment.personalisationEnabled
        ? selectQuestionsForMix(allQuestions, mixByAssignment.get(assignment.id))
        : allQuestions;

      return {
        id: assignment.id,
        title: assignment.title,
        questions,
        publishedAt: assignment.publishedAt,
        submissionStatus: submission ? (grade ? "graded" : "submitted") : "not_submitted",
        grade,
      };
    });

    return { data, meta: {} };
  });

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
      const allQuestions = assignment.questions as unknown as { id: string; prompt: string; difficulty?: string }[];
      const questionsForOcr = assignment.personalisationEnabled
        ? selectQuestionsForMix(
            allQuestions,
            (
              await prisma.personalisationSuggestion.findUnique({
                where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: student.id } },
              })
            )?.appliedMix as Record<string, number> | null | undefined
          )
        : allQuestions;
      const ocr = await aiProvider.extractTextFromPhoto({ fileLocation: photoFileLocation, questions: questionsForOcr });
      ocrExtractedText = ocr.perQuestion ? JSON.stringify(ocr.perQuestion) : ocr.text;
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

  app.get("/student/materials", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const generations = await prisma.generation.findMany({
      where: {
        topic: { schoolId: request.schoolId, classSectionId: student.classSectionId },
        generationStatus: "succeeded",
        shareStatus: "published",
      },
      include: { topic: { select: { id: true, name: true, subject: true } } },
      orderBy: { publishedAt: "desc" },
    });

    const data = generations.map((g) => ({
      id: g.id,
      topic: g.topic,
      outputType: g.outputType,
      content: g.editedOutput ?? g.aiOutput,
      generatedAt: g.generatedAt,
      publishedAt: g.publishedAt,
    }));

    return { data, meta: {} };
  });

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
          { channel: "teacher_to_class", recipientClassSectionId: student.classSectionId },
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
