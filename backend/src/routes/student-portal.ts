import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("student")];

// Read-only views for the student role. A student never submits their own
// work here yet (submissions.ts still has teachers logging submissions on a
// student's behalf) - this only surfaces what's already been assigned and
// graded, scoped strictly to the caller's own StudentStub and class section.
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
        submission?.grade && submission.grade.status === "released"
          ? {
              finalScore: submission.grade.finalScore,
              finalFeedback: submission.grade.finalFeedback,
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
}
