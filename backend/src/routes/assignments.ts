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
  topicId?: string;
}

interface UpdatePersonalisationBody {
  status: "approved" | "overridden" | "opted_out";
  appliedMix?: Record<string, number>;
}

interface UpdateAnswerKeyBody {
  teacherVerifiedAnswer: string;
  marks?: number;
}

const VALID_DECISIONS = ["approved", "overridden", "opted_out"];
// Client doc, Assignment Lab Personalisation prerequisite: at least two prior
// assignments on the same topic already distributed and graded.
const PERSONALISATION_PREREQUISITE_COUNT = 2;

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// True once a student has at least PERSONALISATION_PREREQUISITE_COUNT graded
// submissions on assignments belonging to the given topic. Enforced here,
// server-side, per the client doc's explicit acceptance criterion - the UI
// must not be the only gate.
async function personalisationEligible(schoolId: string, topicId: string | null, studentStubId: string): Promise<boolean> {
  if (!topicId) return false;
  const gradedCount = await prisma.grade.count({
    where: {
      submission: {
        studentStubId,
        assignment: { schoolId, topicId },
      },
      finalScore: { not: null },
    },
  });
  return gradedCount >= PERSONALISATION_PREREQUISITE_COUNT;
}

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

    if (body.topicId) {
      const topic = await prisma.topic.findFirst({ where: { id: body.topicId, schoolId: request.schoolId } });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }
    }

    const assignment = await prisma.assignment.create({
      data: {
        schoolId: request.schoolId,
        topicId: body.topicId ?? null,
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
      const skipped: { studentStubId: string; reason: string }[] = [];
      for (const student of students) {
        const existing = await prisma.personalisationSuggestion.findUnique({
          where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: student.id } },
        });
        if (existing) {
          created.push(existing);
          continue;
        }

        const eligible = await personalisationEligible(request.schoolId, assignment.topicId, student.id);
        if (!eligible) {
          // Server-side enforcement: standard assignment generation still
          // succeeds for these students, only personalisation is withheld,
          // and the reason is explicit rather than a silent skip.
          skipped.push({
            studentStubId: student.id,
            reason: `Needs ${PERSONALISATION_PREREQUISITE_COUNT} prior graded assignments on this topic before personalisation is available`,
          });
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

      return reply.code(201).send({ data: { created, skipped }, meta: {} });
    }
  );

  // GET eligibility, checked independently of generation - the Personalisation
  // Review screen calls this to show plainly why a student is unavailable
  // before the teacher even tries to generate for them.
  app.get<{ Params: { id: string } }>(
    "/assignments/:id/personalisation-eligibility",
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

      const data = await Promise.all(
        students.map(async (student) => ({
          studentStubId: student.id,
          fullName: student.fullName,
          eligible: await personalisationEligible(request.schoolId, assignment.topicId, student.id),
        }))
      );

      return { data, meta: {} };
    }
  );

  // Draft answer key from the assignment's questions - teacher review step
  // before distribution (client doc workflow step 18/19).
  app.post<{ Params: { id: string } }>("/assignments/:id/answer-key/generate", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }

    const questions = assignment.questions as unknown as { id: string; prompt: string }[];
    const start = Date.now();
    const { answers, model } = await aiProvider.generateAnswerKey(
      questions.map((q, index) => ({ index, prompt: q.prompt, marks: 1 }))
    );

    const rows = await Promise.all(
      questions.map((_, index) =>
        prisma.answerKey.upsert({
          where: { assignmentId_questionIndex: { assignmentId: assignment.id, questionIndex: index } },
          create: { assignmentId: assignment.id, questionIndex: index, aiAnswer: answers[index] ?? "" },
          update: { aiAnswer: answers[index] ?? "" },
        })
      )
    );

    await logAiUsage({
      schoolId: request.schoolId,
      teacherUserId: request.user.sub,
      feature: "generation",
      model,
      durationMs: Date.now() - start,
    });

    return reply.code(201).send({ data: rows, meta: {} });
  });

  app.get<{ Params: { id: string } }>("/assignments/:id/answer-key", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    const answerKeys = await prisma.answerKey.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { questionIndex: "asc" },
    });
    return { data: answerKeys, meta: {} };
  });

  // Teacher-verified version, once set, is authoritative - never aiAnswer.
  app.patch<{ Params: { id: string }; Body: UpdateAnswerKeyBody }>(
    "/answer-key/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as UpdateAnswerKeyBody);
      if (!body.teacherVerifiedAnswer || !body.teacherVerifiedAnswer.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "teacherVerifiedAnswer is required" } });
      }

      const answerKey = await prisma.answerKey.findFirst({
        where: { id: request.params.id, assignment: { schoolId: request.schoolId } },
      });
      if (!answerKey) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Answer key entry not found" } });
      }

      const updated = await prisma.answerKey.update({
        where: { id: answerKey.id },
        data: { teacherVerifiedAnswer: body.teacherVerifiedAnswer, marks: body.marks ?? answerKey.marks },
      });

      return { data: updated, meta: {} };
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
