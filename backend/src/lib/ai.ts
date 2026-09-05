import { prisma } from "./prisma";
import { storage } from "./storage";
import { MAX_EXTRACTED_CHARS } from "./extraction";

export const MODEL_SONNET = "claude-sonnet";
export const MODEL_HAIKU = "claude-haiku";
export const MODEL_GEMINI_FLASH = "gemini-2.5-flash";

export type GenerationOutputType =
  | "lesson_plan"
  | "custom_activity_report"
  | "flashcards"
  | "presentation";

export interface LessonPlanContent {
  type: "lesson_plan";
  overview: string;
  durationMinutes: number;
  objectives: string[];
  lessonFlow: { label: string; durationMinutes: number }[];
  activities: { title: string; description: string; durationMinutes: number; materials: string[] }[];
  assessment: string;
}

export interface CustomActivityContent {
  type: "custom_activity_report";
  objective: string;
  activities: { title: string; description: string; durationMinutes: number; materials: string[] }[];
  reportFormat: string;
}

export interface FlashcardsContent {
  type: "flashcards";
  cards: { front: string; back: string }[];
}

export interface PresentationContent {
  type: "presentation";
  slides: { title: string; bullets: string[] }[];
}

export type StructuredGenerationContent =
  | LessonPlanContent
  | CustomActivityContent
  | FlashcardsContent
  | PresentationContent;

export interface GenerationInput {
  topicName: string;
  subject: string;
  board: string;
  outputType: GenerationOutputType;
  classCount: number;
  minutesPerClass: number;
  language: string;
  customPrompt?: string | null;
  classLabel?: string;
  contextText?: string | null;
  schoolFormatInstructions?: string | null;
}

export interface AnswerKeyQuestionInput {
  id: string;
  index: number;
  prompt: string;
  marks: number;
}

export type AssignmentQuestionType = "short_answer" | "mcq";

export interface AssignmentGenInput {
  // Plain-text summary of what was taught for this topic (assembled from the
  // topic's lesson generations, or its context sources as a fallback).
  taughtContent: string;
  objectives: string[];
  questionCount: number;
  difficultyMix: { easy: number; medium: number; hard: number };
  // "mixed" lets the model choose per question; the others force one type.
  questionTypes: "short_answer" | "mcq" | "mixed";
  focusPrompt: string | null;
  subject: string;
  board: string;
  classLabel: string;
  schoolFormatInstructions: string | null;
}

export interface GeneratedAssignmentQuestion {
  prompt: string;
  type: AssignmentQuestionType;
  difficulty: "easy" | "medium" | "hard";
  // Present only when type === "mcq": 3-5 options, exactly one correct.
  options?: string[];
  correctOptionIndex?: number;
  // The model answer (for mcq, the correct option's text). Seeds the answer key.
  modelAnswer: string;
}

export interface OcrInput {
  fileLocation: string;
  // When provided, the OCR pass tries to segment the transcribed text per
  // question instead of returning one blob for the whole photo - lets a
  // single photo of a multi-question worksheet be graded question-by-
  // question instead of every question seeing the same undifferentiated
  // text. Only honoured by GeminiAiProvider; the stub has no way to segment.
  questions?: { id: string; prompt: string }[];
}

export interface LessonPlanInput {
  topic: string;
  board: string;
  format: string;
  classLabel?: string;
}

export interface ResearchReportInput {
  topic: string;
  board: string;
}

export interface PersonalisationInput {
  studentName: string;
  avgScore: number | null;
  submissionCount: number;
  // The assignment's actual question count - the suggested mix's counts
  // should sum to roughly this, not a fixed number, so every question in
  // the assignment can plausibly appear in some student's delivered subset.
  questionCount: number;
}

// Scales a difficulty ratio (e.g. {easy:2, medium:2, hard:1}) up/down to sum
// to the assignment's actual question count, rounding drift absorbed by the
// medium bucket so the total always matches exactly.
function scaleMixToQuestionCount(base: Record<string, number>, questionCount: number): Record<string, number> {
  const baseTotal = base.easy + base.medium + base.hard;
  if (baseTotal <= 0 || questionCount <= 0) {
    return { easy: 0, medium: Math.max(0, questionCount), hard: 0 };
  }
  const scaled = {
    easy: Math.round((base.easy / baseTotal) * questionCount),
    medium: Math.round((base.medium / baseTotal) * questionCount),
    hard: Math.round((base.hard / baseTotal) * questionCount),
  };
  const drift = questionCount - (scaled.easy + scaled.medium + scaled.hard);
  scaled.medium = Math.max(0, scaled.medium + drift);
  return scaled;
}

// Expands a difficulty mix into a flat list of difficulty labels, one per
// question, padded/truncated to exactly questionCount (drift lands on medium).
export function expandDifficultyMix(
  mix: { easy: number; medium: number; hard: number },
  questionCount: number
): ("easy" | "medium" | "hard")[] {
  const scaled = scaleMixToQuestionCount(
    { easy: Math.max(0, mix.easy), medium: Math.max(0, mix.medium), hard: Math.max(0, mix.hard) },
    questionCount
  );
  const out: ("easy" | "medium" | "hard")[] = [
    ...Array<"easy">(scaled.easy).fill("easy"),
    ...Array<"medium">(scaled.medium).fill("medium"),
    ...Array<"hard">(scaled.hard).fill("hard"),
  ];
  while (out.length < questionCount) out.push("medium");
  return out.slice(0, questionCount);
}

function normaliseOption(value: string): string {
  // Drop a leading "A) " / "A. " / "A - " style label so "B) 42" matches "42".
  return value
    .trim()
    .replace(/^[A-Za-z][).\-:]\s+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Settles every multiple-choice question deterministically (exact option
// match) so they never reach the grading model, and returns the remaining
// short-answer questions for the model / heuristic to grade.
export function settleMcqQuestions(
  questions: GradingQuestion[],
  answers: Record<string, string>,
  answerKey?: AnswerKeyContext[]
): { mcqDetails: QuestionGradeDetail[]; shortAnswerQuestions: GradingQuestion[] } {
  const marksById = new Map((answerKey ?? []).map((k) => [k.questionId, k.marks]));
  const mcqDetails: QuestionGradeDetail[] = [];
  const shortAnswerQuestions: GradingQuestion[] = [];

  for (const q of questions) {
    const isMcq =
      q.type === "mcq" &&
      Array.isArray(q.options) &&
      q.options.length > 0 &&
      typeof q.correctOptionIndex === "number" &&
      q.correctOptionIndex >= 0 &&
      q.correctOptionIndex < q.options.length;

    if (!isMcq) {
      shortAnswerQuestions.push(q);
      continue;
    }

    const correctText = String(q.options![q.correctOptionIndex!] ?? "");
    const given = (answers[q.id] ?? "").trim();
    const answered = given.length > 0;
    const correct = answered && normaliseOption(given) === normaliseOption(correctText);
    const marks = marksById.get(q.id) ?? 1;

    mcqDetails.push({
      questionId: q.id,
      correct: answered ? correct : false,
      marksAwarded: correct ? marks : 0,
      note: !answered
        ? "No option selected."
        : correct
        ? "Correct option selected."
        : `Incorrect option selected ("${given}").`,
    });
  }

  return { mcqDetails, shortAnswerQuestions };
}

// Offline fallback for generateAssignmentFromTopic: builds plausible-shaped
// questions from the selected objectives (or generic prompts) so the flow
// still produces an editable draft when no model is configured or the model
// response is unusable. Answers are always flagged for teacher review.
export function heuristicAssignmentQuestions(input: AssignmentGenInput): GeneratedAssignmentQuestion[] {
  const count = Math.max(1, Math.min(20, Math.round(input.questionCount) || 1));
  const difficulties = expandDifficultyMix(input.difficultyMix, count);
  const seeds =
    input.objectives.length > 0
      ? input.objectives
      : [`the key ideas of ${input.subject}`, `applying ${input.subject} to an example`, `a common mistake in ${input.subject}`];

  return Array.from({ length: count }, (_, i) => {
    const seed = seeds[i % seeds.length];
    const wantMcq = input.questionTypes === "mcq" || (input.questionTypes === "mixed" && i % 2 === 1);
    const difficulty = difficulties[i];

    if (wantMcq) {
      const options = ["Option A", "Option B", "Option C", "Option D"];
      return {
        prompt: `Which statement best relates to ${seed}?`,
        type: "mcq" as const,
        difficulty,
        options,
        correctOptionIndex: 0,
        modelAnswer: `${options[0]} — teacher review required.`,
      };
    }

    return {
      prompt: `Explain ${seed}. Give an example in your answer.`,
      type: "short_answer" as const,
      difficulty,
      modelAnswer: `Draft model answer covering ${seed}. Teacher review required before use.`,
    };
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Cleans a model's raw question rows into well-formed GeneratedAssignmentQuestion
// objects: enforces the requested type mode, valid options + correct index for
// MCQ, a difficulty per the requested order, and a non-empty model answer.
export function normaliseGeneratedQuestions(
  rows: any[],
  difficultyByIndex: ("easy" | "medium" | "hard")[],
  mode: "short_answer" | "mcq" | "mixed"
): GeneratedAssignmentQuestion[] {
  const out: GeneratedAssignmentQuestion[] = [];
  rows.forEach((row, i) => {
    const prompt = typeof row?.prompt === "string" ? row.prompt.trim() : "";
    if (!prompt) return;

    const difficulty = difficultyByIndex[i] ?? "medium";
    const rawOptions = Array.isArray(row?.options)
      ? row.options.map((o: any) => String(o ?? "").trim()).filter(Boolean)
      : [];
    const wantMcq =
      mode === "mcq" || (mode === "mixed" && row?.type === "mcq" && rawOptions.length >= 2);

    if (wantMcq && rawOptions.length >= 2) {
      const options = rawOptions.slice(0, 5);
      let correctOptionIndex = Number.isInteger(row?.correctOptionIndex) ? row.correctOptionIndex : 0;
      if (correctOptionIndex < 0 || correctOptionIndex >= options.length) {
        const byText = options.findIndex(
          (o: string) => o.toLowerCase() === String(row?.modelAnswer ?? "").trim().toLowerCase()
        );
        correctOptionIndex = byText >= 0 ? byText : 0;
      }
      out.push({
        prompt,
        type: "mcq",
        difficulty,
        options,
        correctOptionIndex,
        modelAnswer: String(row?.modelAnswer ?? "").trim() || options[correctOptionIndex],
      });
      return;
    }

    out.push({
      prompt,
      type: "short_answer",
      difficulty,
      modelAnswer: String(row?.modelAnswer ?? "").trim() || "Teacher review required before use.",
    });
  });
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Orders merged per-question grade details to match the assignment's question
// order, so the grading review screen and item analysis line up.
function orderQuestionDetails(
  questions: { id: string }[],
  details: QuestionGradeDetail[]
): QuestionGradeDetail[] {
  const byId = new Map(details.map((d) => [d.questionId, d]));
  return questions.map((q) => byId.get(q.id)).filter((d): d is QuestionGradeDetail => !!d);
}

export interface GradingQuestion {
  id: string;
  prompt: string;
  // Set for AI-generated multiple-choice questions - when present with
  // options, the question is settled by exact option match and never sent to
  // the model (see settleMcqQuestions).
  type?: string;
  options?: string[];
  correctOptionIndex?: number;
}

// A teacher-verified answer key entry, when one exists, is passed into
// grading so the grader has ground truth to compare against instead of
// judging an answer's plausibility in isolation.
export interface AnswerKeyContext {
  questionId: string;
  verifiedAnswer: string;
  marks: number;
}

export interface GradingInput {
  questions: GradingQuestion[];
  answers: Record<string, string>;
  answerKey?: AnswerKeyContext[];
}

// correct is null when the grader can't judge correctness at all (the
// offline completeness heuristic only measures whether/how much was
// written, never whether it's right) - callers must treat null as "unknown",
// not as "incorrect", when aggregating (see submissions.ts class-insight).
export interface QuestionGradeDetail {
  questionId: string;
  correct: boolean | null;
  marksAwarded: number | null;
  note: string;
}

export interface AiProvider {
  generateLessonPlan(input: LessonPlanInput): Promise<{ content: string; model: string }>;
  generateResearchReport(input: ResearchReportInput): Promise<{ content: string; model: string }>;
  generatePersonalisationSuggestion(
    input: PersonalisationInput
  ): Promise<{ suggestedMix: Record<string, number>; reasoning: string; model: string }>;
  gradeSubmission(input: GradingInput): Promise<{
    score: number;
    feedback: string;
    flagged: boolean;
    nextStep: string;
    model: string;
    questionDetails: QuestionGradeDetail[];
  }>;

  generateContent(input: GenerationInput): Promise<{ content: string; model: string }>;
  // Drafts a set of assignment questions AND their model answers in one pass,
  // grounded in the topic's taught content. Used by
  // POST /topics/:id/assignment-draft (backend/src/routes/assignments.ts).
  generateAssignmentFromTopic(
    input: AssignmentGenInput
  ): Promise<{ questions: GeneratedAssignmentQuestion[]; model: string }>;
  // Keyed by question id (not array position) - AnswerKey rows are id-keyed
  // so personalised delivery can hand different students a different
  // subset/order of the same assignment's questions (see lib/personalisation.ts).
  generateAnswerKey(questions: AnswerKeyQuestionInput[]): Promise<{ answers: Record<string, string>; model: string }>;
  extractTextFromPhoto(input: OcrInput): Promise<{ text: string; confidence: number; perQuestion?: Record<string, string> }>;
  // Used only by the Lesson Studio topic-context upload path: transcribes an
  // image AND describes any diagrams/figures, so the text can be stored once
  // and reused on every generation without re-sending the image to the model.
  describeImageForContext(input: OcrInput): Promise<{ text: string; model: string }>;
}

class StubAiProvider implements AiProvider {
  async generateLessonPlan({ topic, board, format, classLabel }: LessonPlanInput) {
    const audience = classLabel ? `${classLabel} students` : "students";
    const content =
      format === "learning_material"
        ? [
            `# ${topic} — Learning Material (${board})`,
            "",
            "## Key Concepts",
            `- What ${topic} is, and why it matters within the ${board} curriculum`,
            `- The core terms ${audience} need before moving to practice problems`,
            `- Common misconceptions about ${topic}`,
            "",
            "## Worked Example",
            `A step-by-step walkthrough of a typical ${topic} problem, annotated for ${audience}.`,
            "",
            "## Practice Prompts",
            `1. Define ${topic} in your own words.`,
            `2. Apply ${topic} to a real-world scenario relevant to your board's syllabus.`,
            `3. Explain one common mistake students make with ${topic} and how to avoid it.`,
          ].join("\n")
        : [
            `# Lesson Plan: ${topic}`,
            `**Board:** ${board}${classLabel ? `  |  **Class:** ${classLabel}` : ""}`,
            "",
            "## Learning Objectives",
            `- Understand the core principles of ${topic}`,
            `- Apply ${topic} concepts to examples appropriate for ${board}`,
            `- Build confidence discussing ${topic} in class`,
            "",
            "## Materials Needed",
            "- Whiteboard or projector",
            `- Printed handouts on ${topic}`,
            "- Board-prescribed textbook chapter covering this topic",
            "",
            "## Lesson Structure (45 minutes)",
            `1. **Warm-up (5 min)** — Ask ${audience} what they already know about ${topic}`,
            `2. **Direct instruction (15 min)** — Introduce ${topic} with guided notes`,
            "3. **Guided practice (15 min)** — Work through 2-3 examples together",
            `4. **Independent practice (7 min)** — Short worksheet on ${topic}`,
            `5. **Wrap-up (3 min)** — Exit ticket: one question on ${topic}`,
            "",
            "## Assessment",
            "Exit ticket responses and worksheet accuracy indicate readiness for the next lesson.",
          ].join("\n");

    return { content, model: MODEL_SONNET };
  }

  async generateResearchReport({ topic, board }: ResearchReportInput) {
    const content = [
      `# Research Report: ${topic}`,
      `**Board context:** ${board}`,
      "",
      "## Overview",
      `This report summarises the current understanding of ${topic}, structured for classroom use.`,
      "",
      "## Key Findings",
      `1. ${topic} is foundational to the broader curriculum area it sits within.`,
      `2. Common misconceptions about ${topic} typically arise from oversimplified prior teaching.`,
      `3. Real-world applications of ${topic} improve retention.`,
      "",
      "## Suggested Classroom Use",
      `Use this report as background reading before building a lesson plan on ${topic}, or share a simplified excerpt as supplementary material.`,
      "",
      "## Sources",
      `Generated summary — verify against the ${board} prescribed textbook before distributing to students.`,
    ].join("\n");

    return { content, model: MODEL_SONNET };
  }

  async generatePersonalisationSuggestion({ studentName, avgScore, submissionCount, questionCount }: PersonalisationInput) {
    let ratio: Record<string, number>;
    let basis: string;

    if (avgScore === null) {
      ratio = { easy: 2, medium: 2, hard: 1 };
      basis = "no prior graded work yet, so a balanced default mix is suggested";
    } else if (avgScore >= 80) {
      ratio = { easy: 1, medium: 2, hard: 2 };
      basis = `a strong average of ${avgScore.toFixed(0)}% across ${submissionCount} prior submission(s)`;
    } else if (avgScore >= 50) {
      ratio = { easy: 2, medium: 2, hard: 1 };
      basis = `a moderate average of ${avgScore.toFixed(0)}% across ${submissionCount} prior submission(s)`;
    } else {
      ratio = { easy: 3, medium: 2, hard: 0 };
      basis = `an average of ${avgScore.toFixed(0)}% across ${submissionCount} prior submission(s), suggesting more foundational practice first`;
    }

    const suggestedMix = scaleMixToQuestionCount(ratio, questionCount);

    return {
      suggestedMix,
      reasoning: `${studentName} has ${basis}. This is a recommendation only — review before applying.`,
      model: MODEL_HAIKU,
    };
  }

  async gradeSubmission({ questions, answers, answerKey }: GradingInput) {
    // MCQ questions are settled by exact option match, never by the heuristic.
    const { mcqDetails, shortAnswerQuestions } = settleMcqQuestions(questions, answers, answerKey);

    const total = Math.max(1, questions.length);
    let answered = 0;
    let totalLength = 0;
    const saDetails: QuestionGradeDetail[] = shortAnswerQuestions.map((q) => {
      const a = answers[q.id];
      const trimmed = a?.trim() ?? "";
      if (trimmed.length > 0) {
        answered += 1;
        totalLength += trimmed.length;
      }
      return {
        questionId: q.id,
        // The completeness heuristic can only tell whether something was
        // written, never whether it's right - correctness is deliberately
        // unknown here, not false. A real verdict needs GeminiAiProvider.
        correct: null,
        marksAwarded: null,
        note: trimmed.length > 0 ? "Answered - completeness heuristic only, not verified for correctness." : "No answer recorded.",
      };
    });

    const saCount = shortAnswerQuestions.length;
    const completeness = saCount > 0 ? answered / saCount : 1;
    const avgLength = answered > 0 ? totalLength / answered : 0;
    const depth = Math.min(1, avgLength / 80);
    const saScore = saCount > 0 ? completeness * 0.6 + depth * 0.4 : 1;

    const mcqCorrect = mcqDetails.filter((d) => d.correct).length;
    // Each MCQ counts as 1, each short-answer as its heuristic fraction.
    const combined = (mcqCorrect + saScore * saCount) / total;
    const score = Math.round(combined * 100);

    const unanswered = saCount - answered;
    const mcqWrong = mcqDetails.length - mcqCorrect;
    const flagged = score < 40 || (saCount > 0 && completeness < 0.5) || mcqWrong > 0;
    const feedback = flagged
      ? `This submission has ${unanswered} unanswered/brief written question(s) and ${mcqWrong} incorrect multiple-choice answer(s). Recommend reviewing with the student before releasing.`
      : `Solid attempt: ${mcqCorrect}/${mcqDetails.length} multiple-choice correct and ${answered}/${saCount} written question(s) answered. Consider adding supporting detail on shorter answers.`;
    const nextStep = flagged
      ? "Revisit the weak questions with the student one-to-one before the next assignment on this topic."
      : "Ready for a slightly harder question set on this topic next time.";

    return {
      score,
      feedback,
      flagged,
      nextStep,
      model: MODEL_HAIKU,
      questionDetails: orderQuestionDetails(questions, [...mcqDetails, ...saDetails]),
    };
  }

  async generateContent({
    topicName,
    subject,
    board,
    outputType,
    classCount,
    minutesPerClass,
    language,
    customPrompt,
    classLabel,
  }: GenerationInput) {
    const audience = classLabel ? `${classLabel} students` : "students";
    const custom = customPrompt ? ` Custom instructions: ${customPrompt}` : "";
    const durationMinutes = minutesPerClass * classCount;

    let content: StructuredGenerationContent;
    switch (outputType) {
      case "flashcards":
        content = {
          type: "flashcards",
          cards: [
            { front: `What is ${topicName}?`, back: `A core concept in ${subject} for ${board}.` },
            { front: `Why does ${topicName} matter?`, back: `It underpins later ${subject} topics.` },
            { front: `Common mistake with ${topicName}?`, back: "Confusing it with a related but distinct idea." },
          ],
        };
        break;
      case "presentation":
        content = {
          type: "presentation",
          slides: [
            { title: `Introducing ${topicName}`, bullets: [`What ${topicName} is`, `Why it matters in ${subject}`] },
            { title: "Key ideas", bullets: [`The core concepts ${audience} need to know`] },
            { title: "Worked example", bullets: [`A step-by-step ${topicName} example`] },
            { title: "Practice", bullets: [`A question for ${audience} to try`] },
            { title: "Summary", bullets: ["Recap of the key takeaway", "Next steps"] },
          ],
        };
        break;
      case "custom_activity_report":
        content = {
          type: "custom_activity_report",
          objective: `[Apply] ${audience} demonstrate understanding of ${topicName}.${custom}`,
          activities: [
            {
              title: `${topicName} in practice`,
              description: `A ${minutesPerClass}-minute in-class task applying ${topicName}.`,
              durationMinutes,
              materials: [],
            },
          ],
          reportFormat: "What was attempted, what was observed, what to reinforce next class.",
        };
        break;
      case "lesson_plan":
      default: {
        const objectives = [
          `[Understand] Understand the core principles of ${topicName}`,
          `[Apply] Apply ${topicName} concepts to examples appropriate for ${board}`,
        ];
        content = {
          type: "lesson_plan",
          overview: `${audience} explore ${topicName} through guided and independent practice.${custom}`,
          durationMinutes,
          objectives,
          lessonFlow: [
            { label: "Engage", durationMinutes: Math.round(durationMinutes * 0.1) },
            { label: "Explore", durationMinutes: Math.round(durationMinutes * 0.25) },
            { label: "Explain", durationMinutes: Math.round(durationMinutes * 0.3) },
            { label: "Elaborate", durationMinutes: Math.round(durationMinutes * 0.25) },
            { label: "Evaluate", durationMinutes: Math.round(durationMinutes * 0.1) },
          ],
          activities: [
            {
              title: "Warm-up",
              description: `Ask ${audience} what they already know about ${topicName}`,
              durationMinutes: 5,
              materials: [],
            },
            {
              title: "Guided practice",
              description: "Work through examples together",
              durationMinutes: Math.max(10, durationMinutes - 20),
              materials: ["Whiteboard or projector"],
            },
          ],
          // One check per objective, not one exit-ticket question covering all
          // of them - Layer 3 eval judges consistently marked a single question
          // down for leaving most objectives unassessed.
          assessment: objectives
            .map((o, i) => `${i + 1}. Check: ${o.replace(/^\[[^\]]+\]\s*/, "")}`)
            .join(" "),
        };
        break;
      }
    }

    return { content: JSON.stringify(content), model: MODEL_SONNET };
  }

  async generateAnswerKey(questions: AnswerKeyQuestionInput[]) {
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id] = `Draft answer for: "${q.prompt}" — worth ${q.marks} mark(s). Teacher review required before use.`;
    }
    return { answers, model: MODEL_HAIKU };
  }

  async generateAssignmentFromTopic(input: AssignmentGenInput) {
    return { questions: heuristicAssignmentQuestions(input), model: MODEL_SONNET };
  }

  // No OCR model without a Gemini key. Return genuinely empty text (not a
  // placeholder string) - a non-empty "no OCR configured" sentinel used to be
  // returned here and the grading heuristic then scored that filler text as
  // if it were a real, moderately-detailed answer, inflating unscoreable
  // photo submissions with a false score. Empty text correctly reads
  // downstream as "nothing answered."
  async extractTextFromPhoto(_input: OcrInput) {
    return { text: "", confidence: 0 };
  }

  async describeImageForContext(_input: OcrInput) {
    // No vision model without an API key. Return empty so the caller marks the
    // source "pending" rather than storing a placeholder as if it were content.
    return { text: "", model: "stub" };
  }
}

export const stubProvider = new StubAiProvider();

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const OCR_NO_TEXT_SENTINEL = "NO_TEXT_FOUND";

export const DEFAULT_OUTPUT_TYPE_INSTRUCTIONS: Record<GenerationOutputType, string> = {
  lesson_plan:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"overview": string (2-3 sentences summarising the lesson), ' +
    '"durationMinutes": number, ' +
    '"objectives": string[] (each labelled with its Bloom\'s Taxonomy level in square brackets, e.g. "[Understand] ..."), ' +
    '"lessonFlow": {"label": string, "durationMinutes": number}[] (the 5E model stages - Engage, Explore, Explain, Elaborate, Evaluate - durations summing to durationMinutes), ' +
    '"activities": {"title": string, "description": string, "durationMinutes": number, "materials": string[]}[] (classroom activities, durations summing to durationMinutes), ' +
    '"assessment": string (how understanding is checked - MUST include one distinct question or task ' +
    'for EACH objective listed above, not a single question covering only some of them; format as a ' +
    'short numbered list, one line per objective, in the same order as the objectives)}',
  custom_activity_report:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"objective": string (labelled with its Bloom\'s Taxonomy level in square brackets), ' +
    '"activities": {"title": string, "description": string, "durationMinutes": number, "materials": string[]}[] (sized to fit the given minutes per class), ' +
    '"reportFormat": string (what the teacher should record afterwards: what was attempted, what was observed, what to reinforce next class)}',
  flashcards:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"cards": {"front": string, "back": string}[]} with at least 8 cards covering the key concepts of the topic.',
  presentation:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"slides": {"title": string, "bullets": string[]}[]} - a slide-by-slide outline, each slide with a short title and 2-4 bullet points.',
};

async function getPromptInstructions(outputType: GenerationOutputType): Promise<string> {
  const override = await prisma.aiPromptTemplate.findUnique({ where: { outputType } });
  return override?.promptBody ?? DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType];
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

class GeminiAiProvider implements AiProvider {
  generateLessonPlan = stubProvider.generateLessonPlan.bind(stubProvider);
  generateResearchReport = stubProvider.generateResearchReport.bind(stubProvider);

  async generatePersonalisationSuggestion(input: PersonalisationInput) {
    const { studentName, avgScore, submissionCount, questionCount } = input;
    const prompt = [
      `Suggest a difficulty mix for ${studentName}'s next assignment on this topic, based on their recent performance.`,
      avgScore === null
        ? "They have no prior graded work on this topic yet."
        : `Their average score across ${submissionCount} prior graded submission(s) on this topic is ${avgScore.toFixed(0)}%.`,
      "",
      'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
        '{"suggestedMix": {"easy": number, "medium": number, "hard": number}, "reasoning": string (one or two sentences, ' +
        "addressed to the teacher, explaining the recommendation and noting it is a suggestion only)}. " +
        `Counts should sum to exactly ${questionCount} (the assignment's total question count). A stronger average ` +
        "should skew toward medium/hard; a weaker or absent average should skew toward easy/medium.",
    ].join("\n");

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no text");
      const parsed = JSON.parse(stripJsonFence(text)) as { suggestedMix?: Record<string, number>; reasoning?: string };
      if (!parsed.suggestedMix || !parsed.reasoning) throw new Error("Malformed personalisation response");
      const rawMix = {
        easy: Math.max(0, Math.round(parsed.suggestedMix.easy ?? 0)),
        medium: Math.max(0, Math.round(parsed.suggestedMix.medium ?? 0)),
        hard: Math.max(0, Math.round(parsed.suggestedMix.hard ?? 0)),
      };
      // The model is asked to sum to questionCount but isn't guaranteed to -
      // rescale rather than trust it verbatim, same safety net the stub uses.
      const suggestedMix = scaleMixToQuestionCount(rawMix, questionCount);
      return { suggestedMix, reasoning: parsed.reasoning, model: MODEL_GEMINI_FLASH };
    } catch (err) {
      // Fall back to the deterministic heuristic rather than failing the
      // publish flow over a single malformed/failed model response.
      console.error("[ai] generatePersonalisationSuggestion fell back to heuristic:", err);
      return stubProvider.generatePersonalisationSuggestion(input);
    }
  }

  async gradeSubmission({ questions, answers, answerKey }: GradingInput) {
    // Settle multiple-choice deterministically first - only short-answer
    // questions ever reach the model.
    const { mcqDetails, shortAnswerQuestions } = settleMcqQuestions(questions, answers, answerKey);
    const keyByQuestion = new Map((answerKey ?? []).map((k) => [k.questionId, k]));
    const marksFor = (id: string) => keyByQuestion.get(id)?.marks ?? 1;

    const finalise = (
      details: QuestionGradeDetail[],
      modelFeedback: string | null,
      modelNextStep: string | null,
      model: string
    ) => {
      const ordered = orderQuestionDetails(questions, details);
      const totalMarks = questions.reduce((sum, q) => sum + marksFor(q.id), 0) || 1;
      const earnedMarks = ordered.reduce((sum, d) => sum + (d.marksAwarded ?? 0), 0);
      const score = Math.round(Math.min(1, earnedMarks / totalMarks) * 100);
      const flagged = score < 50 || ordered.some((d) => d.correct === false);
      const wrong = ordered.filter((d) => d.correct === false).length;
      return {
        score,
        feedback:
          modelFeedback ??
          (wrong === 0
            ? `All ${ordered.length} question(s) answered correctly.`
            : `${wrong} of ${ordered.length} question(s) answered incorrectly - review with the student before releasing.`),
        flagged,
        nextStep: modelNextStep ?? "Review the incorrect questions with the student before the next assignment on this topic.",
        model,
        questionDetails: ordered,
      };
    };

    // Every remaining short-answer question is blank (or there are none) -
    // skip the model call, grade on MCQ alone with the "unknown, not zero"
    // contract for the blanks.
    if (shortAnswerQuestions.every((q) => !answers[q.id]?.trim())) {
      const blankDetails: QuestionGradeDetail[] = shortAnswerQuestions.map((q) => ({
        questionId: q.id,
        correct: null,
        marksAwarded: null,
        note: "No answer recorded.",
      }));
      if (shortAnswerQuestions.length > 0 && mcqDetails.length === 0) {
        return stubProvider.gradeSubmission({ questions, answers, answerKey });
      }
      return finalise([...mcqDetails, ...blankDetails], null, null, MODEL_GEMINI_FLASH);
    }

    const questionBlock = shortAnswerQuestions
      .map((q, i) => {
        const key = keyByQuestion.get(q.id);
        const lines = [
          `${i + 1}. [id: ${q.id}] ${q.prompt}`,
          `   Student's answer: ${answers[q.id]?.trim() || "(no answer given)"}`,
        ];
        if (key) lines.push(`   Teacher-verified correct answer (worth ${key.marks} mark(s)): ${key.verifiedAnswer}`);
        return lines.join("\n");
      })
      .join("\n\n");

    const prompt = [
      "You are grading a student's assignment submission question by question.",
      "For each question, judge the student's answer against the question (and the teacher-verified answer, when given).",
      "",
      questionBlock,
      "",
      'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
        '{"questionDetails": {"questionId": string, "correct": true|false, "marksAwarded": number (0 to the ' +
        "question's marks, or 0 to 1 if none were given), \"note\": string (one sentence, addressed to the " +
        'teacher)}[], "overallFeedback": string, "nextStep": string (a concrete suggestion for what to do next ' +
        "with this student on this topic)}.",
    ].join("\n");

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no text");
      const parsed = JSON.parse(stripJsonFence(text)) as {
        questionDetails?: { questionId: string; correct: boolean; marksAwarded: number; note: string }[];
        overallFeedback?: string;
        nextStep?: string;
      };
      if (!parsed.questionDetails || !parsed.overallFeedback) throw new Error("Malformed grading response");

      const saDetails: QuestionGradeDetail[] = parsed.questionDetails.map((d) => ({
        questionId: d.questionId,
        correct: !!d.correct,
        marksAwarded: Math.max(0, Number(d.marksAwarded) || 0),
        note: d.note ?? "",
      }));

      // Merge the deterministic MCQ verdicts back in and score across every
      // question, not just the ones the model saw.
      return finalise(
        [...mcqDetails, ...saDetails],
        parsed.overallFeedback,
        parsed.nextStep ?? "Review with the student before releasing.",
        MODEL_GEMINI_FLASH
      );
    } catch (err) {
      console.error("[ai] gradeSubmission fell back to heuristic:", err);
      return stubProvider.gradeSubmission({ questions, answers, answerKey });
    }
  }

  async generateAnswerKey(questions: AnswerKeyQuestionInput[]) {
    const questionBlock = questions.map((q, i) => `${i + 1}. [id: ${q.id}] ${q.prompt} (${q.marks} mark(s))`).join("\n");
    const prompt = [
      "Draft a model answer for each of these assignment questions, suitable for a teacher to review and correct.",
      "",
      questionBlock,
      "",
      'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
        '{"answers": {"<questionId>": string}} - one entry per question id given above.',
    ].join("\n");

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no text");
      const parsed = JSON.parse(stripJsonFence(text)) as { answers?: Record<string, string> };
      if (!parsed.answers) throw new Error("Malformed answer-key response");
      const answers: Record<string, string> = {};
      for (const q of questions) {
        answers[q.id] = parsed.answers[q.id]?.trim() || `Draft answer for: "${q.prompt}" — teacher review required.`;
      }
      return { answers, model: MODEL_GEMINI_FLASH };
    } catch (err) {
      console.error("[ai] generateAnswerKey fell back to template:", err);
      return stubProvider.generateAnswerKey(questions);
    }
  }

  async generateAssignmentFromTopic(input: AssignmentGenInput) {
    const count = Math.max(1, Math.min(20, Math.round(input.questionCount) || 1));
    const mix = expandDifficultyMix(input.difficultyMix, count);
    const typeInstruction =
      input.questionTypes === "mcq"
        ? "Every question MUST be multiple-choice."
        : input.questionTypes === "short_answer"
        ? "Every question MUST be short-answer (no options)."
        : "Use a mix of short-answer and multiple-choice questions.";

    const prompt = [
      `You are an experienced ${input.board} curriculum teacher writing an assignment for ${input.classLabel} students in ${input.subject}.`,
      `Write exactly ${count} question(s). Difficulty for each, in order: ${mix.join(", ")}.`,
      typeInstruction,
      input.objectives.length > 0
        ? `Assess these learning objectives: ${input.objectives.map((o) => `"${o}"`).join("; ")}.`
        : "Assess the core understanding a student should have after this topic.",
      input.focusPrompt ? `Additional instructions from the teacher: ${input.focusPrompt}` : "",
      "",
      "Base every question strictly on the following record of what was taught for this topic. " +
        "Prioritise its specifics over general knowledge; do not copy sentences verbatim.",
      `"""\n${input.taughtContent || "(no taught-content record available)"}\n"""`,
      input.schoolFormatInstructions
        ? `The school requires this style - follow it:\n"""\n${input.schoolFormatInstructions}\n"""`
        : "",
      "",
      'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
        '{"questions": {"prompt": string, "type": "short_answer"|"mcq", "difficulty": "easy"|"medium"|"hard", ' +
        '"options": string[] (3-5 items, ONLY for type "mcq"), "correctOptionIndex": number (0-based into options, ONLY for "mcq"), ' +
        '"modelAnswer": string (for "mcq" this is the exact text of the correct option)}[]} ' +
        `- exactly ${count} entries, in the difficulty order given above.`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no text");
      const parsed = JSON.parse(stripJsonFence(text)) as { questions?: unknown };
      const rows = Array.isArray(parsed.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : null;
      if (!rows || rows.length === 0) throw new Error("Malformed assignment-generation response");

      const questions = normaliseGeneratedQuestions(rows, mix, input.questionTypes);
      if (questions.length === 0) throw new Error("No usable questions in response");
      return { questions, model: MODEL_GEMINI_FLASH };
    } catch (err) {
      console.error("[ai] generateAssignmentFromTopic fell back to heuristic:", err);
      return { questions: heuristicAssignmentQuestions(input), model: MODEL_GEMINI_FLASH };
    }
  }

  async extractTextFromPhoto({
    fileLocation,
    questions,
  }: OcrInput): Promise<{ text: string; confidence: number; perQuestion?: Record<string, string> }> {
    const buffer = await storage.readBuffer(fileLocation);
    const ext = (fileLocation.split(".").pop() ?? "").toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext] ?? "image/jpeg";
    const base64 = buffer.toString("base64");

    if (questions && questions.length > 0) {
      const questionList = questions.map((q, i) => `${i + 1}. [id: ${q.id}] ${q.prompt}`).join("\n");
      const prompt = [
        "This image is a photo of a student's handwritten or printed answers to the following assignment questions:",
        questionList,
        "",
        "Transcribe the student's answer to each question exactly as written (do not translate - keep the " +
          "original language). If you cannot tell which text answers which question, make your best guess from " +
          "layout and numbering.",
        "",
        'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
          '{"perQuestion": {"<questionId>": string}} - use an empty string for any question you found no answer ' +
          "for. Omit a question entirely only if the image has no readable text at all.",
      ].join("\n");

      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
        }),
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Gemini OCR request failed (${response.status}): ${errBody}`);
      }
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      try {
        const parsed = raw ? (JSON.parse(stripJsonFence(raw)) as { perQuestion?: Record<string, string> }) : null;
        const perQuestion = parsed?.perQuestion;
        if (perQuestion && Object.keys(perQuestion).length > 0) {
          const hasAnyText = Object.values(perQuestion).some((v) => v.trim().length > 0);
          const combined = Object.values(perQuestion).join("\n").slice(0, MAX_EXTRACTED_CHARS);
          return hasAnyText ? { text: combined, confidence: 1, perQuestion } : { text: "", confidence: 0 };
        }
      } catch {
        // Fall through to the unsegmented path below if the model didn't
        // return the requested JSON shape.
      }
    }

    const prompt =
      "Transcribe all readable text from this image exactly as written, preserving structure " +
      "(headings, bullet points, paragraphs) where possible. Do not translate - transcribe in " +
      `the original language. If the image has no readable text, respond with exactly: ${OCR_NO_TEXT_SENTINEL}`;

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Gemini OCR request failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text || text === OCR_NO_TEXT_SENTINEL) {
      return { text: "", confidence: 0 };
    }
    return { text: text.slice(0, MAX_EXTRACTED_CHARS), confidence: 1 };
  }

  async describeImageForContext({ fileLocation }: OcrInput): Promise<{ text: string; model: string }> {
    const buffer = await storage.readBuffer(fileLocation);
    const ext = (fileLocation.split(".").pop() ?? "").toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext] ?? "image/jpeg";
    const base64 = buffer.toString("base64");

    const prompt =
      "You are preparing reference material a teacher will use to generate lesson content. " +
      "First, if there is readable text anywhere in the image, transcribe ALL of it exactly as " +
      "written, preserving structure (headings, numbered and bulleted lists, and tables) as closely " +
      "as you can. Do not translate - keep the original language. If there is no readable text, skip " +
      "this step silently - do not write any placeholder, note, or apology for the missing text. " +
      "Then, for every diagram, chart, figure, illustration, map, or photo in the image, add a line " +
      'starting with "[Figure] " that explains what it depicts and the teaching content it carries ' +
      "(labels, parts, relationships, steps, or data values). " +
      "Only if the image has NEITHER readable text NOR anything worth describing (e.g. it is blank, " +
      `corrupted, or unreadable noise), respond with exactly: ${OCR_NO_TEXT_SENTINEL}`;

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Gemini image context request failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text || text === OCR_NO_TEXT_SENTINEL) {
      return { text: "", model: MODEL_GEMINI_FLASH };
    }
    // Defensive: some responses still lead with the sentinel (e.g. "no text
    // to transcribe") before going on to describe a figure. Strip a stray
    // leading occurrence rather than storing it as if it were content.
    text = text.replace(new RegExp(`^${OCR_NO_TEXT_SENTINEL}\\s*`), "").trim();
    if (!text) {
      return { text: "", model: MODEL_GEMINI_FLASH };
    }
    return { text: text.slice(0, MAX_EXTRACTED_CHARS), model: MODEL_GEMINI_FLASH };
  }

  async generateContent({
    topicName,
    subject,
    board,
    outputType,
    classCount,
    minutesPerClass,
    language,
    customPrompt,
    classLabel,
    contextText,
    schoolFormatInstructions,
  }: GenerationInput): Promise<{ content: string; model: string }> {
    const audience = classLabel ? `${classLabel} students` : "students";
    const instructions = await getPromptInstructions(outputType);
    const prompt = [
      `You are an experienced ${board} curriculum teacher writing material for ${audience}.`,
      `Topic: ${topicName}`,
      `Subject: ${subject}`,
      `Board: ${board}`,
      `Classes covered: ${classCount}`,
      `Minutes per class: ${minutesPerClass}`,
      `Output language: ${language}`,
      "",
      instructions,
      "",
      "Return raw JSON only - no preamble, no closing remarks, no markdown code fences around it.",
      "Wherever the shape includes an objective or outcome, label it with its Bloom's " +
        "Taxonomy level in square brackets immediately before the text (e.g., " +
        "\"[Understand] Explain why...\"). Use only these levels: Remember, Understand, Apply, " +
        "Analyze, Evaluate, Create.",
      customPrompt ? `\nAdditional instructions from the teacher: ${customPrompt}` : "",
      contextText
        ? `\nBase the material on the following source content the teacher provided, prioritising ` +
          `its accuracy and specifics over general knowledge. Do not simply repeat it verbatim - ` +
          `use it to ground the material you write.\n"""\n${contextText}\n"""`
        : "",
      schoolFormatInstructions
        ? `\nThe school this is for requires the following output format/style - follow it exactly:\n"""\n${schoolFormatInstructions}\n"""`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Gemini API request failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini API returned no generated text");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(text));
    } catch {
      throw new Error(`Gemini returned non-JSON content for outputType "${outputType}": ${text.slice(0, 200)}`);
    }

    if (Array.isArray(parsed)) {
      if (outputType === "flashcards") parsed = { cards: parsed };
      else if (outputType === "presentation") parsed = { slides: parsed };
    }

    return { content: JSON.stringify(parsed), model: MODEL_GEMINI_FLASH };
  }
}

export const aiProvider: AiProvider = process.env.GEMINI_API_KEY ? new GeminiAiProvider() : stubProvider;

export async function logAiUsage(params: {
  schoolId: string;
  teacherUserId: string;
  feature: string;
  model: string;
  status?: string;
  durationMs?: number;
}) {
  await prisma.aiUsageLog.create({
    data: {
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      feature: params.feature,
      model: params.model,
      status: params.status ?? "success",
      durationMs: params.durationMs,
    },
  });
}
