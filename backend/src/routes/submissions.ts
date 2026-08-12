import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage, GradingQuestion } from "../lib/ai";

interface CreateSubmissionBody {
  assignmentId: string;
  studentStubId: string;
  answers: Record<string, string>;
}

interface UpdateGradeBody {
  finalScore?: number;
  finalFeedback?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// A teacher logs a submission on a student's behalf - there is no student
// login in this build phase (PRD section 3, "structural shell only").
export async function submissionRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateSubmissionBody }>("/submissions", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as CreateSubmissionBody);

    if (!body.assignmentId || !body.studentStubId) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "assignmentId and studentStubId are required" },
      });
    }

    const assignment = await prisma.assignment.findFirst({
      where: { id: body.assignmentId, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status !== "published") {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "Assignment must be published before logging submissions" },
      });
    }

    const student = await prisma.studentStub.findFirst({
      where: { id: body.studentStubId, schoolId: request.schoolId, classSectionId: assignment.classSectionId },
    });
    if (!student) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Student not found in this class" } });
    }

    const existing = await prisma.submission.findUnique({
      where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: student.id } },
    });
    if (existing) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "This student already has a submission for this assignment" },
      });
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentStubId: student.id,
        answers: (body.answers ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.grade.create({ data: { submissionId: submission.id, status: "pending" } });

    return reply.code(201).send({ data: submission, meta: {} });
  });

  app.post<{ Params: { id: string } }>("/submissions/:id/grade", { onRequest: scoped(app) }, async (request, reply) => {
    const submission = await prisma.submission.findFirst({
      where: { id: request.params.id, assignment: { schoolId: request.schoolId } },
      include: { assignment: true, grade: true },
    });
    if (!submission) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Submission not found" } });
    }
    if (!submission.grade) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Grade record not found" } });
    }
    if (submission.grade.status !== "pending") {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: `Already ${submission.grade.status}` },
      });
    }

    const questions = submission.assignment.questions as unknown as GradingQuestion[];
    const answers = submission.answers as unknown as Record<string, string>;

    const start = Date.now();
    const { score, feedback, flagged, model } = await aiProvider.gradeSubmission({ questions, answers });

    const grade = await prisma.grade.update({
      where: { id: submission.grade.id },
      data: { aiScore: score, aiFeedback: feedback, flaggedForAttention: flagged, status: "ai_graded" },
    });

    await logAiUsage({
      schoolId: request.schoolId,
      teacherUserId: request.user.sub,
      feature: "grading",
      model,
      durationMs: Date.now() - start,
    });

    return { data: grade, meta: {} };
  });

  // "Accept AI grade" is calling this with no body - finalScore/finalFeedback
  // fall back to the AI's own values.
  app.patch<{ Params: { id: string }; Body: UpdateGradeBody }>("/grades/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const grade = await prisma.grade.findFirst({
      where: { id: request.params.id, submission: { assignment: { schoolId: request.schoolId } } },
    });
    if (!grade) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Grade not found" } });
    }
    if (grade.status === "released") {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This grade has already been released" } });
    }

    const body = request.body ?? {};
    const updated = await prisma.grade.update({
      where: { id: grade.id },
      data: {
        finalScore: body.finalScore ?? grade.aiScore,
        finalFeedback: body.finalFeedback ?? grade.aiFeedback,
        overriddenByUserId: request.user.sub,
      },
    });

    return { data: updated, meta: {} };
  });

  // Bulk "release grades" action (UI Screen Spec, Grading Review) - not a
  // per-submission call in the original API table, added because that's how
  // the screen's single action is meant to behave.
  app.post<{ Params: { id: string } }>(
    "/assignments/:id/release-grades",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const assignment = await prisma.assignment.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!assignment) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
      }

      const submissions = await prisma.submission.findMany({
        where: { assignmentId: assignment.id },
        include: { grade: true },
      });
      const toRelease = submissions.filter((s) => s.grade && s.grade.status === "ai_graded");

      for (const s of toRelease) {
        await prisma.grade.update({
          where: { id: s.grade!.id },
          data: {
            status: "released",
            releasedAt: new Date(),
            finalScore: s.grade!.finalScore ?? s.grade!.aiScore,
            finalFeedback: s.grade!.finalFeedback ?? s.grade!.aiFeedback,
          },
        });
      }

      return { data: { releasedCount: toRelease.length }, meta: {} };
    }
  );
}
