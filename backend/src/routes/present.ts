import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { publish } from "../lib/realtime";

interface StoredAssessmentQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];
const PRESENT_CODE_LIFETIME_MS = 4 * 60 * 60 * 1000; // 4 hours - well past any single lesson.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L - read out loud or typed on a TV remote.

// The code on the projector is public to everyone in the room, so it only lets a
// device WATCH. Everything that changes the session (advance, reveal, end,
// recording answers, the identified roster view) also needs the control key,
// which only the teacher's own device receives when the session starts.
function generateControlKey(): string {
  return crypto.randomBytes(18).toString("base64url");
}

function hasControlKey(stored: string | null, provided: unknown): boolean {
  if (!stored || typeof provided !== "string" || provided.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(provided));
}

function presentKeyFrom(request: { headers: Record<string, unknown> }): string | undefined {
  const header = request.headers["x-present-key"];
  return typeof header === "string" ? header : undefined;
}

const controlForbidden = {
  data: null,
  error: { code: "control_key_required", message: "Open the control link from the teacher app to control this session" },
};

// Public endpoints need their own limits - there is no login to key them on.
const publicLimit = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
const controlLimit = { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } };

function generateCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

async function findByCode(code: string) {
  return prisma.assessment.findFirst({
    where: { presentCode: code, presentCodeExpiresAt: { gt: new Date() } },
    include: { responses: true },
  });
}

// Two separate rooms per assessment, not one - Display and Control must never
// receive the same broadcast payload (see displayState() vs controlState()
// below), so they're never even in the same room to begin with.
function controlRoom(assessmentId: string) {
  return `assessment:${assessmentId}:control`;
}
function displayRoom(assessmentId: string) {
  return `assessment:${assessmentId}:display`;
}

// Everything the Control page needs: full roster identity plus exactly what
// each student chose, so the teacher can tap on their behalf and see who's
// answered what. Never sent to the projector/Display room.
function controlState(assessment: NonNullable<Awaited<ReturnType<typeof findByCode>>>, roster: { id: string; fullName: string; seatNumber: number | null }[]) {
  return {
    assessmentId: assessment.id,
    title: assessment.title,
    status: assessment.status,
    questions: assessment.questions as unknown as StoredAssessmentQuestion[],
    currentQuestionIndex: assessment.currentQuestionIndex,
    currentQuestionRevealed: assessment.currentQuestionRevealed,
    responses: assessment.responses.map((r) => ({
      questionId: r.questionId,
      studentStubId: r.studentStubId,
      selectedOptionIndex: r.selectedOptionIndex,
      isCorrect: r.isCorrect,
      isDoubt: r.isDoubt,
    })),
    roster: roster.map((s) => ({ studentStubId: s.id, fullName: s.fullName, seatNumber: s.seatNumber })),
  };
}

// What the projector/classroom screen gets: aggregate counts for the current
// question and a per-seat "answered" flag - never a name, never which option
// a student picked. This is a real payload-level guarantee, not just a UI
// choice the Display page happens to make (see client's Step 6: "responses
// are anonymous on the screen").
function displayState(assessment: NonNullable<Awaited<ReturnType<typeof findByCode>>>, roster: { id: string; fullName: string; seatNumber: number | null }[]) {
  const questions = assessment.questions as unknown as StoredAssessmentQuestion[];
  const currentQuestion = questions[assessment.currentQuestionIndex];
  const currentResponses = currentQuestion ? assessment.responses.filter((r) => r.questionId === currentQuestion.id) : [];
  const answeredIds = new Set(currentResponses.map((r) => r.studentStubId));

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    status: assessment.status,
    questions,
    currentQuestionIndex: assessment.currentQuestionIndex,
    currentQuestionRevealed: assessment.currentQuestionRevealed,
    totalStudents: roster.length,
    answeredCount: currentResponses.length,
    counts: {
      correct: currentResponses.filter((r) => r.isCorrect).length,
      incorrect: currentResponses.filter((r) => !r.isDoubt && r.isCorrect === false).length,
      doubt: currentResponses.filter((r) => r.isDoubt).length,
    },
    seats: roster.map((s) => ({ seatNumber: s.seatNumber, answered: answeredIds.has(s.id) })),
  };
}

// Recomputes and broadcasts both rooms' states after any change - both pages
// must always redraw from the same source of truth, over the room each is
// actually allowed to see.
async function broadcast(assessmentId: string, code: string) {
  const assessment = await findByCode(code);
  if (!assessment) return;
  const roster = await loadRoster(assessment.classSectionId);
  publish([controlRoom(assessmentId)], { type: "present_state", state: controlState(assessment, roster) });
  publish([displayRoom(assessmentId)], { type: "present_state", state: displayState(assessment, roster) });
}

async function loadRoster(classSectionId: string) {
  return prisma.studentStub.findMany({
    where: { classSectionId, status: "active" },
    select: { id: true, fullName: true, seatNumber: true },
    orderBy: [{ seatNumber: "asc" }, { fullName: "asc" }],
  });
}

export async function presentRoutes(app: FastifyInstance) {
  // Starts (or restarts) presenting this quick check on a screen. One active
  // code per assessment - calling this again invalidates whatever device
  // still has the old link/tab open, which is intentional (see present.ts
  // plan: "one code at a time").
  app.post<{ Params: { id: string } }>("/assessments/:id/present-session", { onRequest: scoped(app) }, async (request, reply) => {
    const assessment = await prisma.assessment.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Quick check not found" } });
    }

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const collision = await prisma.assessment.findUnique({ where: { presentCode: candidate } });
      if (!collision) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return reply.code(500).send({ data: null, error: { code: "code_generation_failed", message: "Could not generate a session code, try again" } });
    }

    const expiresAt = new Date(Date.now() + PRESENT_CODE_LIFETIME_MS);
    const controlKey = generateControlKey();
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { presentCode: code, presentCodeExpiresAt: expiresAt, presentControlKey: controlKey, currentQuestionIndex: 0, currentQuestionRevealed: false },
    });

    return reply.code(201).send({ data: { code, controlKey, expiresAt }, meta: {} });
  });

  // Everything below is reached only by knowing the code - no login on the
  // classroom device. Same trust model as ClassSection.joinCode.
  //
  // role=control is the teacher's own tapping device; anything else (absent,
  // "display", or unrecognized) gets the safe/anonymous shape - safe-by-
  // default, so a caller has to explicitly ask for the identified view.
  app.get<{ Params: { code: string }; Querystring: { role?: string } }>("/present/:code", publicLimit, async (request, reply) => {
    const assessment = await findByCode(request.params.code);
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "This session code is invalid or has expired" } });
    }
    const wantsControl = request.query?.role === "control";
    if (wantsControl && !hasControlKey(assessment.presentControlKey, presentKeyFrom(request))) {
      return reply.code(403).send(controlForbidden);
    }
    const roster = await loadRoster(assessment.classSectionId);
    const state = wantsControl ? controlState(assessment, roster) : displayState(assessment, roster);
    return { data: state, meta: {} };
  });

  app.post<{ Params: { code: string }; Body: { questionId: string; studentStubId: string; selectedOptionIndex?: number; isDoubt?: boolean } }>(
    "/present/:code/responses",
    controlLimit,
    async (request, reply) => {
      const assessment = await findByCode(request.params.code);
      if (!assessment) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "This session code is invalid or has expired" } });
      }
      if (!hasControlKey(assessment.presentControlKey, presentKeyFrom(request))) return reply.code(403).send(controlForbidden);
      const body = request.body ?? ({} as { questionId: string; studentStubId: string; selectedOptionIndex?: number; isDoubt?: boolean });
      const questions = assessment.questions as unknown as StoredAssessmentQuestion[];
      const question = questions.find((q) => q.id === body.questionId);
      const hasOption = typeof body.selectedOptionIndex === "number";
      if (!question || !body.studentStubId || hasOption === !!body.isDoubt) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "questionId, studentStubId, and exactly one of selectedOptionIndex or isDoubt are required" },
        });
      }
      const student = await prisma.studentStub.findFirst({ where: { id: body.studentStubId, classSectionId: assessment.classSectionId } });
      if (!student) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "That student is not in this class" } });
      }

      const data = body.isDoubt
        ? { selectedOptionIndex: null, isCorrect: null, isDoubt: true }
        : { selectedOptionIndex: body.selectedOptionIndex, isCorrect: body.selectedOptionIndex === question.correctOptionIndex, isDoubt: false };
      await prisma.assessmentResponse.upsert({
        where: { assessmentId_questionId_studentStubId: { assessmentId: assessment.id, questionId: question.id, studentStubId: body.studentStubId } },
        create: { assessmentId: assessment.id, questionId: question.id, studentStubId: body.studentStubId, ...data },
        update: data,
      });

      await broadcast(assessment.id, request.params.code);
      const roster = await loadRoster(assessment.classSectionId);
      return { data: controlState((await findByCode(request.params.code))!, roster), meta: {} };
    }
  );

  app.post<{ Params: { code: string }; Body: { direction: "next" | "prev" } }>("/present/:code/advance", controlLimit, async (request, reply) => {
    const assessment = await findByCode(request.params.code);
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "This session code is invalid or has expired" } });
    }
    if (!hasControlKey(assessment.presentControlKey, presentKeyFrom(request))) return reply.code(403).send(controlForbidden);
    const questions = assessment.questions as unknown as StoredAssessmentQuestion[];
    const direction = request.body?.direction === "prev" ? -1 : 1;
    const nextIndex = Math.max(0, Math.min(questions.length - 1, assessment.currentQuestionIndex + direction));

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { currentQuestionIndex: nextIndex, currentQuestionRevealed: false },
    });

    await broadcast(assessment.id, request.params.code);
    const roster = await loadRoster(assessment.classSectionId);
    return { data: controlState((await findByCode(request.params.code))!, roster), meta: {} };
  });

  app.post<{ Params: { code: string } }>("/present/:code/reveal", controlLimit, async (request, reply) => {
    const assessment = await findByCode(request.params.code);
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "This session code is invalid or has expired" } });
    }
    if (!hasControlKey(assessment.presentControlKey, presentKeyFrom(request))) return reply.code(403).send(controlForbidden);

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { currentQuestionRevealed: !assessment.currentQuestionRevealed },
    });

    await broadcast(assessment.id, request.params.code);
    const roster = await loadRoster(assessment.classSectionId);
    return { data: controlState((await findByCode(request.params.code))!, roster), meta: {} };
  });

  app.post<{ Params: { code: string } }>("/present/:code/end", controlLimit, async (request, reply) => {
    const assessment = await findByCode(request.params.code);
    if (!assessment) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "This session code is invalid or has expired" } });
    }
    if (!hasControlKey(assessment.presentControlKey, presentKeyFrom(request))) return reply.code(403).send(controlForbidden);

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: "completed", completedAt: new Date(), presentCode: null, presentCodeExpiresAt: null, presentControlKey: null },
    });

    publish([controlRoom(assessment.id), displayRoom(assessment.id)], { type: "present_ended", assessmentId: assessment.id });
    return { data: { ended: true }, meta: {} };
  });
}
