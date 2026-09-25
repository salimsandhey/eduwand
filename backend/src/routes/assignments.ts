import { FastifyInstance } from "fastify";
import { sendEmailsInBackground } from "../lib/email/sender";
import { assignmentPublishedEmail, classLabel } from "../lib/email/templates";
import { studentRecipientsForClass } from "../lib/email/recipients";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage, AssignmentGenInput, GeneratedAssignmentQuestion, AssignmentQuestionType, ALL_QUESTION_TYPES } from "../lib/ai";
import { hasSufficientCredits, getFeatureCost } from "../lib/credits";
import { buildTaughtContentText, buildContextSourceText } from "../lib/generation-content";
import { markOnboardingTaskComplete } from "../lib/onboarding";
import { getSchoolBoard } from "../lib/boards";

interface Question {
  id: string;
  prompt: string;
  type?: string;
  difficulty?: "easy" | "medium" | "hard";
}

interface CreateAssignmentBody {
  title: string;
  classSectionId: string;
  questions: Question[];
  personalisationEnabled?: boolean;
  topicId?: string;
}

interface UpdateAssignmentBody {
  title?: string;
  questions?: Question[];
  personalisationEnabled?: boolean;
}

interface PublishAssignmentBody {
  // Set once the teacher has already been warned that the answer key isn't
  // fully reviewed and chose to publish anyway.
  confirmUnverified?: boolean;
}

interface UpdatePersonalisationBody {
  status: "approved" | "overridden" | "opted_out";
  appliedMix?: Record<string, number>;
}

interface UpdateAnswerKeyBody {
  teacherVerifiedAnswer: string;
  marks?: number;
}

interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

interface CreateAssignmentDraftBody {
  questionCount: number;
  difficultyMix: DifficultyMix;
  objectives?: string[];
  // Empty/omitted = the AI may use any format.
  questionTypes?: string[];
  focusPrompt?: string;
}

interface RegenerateQuestionBody {
  instruction?: string;
}

interface CreateMultiTopicAssignmentDraftBody extends CreateAssignmentDraftBody {
  topicIds: string[];
}

interface StoredAiGenParams {
  questionCount: number;
  difficultyMix: DifficultyMix;
  objectives: string[];
  questionTypes: AssignmentQuestionType[];
  focusPrompt: string | null;
  // Every topic this assignment draws content from - one entry for the usual
  // single-topic case, several for a "mix of topics" assignment made from
  // the Assignment tab (see /class-sections/:id/assignment-draft). Regenerate
  // uses this instead of Assignment.topicId (null for a multi-topic one) to
  // find its way back to the source content.
  topicIds?: string[];
}

const VALID_DECISIONS = ["approved", "overridden", "opted_out"];
const VALID_QUESTION_TYPES = ALL_QUESTION_TYPES as readonly string[];
const PERSONALISATION_PREREQUISITE_COUNT = 2;

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// Shape a generated question into the JSON we persist on Assignment.questions,
// stamping a stable id. Every type-specific field (options/correctOptionIndex
// for mcq+true_false, pairs for match_following, items for sequencing) must
// be handled here or it's silently dropped on save/regenerate - fill_blank,
// very_short and short_answer have no extra fields to carry.
function toStoredQuestion(q: GeneratedAssignmentQuestion, id: string) {
  const base: Record<string, unknown> = { id, prompt: q.prompt, difficulty: q.difficulty, type: q.type };
  if (q.type === "mcq" || q.type === "true_false") {
    base.options = q.options ?? [];
    base.correctOptionIndex = q.correctOptionIndex ?? 0;
  } else if (q.type === "match_following") {
    base.pairs = q.pairs ?? [];
  } else if (q.type === "sequencing") {
    base.items = q.items ?? [];
  }
  return base;
}

function mixFromDifficulty(difficulty: string): DifficultyMix {
  return {
    easy: difficulty === "easy" ? 1 : 0,
    medium: difficulty === "hard" || difficulty === "easy" ? 0 : 1,
    hard: difficulty === "hard" ? 1 : 0,
  };
}

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

    await markOnboardingTaskComplete(request.user.sub, "first_assignment");

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
        submissions: { include: { grade: true, studentStub: { select: { id: true, fullName: true, avatarKey: true, photoMimeType: true } } } },
      },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    return { data: assignment, meta: {} };
  });

  // Edit is only allowed pre-publish - once published, students may already
  // be looking at these questions (and personalised delivery may have
  // selected a subset of them), so changing them out from under an in-flight
  // assignment is disallowed. Unpublish first if it truly needs editing.
  app.patch<{ Params: { id: string }; Body: UpdateAssignmentBody }>("/assignments/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as UpdateAssignmentBody);
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status !== "draft") {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "Only a draft assignment can be edited - unpublish it first" },
      });
    }
    if (body.questions && (!Array.isArray(body.questions) || body.questions.length === 0)) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "At least one question is required" } });
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        title: body.title?.trim() || undefined,
        questions: body.questions ? (body.questions as unknown as Prisma.InputJsonValue) : undefined,
        personalisationEnabled: body.personalisationEnabled,
      },
    });

    return { data: updated, meta: {} };
  });

  // Only reachable while nobody has submitted yet - once a student has
  // submitted against a set of questions, pulling the assignment back to
  // draft (and potentially editing the questions) would orphan or
  // invalidate their answer. Delete has the same guard for the same reason.
  app.post<{ Params: { id: string } }>("/assignments/:id/unpublish", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status !== "published") {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Assignment is not published" } });
    }
    const submissionCount = await prisma.submission.count({ where: { assignmentId: assignment.id } });
    if (submissionCount > 0) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: `Cannot unpublish - ${submissionCount} student submission(s) already exist` },
      });
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "draft", publishedAt: null },
    });

    return { data: updated, meta: {} };
  });

  app.delete<{ Params: { id: string } }>("/assignments/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status !== "draft") {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "Only a draft assignment can be deleted - unpublish it first" },
      });
    }

    await prisma.$transaction([
      prisma.answerKey.deleteMany({ where: { assignmentId: assignment.id } }),
      prisma.personalisationSuggestion.deleteMany({ where: { assignmentId: assignment.id } }),
      prisma.assignment.delete({ where: { id: assignment.id } }),
    ]);

    return { data: { id: assignment.id }, meta: {} };
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

        if (!(await hasSufficientCredits(request.user.sub, await getFeatureCost("personalisation_suggestion")))) {
          skipped.push({ studentStubId: student.id, reason: "Insufficient credits" });
          continue;
        }

        const start = Date.now();
        const { suggestedMix, reasoning, model } = await aiProvider.generatePersonalisationSuggestion({
          studentName: student.fullName,
          avgScore,
          submissionCount: pastGrades.length,
          questionCount: (assignment.questions as unknown as { id: string }[]).length,
        });

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

  app.post<{ Params: { id: string } }>("/assignments/:id/answer-key/generate", { onRequest: scoped(app) }, async (request, reply) => {
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }

    if (!(await hasSufficientCredits(request.user.sub, await getFeatureCost("generation")))) {
      return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to generate this answer key" } });
    }

    const questions = assignment.questions as unknown as { id: string; prompt: string }[];
    const start = Date.now();
    const { answers, model } = await aiProvider.generateAnswerKey(
      questions.map((q, index) => ({ id: q.id, index, prompt: q.prompt, marks: 1 }))
    );

    const rows = await Promise.all(
      questions.map((q, index) =>
        prisma.answerKey.upsert({
          where: { assignmentId_questionId: { assignmentId: assignment.id, questionId: q.id } },
          create: { assignmentId: assignment.id, questionId: q.id, questionIndex: index, aiAnswer: answers[q.id] ?? "" },
          update: { aiAnswer: answers[q.id] ?? "", questionIndex: index },
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

  app.post<{ Params: { id: string }; Body: PublishAssignmentBody }>(
    "/assignments/:id/publish",
    { onRequest: scoped(app) },
    async (request, reply) => {
    const body = request.body ?? ({} as PublishAssignmentBody);
    const assignment = await prisma.assignment.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
    });
    if (!assignment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
    }
    if (assignment.status === "published") {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Already published" } });
    }

    // The answer key is only ever a UI nudge, not a hard requirement - a
    // teacher can always choose to publish anyway (confirmUnverified) - but
    // publishing used to skip this check entirely, so an AI draft answer key
    // could go out to students having never been looked at. Warn once.
    if (!body.confirmUnverified) {
      const answerKeys = await prisma.answerKey.findMany({ where: { assignmentId: assignment.id } });
      const verifiedCount = answerKeys.filter((k) => !!k.teacherVerifiedAnswer).length;
      if (answerKeys.length === 0) {
        return reply.code(409).send({
          data: null,
          error: { code: "unverified_answers", message: "No answer key has been generated for this assignment yet." },
        });
      }
      if (verifiedCount < answerKeys.length) {
        return reply.code(409).send({
          data: null,
          error: {
            code: "unverified_answers",
            message: `${answerKeys.length - verifiedCount} of ${answerKeys.length} answer(s) haven't been reviewed yet.`,
          },
        });
      }
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "published", publishedAt: new Date() },
    });

    const [recipients, teacher, school, section] = await Promise.all([
      studentRecipientsForClass(assignment.classSectionId),
      prisma.appUser.findUnique({ where: { id: assignment.teacherUserId }, select: { fullName: true } }),
      prisma.school.findUnique({ where: { id: assignment.schoolId }, select: { name: true } }),
      prisma.classSection.findUnique({ where: { id: assignment.classSectionId }, select: { className: true, sectionName: true } }),
    ]);
    const questionCount = Array.isArray(assignment.questions) ? assignment.questions.length : undefined;
    sendEmailsInBackground(
      recipients.map((r) => ({
        to: r.email,
        email: assignmentPublishedEmail({
          studentName: r.fullName,
          title: assignment.title,
          teacherName: teacher?.fullName,
          className: section ? classLabel(section.className, section.sectionName) : undefined,
          questionCount,
          schoolName: school?.name,
        }),
      }))
    );

    return { data: updated, meta: {} };
    }
  );

  // ---------------------------------------------------------------------------
  // "Generate assignment with AI" flow (from a topic)
  // ---------------------------------------------------------------------------

  // Populates the AI setup wizard: the objectives it can target, and whether
  // the topic has anything to ground on at all.
  app.get<{ Params: { id: string } }>(
    "/topics/:id/assignment-draft/options",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const topic = await prisma.topic.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: {
          classSection: true,
          contextSources: true,
          generations: { orderBy: { generatedAt: "desc" } },
        },
      });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const taught = buildTaughtContentText(topic.generations);
      const hasGenerations = topic.generations.some((g) => g.generationStatus === "succeeded");
      const hasContextSources = topic.contextSources.some(
        (s) => s.extractionStatus === "extracted" && !!s.extractedText
      );

      return {
        data: {
          objectives: taught.objectives,
          hasGenerations,
          hasContextSources,
          classSection: { className: topic.classSection.className, sectionName: topic.classSection.sectionName },
        },
        meta: {},
      };
    }
  );

  // Generates questions + model answers and persists them as a draft
  // Assignment (+ AnswerKey rows) straight away - the review screen then edits
  // that draft in place.
  app.post<{ Params: { id: string }; Body: CreateAssignmentDraftBody }>(
    "/topics/:id/assignment-draft",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateAssignmentDraftBody);
      const questionCount = Math.max(1, Math.min(20, Math.round(Number(body.questionCount)) || 0));
      if (!questionCount) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "questionCount (1-20) is required" },
        });
      }
      if (body.questionTypes?.some((t) => !VALID_QUESTION_TYPES.includes(t))) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `questionTypes must only contain: ${VALID_QUESTION_TYPES.join(", ")}` },
        });
      }
      const questionTypes = (body.questionTypes ?? []) as AssignmentQuestionType[];
      const difficultyMix: DifficultyMix = {
        easy: Math.max(0, Math.round(Number(body.difficultyMix?.easy)) || 0),
        medium: Math.max(0, Math.round(Number(body.difficultyMix?.medium)) || 0),
        hard: Math.max(0, Math.round(Number(body.difficultyMix?.hard)) || 0),
      };
      const difficultyTotal = difficultyMix.easy + difficultyMix.medium + difficultyMix.hard;
      if (difficultyTotal === 0) {
        difficultyMix.medium = questionCount;
      } else if (difficultyTotal !== questionCount) {
        // The split is a breakdown OF the total, not a separate number - a
        // client that lets these drift apart (e.g. changing question count
        // without rescaling the mix) is a bug on its end, not something to
        // silently paper over here.
        return reply.code(400).send({
          data: null,
          error: {
            code: "validation_error",
            message: `difficultyMix (easy + medium + hard = ${difficultyTotal}) must sum to questionCount (${questionCount})`,
          },
        });
      }
      const objectives = Array.isArray(body.objectives)
        ? body.objectives.map((o) => String(o).trim()).filter(Boolean).slice(0, 20)
        : [];
      const focusPrompt = body.focusPrompt?.trim() || null;

      const topic = await prisma.topic.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
        include: {
          classSection: true,
          contextSources: true,
          generations: { orderBy: { generatedAt: "desc" } },
        },
      });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const taught = buildTaughtContentText(topic.generations);
      const taughtContent = taught.text || buildContextSourceText(topic.contextSources);
      if (!taughtContent) {
        return reply.code(422).send({
          data: null,
          error: {
            code: "no_taught_content",
            message: "Generate a lesson (or add context sources) for this topic first so the AI knows what was taught.",
          },
        });
      }

      const formatTemplate = await prisma.schoolFormatTemplate.findUnique({
        where: { schoolId_appliesTo: { schoolId: request.schoolId, appliesTo: "generation" } },
      });

      const genInput: AssignmentGenInput = {
        taughtContent,
        objectives: objectives.length > 0 ? objectives : taught.objectives,
        questionCount,
        difficultyMix,
        questionTypes,
        focusPrompt,
        subject: topic.subject,
        board: await getSchoolBoard(request.schoolId),
        classLabel: `${topic.classSection.className} ${topic.classSection.sectionName}`,
        schoolFormatInstructions: formatTemplate?.templateBody ?? null,
      };

      if (!(await hasSufficientCredits(request.user.sub, await getFeatureCost("assignment_generation")))) {
        return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to generate this assignment" } });
      }

      const start = Date.now();
      const { questions: generated, model } = await aiProvider.generateAssignmentFromTopic(genInput);
      if (generated.length === 0) {
        return reply.code(502).send({
          data: null,
          error: { code: "generation_failed", message: "The AI did not return any usable questions. Try again." },
        });
      }

      const storedQuestions = generated.map((q, i) => toStoredQuestion(q, `q${i + 1}`));
      const aiGenParams: StoredAiGenParams = { questionCount, difficultyMix, objectives, questionTypes, focusPrompt, topicIds: [topic.id] };

      const assignment = await prisma.assignment.create({
        data: {
          schoolId: request.schoolId,
          topicId: topic.id,
          teacherUserId: request.user.sub,
          classSectionId: topic.classSectionId,
          title: `${topic.name} - Assignment`,
          questions: storedQuestions as unknown as Prisma.InputJsonValue,
          aiGenParams: aiGenParams as unknown as Prisma.InputJsonValue,
          personalisationEnabled: false,
          status: "draft",
        },
      });

      await prisma.answerKey.createMany({
        data: generated.map((q, i) => ({
          assignmentId: assignment.id,
          questionId: `q${i + 1}`,
          questionIndex: i,
          aiAnswer: q.modelAnswer,
        })),
      });

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "assignment_generation",
        model,
        durationMs: Date.now() - start,
      });

      return reply.code(201).send({ data: assignment, meta: {} });
    }
  );

  // Same idea as /topics/:id/assignment-draft above, but reachable from the
  // Assignment tab directly (not from inside a specific topic) - lets a
  // teacher build one assignment spanning several topics in a class, e.g. a
  // revision assignment covering everything taught this term. A single
  // topicId behaves exactly like the topic-scoped route (and keeps
  // Assignment.topicId set, so regenerate-a-question and everything else
  // that assumes one topic still works unmodified); more than one leaves
  // topicId null and relies on aiGenParams.topicIds instead.
  app.post<{ Params: { id: string }; Body: CreateMultiTopicAssignmentDraftBody }>(
    "/class-sections/:id/assignment-draft",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateMultiTopicAssignmentDraftBody);
      const topicIds = [...new Set(Array.isArray(body.topicIds) ? body.topicIds.filter((id) => typeof id === "string" && id) : [])];
      if (topicIds.length === 0) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "At least one topicId is required" } });
      }
      if (topicIds.length > 10) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Pick at most 10 topics for one assignment" } });
      }

      const questionCount = Math.max(1, Math.min(20, Math.round(Number(body.questionCount)) || 0));
      if (!questionCount) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "questionCount (1-20) is required" } });
      }
      if (body.questionTypes?.some((t) => !VALID_QUESTION_TYPES.includes(t))) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `questionTypes must only contain: ${VALID_QUESTION_TYPES.join(", ")}` },
        });
      }
      const questionTypes = (body.questionTypes ?? []) as AssignmentQuestionType[];
      const difficultyMix: DifficultyMix = {
        easy: Math.max(0, Math.round(Number(body.difficultyMix?.easy)) || 0),
        medium: Math.max(0, Math.round(Number(body.difficultyMix?.medium)) || 0),
        hard: Math.max(0, Math.round(Number(body.difficultyMix?.hard)) || 0),
      };
      const difficultyTotal = difficultyMix.easy + difficultyMix.medium + difficultyMix.hard;
      if (difficultyTotal === 0) {
        difficultyMix.medium = questionCount;
      } else if (difficultyTotal !== questionCount) {
        return reply.code(400).send({
          data: null,
          error: {
            code: "validation_error",
            message: `difficultyMix (easy + medium + hard = ${difficultyTotal}) must sum to questionCount (${questionCount})`,
          },
        });
      }
      const requestedObjectives = Array.isArray(body.objectives)
        ? body.objectives.map((o) => String(o).trim()).filter(Boolean).slice(0, 20)
        : [];
      const focusPrompt = body.focusPrompt?.trim() || null;

      const classSection = await prisma.classSection.findFirst({
        where: { id: request.params.id, academicYear: { schoolId: request.schoolId } },
      });
      if (!classSection) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
      }

      const topics = await prisma.topic.findMany({
        where: { id: { in: topicIds }, schoolId: request.schoolId, classSectionId: classSection.id },
        include: { contextSources: true, generations: { orderBy: { generatedAt: "desc" } } },
      });
      if (topics.length !== topicIds.length) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "One or more topics weren't found in this class" } });
      }

      // Each topic's own content, clearly separated - the model reads this as
      // several distinct sections, not one topic's material stretched thin.
      const taughtBlocks: string[] = [];
      const mergedObjectives: string[] = [];
      const seenObjective = new Set<string>();
      for (const topic of topics) {
        const taught = buildTaughtContentText(topic.generations);
        const topicText = taught.text || buildContextSourceText(topic.contextSources);
        if (topicText) taughtBlocks.push(`## ${topic.name}\n${topicText}`);
        for (const o of taught.objectives) {
          const key = o.trim().toLowerCase();
          if (!key || seenObjective.has(key)) continue;
          seenObjective.add(key);
          mergedObjectives.push(o.trim());
        }
      }
      const taughtContent = taughtBlocks.join("\n\n");
      if (!taughtContent) {
        return reply.code(422).send({
          data: null,
          error: {
            code: "no_taught_content",
            message: "None of the selected topics have a lesson generated (or context sources) yet, so there's nothing for the AI to base questions on.",
          },
        });
      }

      const formatTemplate = await prisma.schoolFormatTemplate.findUnique({
        where: { schoolId_appliesTo: { schoolId: request.schoolId, appliesTo: "generation" } },
      });

      const genInput: AssignmentGenInput = {
        taughtContent,
        objectives: requestedObjectives.length > 0 ? requestedObjectives : mergedObjectives,
        questionCount,
        difficultyMix,
        questionTypes,
        focusPrompt,
        subject: [...new Set(topics.map((t) => t.subject))].join(" & "),
        board: await getSchoolBoard(request.schoolId),
        classLabel: `${classSection.className} ${classSection.sectionName}`,
        schoolFormatInstructions: formatTemplate?.templateBody ?? null,
      };

      if (!(await hasSufficientCredits(request.user.sub, await getFeatureCost("assignment_generation")))) {
        return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to generate this assignment" } });
      }

      const start = Date.now();
      const { questions: generated, model } = await aiProvider.generateAssignmentFromTopic(genInput);
      if (generated.length === 0) {
        return reply.code(502).send({
          data: null,
          error: { code: "generation_failed", message: "The AI did not return any usable questions. Try again." },
        });
      }

      const storedQuestions = generated.map((q, i) => toStoredQuestion(q, `q${i + 1}`));
      const aiGenParams: StoredAiGenParams = {
        questionCount,
        difficultyMix,
        objectives: requestedObjectives,
        questionTypes,
        focusPrompt,
        topicIds,
      };
      const title =
        topics.length === 1
          ? `${topics[0].name} - Assignment`
          : `${topics.map((t) => t.name).join(", ")} - Assignment`.slice(0, 100);

      const assignment = await prisma.assignment.create({
        data: {
          schoolId: request.schoolId,
          topicId: topics.length === 1 ? topics[0].id : null,
          teacherUserId: request.user.sub,
          classSectionId: classSection.id,
          title,
          questions: storedQuestions as unknown as Prisma.InputJsonValue,
          aiGenParams: aiGenParams as unknown as Prisma.InputJsonValue,
          personalisationEnabled: false,
          status: "draft",
        },
      });

      await prisma.answerKey.createMany({
        data: generated.map((q, i) => ({
          assignmentId: assignment.id,
          questionId: `q${i + 1}`,
          questionIndex: i,
          aiAnswer: q.modelAnswer,
        })),
      });

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "assignment_generation",
        model,
        durationMs: Date.now() - start,
      });

      return reply.code(201).send({ data: assignment, meta: {} });
    }
  );

  // Redrafts a single question (and its model answer) against the same taught
  // content, keeping the question's id so the answer key stays aligned.
  app.post<{ Params: { id: string; questionId: string }; Body: RegenerateQuestionBody }>(
    "/assignments/:id/questions/:questionId/regenerate",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as RegenerateQuestionBody);
      const assignment = await prisma.assignment.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });
      if (!assignment) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Assignment not found" } });
      }
      if (assignment.status !== "draft") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Only a draft assignment can be edited - unpublish it first" },
        });
      }
      const stored = (assignment.aiGenParams as unknown as StoredAiGenParams | null) ?? null;
      // A single-topic assignment (Assignment.topicId set) or a "mix of
      // topics" one (topicId null, sources in aiGenParams.topicIds instead -
      // see /class-sections/:id/assignment-draft) - either way, gather every
      // source topic's content the same way.
      const topicIds = assignment.topicId ? [assignment.topicId] : stored?.topicIds ?? [];
      if (topicIds.length === 0) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "Regenerate is only available for AI-generated assignments" },
        });
      }

      const questions = (assignment.questions as unknown as {
        id: string;
        prompt: string;
        difficulty?: string;
        type?: string;
      }[]) ?? [];
      const targetIndex = questions.findIndex((q) => q.id === request.params.questionId);
      if (targetIndex === -1) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Question not found" } });
      }
      const target = questions[targetIndex];

      const classSection = await prisma.classSection.findFirst({ where: { id: assignment.classSectionId, academicYear: { schoolId: request.schoolId } } });
      const topics = await prisma.topic.findMany({
        where: { id: { in: topicIds }, schoolId: request.schoolId },
        include: { contextSources: true, generations: { orderBy: { generatedAt: "desc" } } },
      });
      if (!classSection || topics.length === 0) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const taughtBlocks: string[] = [];
      const mergedObjectives: string[] = [];
      const seenObjective = new Set<string>();
      for (const topic of topics) {
        const taught = buildTaughtContentText(topic.generations);
        const topicText = taught.text || buildContextSourceText(topic.contextSources);
        if (topicText) taughtBlocks.push(topics.length > 1 ? `## ${topic.name}\n${topicText}` : topicText);
        for (const o of taught.objectives) {
          const key = o.trim().toLowerCase();
          if (!key || seenObjective.has(key)) continue;
          seenObjective.add(key);
          mergedObjectives.push(o.trim());
        }
      }

      const formatTemplate = await prisma.schoolFormatTemplate.findUnique({
        where: { schoolId_appliesTo: { schoolId: request.schoolId, appliesTo: "generation" } },
      });

      const genInput: AssignmentGenInput = {
        taughtContent: taughtBlocks.join("\n\n"),
        objectives: stored?.objectives?.length ? stored.objectives : mergedObjectives,
        questionCount: 1,
        difficultyMix: mixFromDifficulty(target.difficulty ?? "medium"),
        // Regenerate as the same format the question already had.
        questionTypes: VALID_QUESTION_TYPES.includes(target.type ?? "") ? [target.type as AssignmentQuestionType] : ["short_answer"],
        focusPrompt: [stored?.focusPrompt ?? null, body.instruction?.trim() || null].filter(Boolean).join("\n") || null,
        subject: [...new Set(topics.map((t) => t.subject))].join(" & "),
        board: await getSchoolBoard(request.schoolId),
        classLabel: `${classSection.className} ${classSection.sectionName}`,
        schoolFormatInstructions: formatTemplate?.templateBody ?? null,
      };

      if (!(await hasSufficientCredits(request.user.sub, await getFeatureCost("assignment_generation")))) {
        return reply.code(400).send({ data: null, error: { code: "insufficient_credits", message: "Not enough credits to regenerate this question" } });
      }

      const start = Date.now();
      const { questions: generated, model } = await aiProvider.generateAssignmentFromTopic(genInput);
      const replacement = generated[0];
      if (!replacement) {
        return reply.code(502).send({
          data: null,
          error: { code: "generation_failed", message: "The AI did not return a replacement question. Try again." },
        });
      }

      questions[targetIndex] = toStoredQuestion(replacement, target.id) as unknown as (typeof questions)[number];

      const [updated] = await prisma.$transaction([
        prisma.assignment.update({
          where: { id: assignment.id },
          data: { questions: questions as unknown as Prisma.InputJsonValue },
        }),
        prisma.answerKey.upsert({
          where: { assignmentId_questionId: { assignmentId: assignment.id, questionId: target.id } },
          create: {
            assignmentId: assignment.id,
            questionId: target.id,
            questionIndex: targetIndex,
            aiAnswer: replacement.modelAnswer,
          },
          update: { aiAnswer: replacement.modelAnswer, teacherVerifiedAnswer: null, questionIndex: targetIndex },
        }),
      ]);

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "assignment_generation",
        model,
        durationMs: Date.now() - start,
      });

      return { data: updated, meta: {} };
    }
  );
}
