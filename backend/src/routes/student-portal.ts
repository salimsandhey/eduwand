import { FastifyInstance } from "fastify";
import { detectImageMime, imageKey, IMAGE_ONLY_ERROR } from "../lib/upload";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { publish } from "../lib/realtime";
import { storage } from "../lib/storage";
import { aiProvider } from "../lib/ai";
import { selectQuestionsForMix } from "../lib/personalisation";

interface CreateStudentSubmissionBody {
  assignmentId: string;
  answers: Record<string, string>;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("student")];

interface StoredQuestion {
  id: string;
  prompt: string;
  difficulty?: string;
  type?: string;
  options?: string[];
  correctOptionIndex?: number;
}

// The stored question JSON carries correctOptionIndex for MCQ questions - it
// must never reach the student client (it would hand them the answer key).
// Options themselves are kept; only the marker of which one is right is dropped.
function sanitiseQuestionForStudent(question: StoredQuestion) {
  const { correctOptionIndex: _drop, ...safe } = question;
  return safe;
}

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

      const allQuestions = assignment.questions as unknown as StoredQuestion[];
      const selected = assignment.personalisationEnabled
        ? selectQuestionsForMix(allQuestions, mixByAssignment.get(assignment.id))
        : allQuestions;
      const questions = selected.map(sanitiseQuestionForStudent);

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
          const imageMime = detectImageMime(buffer);
          if (!imageMime) return reply.code(400).send(IMAGE_ONLY_ERROR);
          const { location } = await storage.save(imageKey("submissions", imageMime), buffer);
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

  // Quick-check quiz results - only shows up once the teacher explicitly
  // releases them (resultsReleasedToStudents), same gate pattern as
  // Grade.releasedToStudent above. Capture is teacher-proxy, so a student
  // never interacts with the assessment itself - this is read-only.
  app.get("/student/assessments", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const assessments = await prisma.assessment.findMany({
      where: { classSectionId: student.classSectionId, resultsReleasedToStudents: true },
      include: { topic: { select: { name: true } }, responses: { where: { studentStubId: student.id } } },
      orderBy: { resultsReleasedAt: "desc" },
    });

    const data = assessments
      .filter((a) => a.responses.length > 0)
      .map((a) => {
        const questions = a.questions as unknown as { id: string; prompt: string }[];
        const correctCount = a.responses.filter((r) => r.isCorrect).length;
        return {
          id: a.id,
          title: a.title,
          topicName: a.topic.name,
          score: { correctCount, totalQuestions: questions.length },
          questions: questions.map((q) => ({
            prompt: q.prompt,
            wasCorrect: a.responses.find((r) => r.questionId === q.id)?.isCorrect ?? null,
          })),
          resultsReleasedAt: a.resultsReleasedAt,
        };
      });

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
        // Shared with the whole class, or this student was specifically picked.
        OR: [{ sharedWithAll: true }, { sharedStudentStubIds: { has: student.id } }],
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

  // Who the student is talking to on the Messages screen: their class and the
  // teachers on it, plus anyone else who has messaged them (a teacher since
  // moved off the class) so older bubbles still show a name.
  app.get("/student/communications/context", { onRequest: scoped(app) }, async (request, reply) => {
    const student = await prisma.studentStub.findFirst({
      where: { id: request.user.sub, schoolId: request.schoolId },
      include: {
        classSection: {
          include: {
            teacherAssignments: {
              include: { teacher: { select: { id: true, fullName: true, avatarKey: true, photoMimeType: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found" } });
    }

    const classTeachers = student.classSection.teacherAssignments.map(({ teacher }) => teacher);
    const senderIds = await prisma.communicationMessage.findMany({
      where: {
        schoolId: request.schoolId,
        senderUserId: { not: null, notIn: classTeachers.map((t) => t.id) },
        OR: [
          { channel: "teacher_to_student", recipientStudentStubId: student.id },
          { channel: "teacher_to_class", recipientClassSectionId: student.classSectionId },
        ],
      },
      distinct: ["senderUserId"],
      select: { senderUserId: true },
    });
    const pastSenders = senderIds.length
      ? await prisma.appUser.findMany({
          where: { id: { in: senderIds.map((m) => m.senderUserId as string) } },
          select: { id: true, fullName: true, avatarKey: true },
        })
      : [];

    return {
      data: {
        className: student.classSection.className,
        sectionName: student.classSection.sectionName,
        teachers: [
          ...classTeachers.map((t) => ({ id: t.id, fullName: t.fullName, avatarKey: t.avatarKey, hasPhoto: !!t.photoMimeType, isClassTeacher: true })),
          // Photos stay private to a student's current teachers.
          ...pastSenders.map((t) => ({ id: t.id, fullName: t.fullName, avatarKey: t.avatarKey, hasPhoto: false, isClassTeacher: false })),
        ],
      },
      meta: {},
    };
  });

  // A current class teacher's profile photo. <Image source={{ uri }}> can't
  // send an Authorization header, so this also accepts ?token= (same as
  // /auth/me/photo).
  app.get<{ Params: { teacherId: string } }>(
    "/student/teachers/:teacherId/photo",
    {
      onRequest: [
        async (request, reply) => {
          if (!request.headers.authorization) {
            const token = (request.query as { token?: string } | undefined)?.token;
            if (token) request.headers.authorization = `Bearer ${token}`;
          }
          await app.authenticate(request, reply);
        },
        app.requireSchoolScope,
        requireRoles("student"),
      ],
    },
    async (request, reply) => {
      const student = await prisma.studentStub.findFirst({
        where: { id: request.user.sub, schoolId: request.schoolId },
        select: { classSectionId: true },
      });
      const assignment = student
        ? await prisma.classSectionTeacher.findFirst({
            where: { classSectionId: student.classSectionId, teacherUserId: request.params.teacherId },
            include: { teacher: { select: { photoLocation: true, photoMimeType: true } } },
          })
        : null;
      const teacher = assignment?.teacher;
      if (!teacher?.photoLocation || !teacher.photoMimeType) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "No photo" } });
      }
      const buffer = await storage.readBuffer(teacher.photoLocation);
      reply.type(teacher.photoMimeType);
      return reply.send(buffer);
    }
  );

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

    const teachers = await prisma.classSectionTeacher.findMany({
      where: { classSectionId: student.classSectionId },
      select: { teacherUserId: true },
    });
    publish([`user:${student.id}`, ...teachers.map((t) => `user:${t.teacherUserId}`)], { type: "message", message });

    return reply.code(201).send({ data: message, meta: {} });
  });
}
