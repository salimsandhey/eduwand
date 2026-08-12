import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage } from "../lib/ai";

interface Question {
  id: string;
  prompt: string;
  type?: string;
}

interface CreateAssignmentBody {
  title: string;
  classSectionId: string;
  questions: Question[];
  personalisationEnabled?: boolean;
}

interface UpdatePersonalisationBody {
  status: "approved" | "overridden" | "opted_out";
  appliedMix?: Record<string, number>;
}

const VALID_DECISIONS = ["approved", "overridden", "opted_out"];

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// Assignment Lab: create + personalisation review (FR-AI-2). The mandatory
// teacher-initiated fallback design (PRD section 6.4) means
// POST .../personalisation-suggestions below ONLY ever creates status:"pending"
// rows and never touches appliedMix - PATCH /personalisation-suggestions/:id
// is the single place in this whole codebase allowed to set it.
export async function assignmentRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateAssignmentBody }>("/assignments", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as CreateAssignmentBody);

    if (!body.title || !body.classSectionId || !Array.isArray(body.questions) || body.questions.length === 0) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "title, classSectionId, and at least one question are required" },
      });
    }

    const classSection = await prisma.classSection.findFirst({
      where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
    });
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    const assignment = await prisma.assignment.create({
      data: {
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        classSectionId: body.classSectionId,
        title: body.title,
        questions: body.questions as unknown as Prisma.InputJsonValue,
        personalisationEnabled: body.personalisationEnabled ?? false,
        status: "draft",
      },
    });

    return reply.code(201).send({ data: assignment, meta: {} });
  });

  app.get("/assignments", { onRequest: scoped(app) }, async (request) => {
    const assignments = await prisma.assignment.findMany({
      where: { schoolId: request.schoolId, teacherUserId: request.user.sub },
      orderBy: { createdAt: "desc" },
    });
    return { data: assignments, meta: {} };
  });

  app.get<{ Params: { id: string } }>("/assignments/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: {
        personalisationSuggestions: { include: { studentStub: { select: { id: true, fullName: true } } } },
        submissions: { include: { grade: true, studentStub: { select: { id: true, fullName: true } } } },
      },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    return { data: assignment, meta: {} };
  });

  app.post<{ Params: { id: string } }>(
    "/assignments/:id/personalisation-suggestions",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const assignment = await prisma.assignment.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!assignment) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
      }

      const students = await prisma.studentStub.findMany({
        where: { classSectionId: assignment.classSectionId, schoolId: request.schoolId },
      });
      if (students.length === 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "No admitted students in this class section yet" },
        });
      }

      const created = [];
      for (const student of students) {
        const existing = await prisma.personalisationSuggestion.findUnique({
          where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: student.id } },
        });
        if (existing) {
          created.push(existing);
          continue;
        }

        const pastGrades = await prisma.grade.findMany({
          where: {
            submission: { studentStubId: student.id, assignment: { schoolId: request.schoolId } },
            finalScore: { not: null },
          },
          select: { finalScore: true },
        });
        const avgScore =
          pastGrades.length > 0 ? pastGrades.reduce((sum, g) => sum + (g.finalScore ?? 0), 0) / pastGrades.length : null;

        const start = Date.now();
        const { suggestedMix, reasoning, model } = await aiProvider.generatePersonalisationSuggestion({
          studentName: student.fullName,
          avgScore,
          submissionCount: pastGrades.length,
        });

        // status is always "pending" here, appliedMix is never set here - see
        // the file header comment.
        const suggestion = await prisma.personalisationSuggestion.create({
          data: {
            assignmentId: assignment.id,
            studentStubId: student.id,
            suggestedMix,
            reasoning,
            status: "pending",
          },
        });
        created.push(suggestion);

        await logAiUsage({
          schoolId: request.schoolId,
          teacherUserId: request.user.sub,
          feature: "personalisation_suggestion",
          model,
          durationMs: Date.now() - start,
        });
      }

      return reply.code(201).send({ data: created, meta: {} });
    }
  );

  // The single enforcement point for FR-AI-2 (PRD section 6.4) - no other
  // route in this codebase may write PersonalisationSuggestion.appliedMix.
  app.patch<{ Params: { id: string }; Body: UpdatePersonalisationBody }>(
    "/personalisation-suggestions/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdatePersonalisationBody);

      if (!body.status || !VALID_DECISIONS.includes(body.status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${VALID_DECISIONS.join(", ")}` },
        });
      }
      if (body.status === "overridden" && !body.appliedMix) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "appliedMix is required when overriding" },
        });
      }

      const suggestion = await prisma.personalisationSuggestion.findFirst({
        where: { id: request.params.id, assignment: { schoolId: request.schoolId } },
      });
      if (!suggestion) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Personalisation suggestion not found" } });
      }
      if (suggestion.status !== "pending") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `This suggestion is already ${suggestion.status}` },
        });
      }

      const appliedMix: Prisma.InputJsonValue | typeof Prisma.DbNull =
        body.status === "opted_out"
          ? Prisma.DbNull
          : body.status === "overridden"
          ? (body.appliedMix as Prisma.InputJsonValue)
          : (suggestion.suggestedMix as Prisma.InputJsonValue);

      const updated = await prisma.personalisationSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: body.status,
          appliedMix,
          decidedByUserId: request.user.sub,
          decidedAt: new Date(),
        },
      });

      return { data: updated, meta: {} };
    }
  );

  app.post<{ Params: { id: string } }>("/assignments/:id/publish", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status === "published") {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Already published" } });
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "published", publishedAt: new Date() },
    });

    return { data: updated, meta: {} };
  });
}
