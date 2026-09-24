import { prisma } from "./prisma";
import { storage } from "./storage";
import { MAX_EXTRACTED_CHARS } from "./extraction";
import { getFeatureCost, deductCredits } from "./credits";
import type { MediaItem } from "./media";
import { jsonrepair } from "jsonrepair";

export const MODEL_SONNET = "claude-sonnet";
export const MODEL_HAIKU = "claude-haiku";
export const MODEL_GEMINI_FLASH = "gemini-2.5-flash";

export type GenerationOutputType =
  | "lesson_plan"
  | "custom_activity_report"
  | "flashcards"
  | "presentation";

// Extensibility point for future lesson-plan structures (client wants more
// added later based on further research) - not "format", which already
// means something unrelated on the older LessonPlan model/route
// (lesson-studio.ts, "lesson_plan" vs "learning_material").
export type LessonPlanStructureType = "5e";

export interface LessonPlanStage {
  stage: string;
  durationMinutes: number;
  summary: string;
  // A short array of steps (rendered as bullets in LessonPlanView.tsx) - see
  // the schema instruction in DEFAULT_OUTPUT_TYPE_INSTRUCTIONS below.
  activities: { title: string; description: string[]; materials: string[] }[];
  // Which class period(s) (1-indexed, matching Generation.classCount) this
  // stage happens in - one 5E arc spread across several classes, not a fresh
  // 5E cycle repeated in each. Omitted when the plan is a single class
  // (classCount <= 1); a long stage can span more than one period.
  sessions?: number[];
}

export interface LessonPlanContent {
  type: "lesson_plan";
  structureType: LessonPlanStructureType;
  overview: string;
  durationMinutes: number;
  objectives: string[];
  stages: LessonPlanStage[];
  assessment: string;
}

export interface CustomActivityContent {
  type: "custom_activity_report";
  // Legacy (pre-Learning Stage picker) generations only - a single prose
  // objective with no Bloom's tag guarantee. New generations use `objectives`
  // below instead. Both optional so either shape parses.
  objective?: string;
  // One or more objectives, each labelled with its Learning Stage in square
  // brackets (same convention as LessonPlanContent.objectives) - constrained
  // to whichever stage(s) the teacher picked, see learningStages below.
  objectives?: string[];
  activities: {
    title: string;
    // A short array of steps (rendered as bullets), same convention as
    // LessonPlanStage.activities - see the schema instruction below.
    description: string[];
    durationMinutes: number;
    materials: string[];
  }[];
  // What to record after running this: 2-3 short bullets (attempted /
  // observed / to reinforce next class), not one paragraph.
  reportFormat: string[];
}

// Client feedback: activity report outputs were "random" because the model
// had no idea how many students would do each activity together, or what's
// physically in the room - it would suggest group work for a solo activity,
// or a printed handout when there's no printer. These two inputs (only
// meaningful for custom_activity_report) constrain that directly, instead of
// leaving it to chance. Mirrored in unified-app's GenerationSetupScreen.tsx
// (kept in sync manually, same pattern as the other small duplicated tables
// in this codebase - the mobile app can't import this backend file).
export type ActivityGroupSize = "individual" | "small_group" | "large_group";
export const ACTIVITY_GROUP_SIZE_LABELS: Record<ActivityGroupSize, string> = {
  individual: "Per student - each student works alone",
  small_group: "Small groups - 2-4 students per group",
  large_group: "Large groups - the whole class split into a few big teams",
};

// School.board is only a label unless the prompt says what it means, so each
// supported board gets concrete instructions. Kept in step with BOARDS in
// lib/boards.ts; an unknown board falls back to no extra guidance.
const BOARD_GUIDANCE: Record<string, string> = {
  CBSE:
    "Align with the CBSE syllabus and the NCERT textbook for this class: use NCERT terminology, definitions and chapter " +
    "framing, and favour competency-based, application-oriented questions and examples over rote recall.",
  ICSE:
    "Align with the CISCE (ICSE/ISC) syllabus: be detailed and precise, with exact definitions and terminology, " +
    "explanations that go into more depth than a summary, and descriptive, reasoned answers.",
  IB:
    "Align with the IB approach: inquiry-driven and concept-based, connecting ideas to real-world and global contexts, " +
    "building approaches-to-learning skills, and phrasing questions and tasks with IB command terms " +
    "(e.g. explain, compare, evaluate, justify) rather than plain recall.",
};

function boardGuidance(board: string): string {
  const guidance = BOARD_GUIDANCE[board];
  return guidance
    ? `Board guidance: ${guidance} If this conflicts with the teacher's own context material or format instructions, those take priority.`
    : "";
}

// A deliberately broad list (per the client's ask to "spend more time adding
// these inputs") covering the range of what a classroom may or may not have,
// not just the 4 examples given - each is a plain yes/no the teacher taps
// once, not something they have to type out.
export const ACTIVITY_RESOURCE_OPTIONS = [
  { key: "board", label: "Whiteboard / blackboard" },
  { key: "projector", label: "Projector or smart TV" },
  { key: "printer", label: "Printer (for handouts)" },
  { key: "stationery", label: "Stationery (pens, markers, chart paper)" },
  { key: "computers", label: "Computers or tablets" },
  { key: "internet", label: "Internet access" },
  { key: "art_supplies", label: "Art & craft supplies (scissors, glue, colored paper)" },
  { key: "open_space", label: "Open floor space to move around" },
  { key: "lab_equipment", label: "Science lab equipment" },
  { key: "audio", label: "Speakers / audio playback" },
] as const;
export type ActivityResourceKey = (typeof ACTIVITY_RESOURCE_OPTIONS)[number]["key"];
const ACTIVITY_RESOURCE_LABELS: Record<string, string> = Object.fromEntries(ACTIVITY_RESOURCE_OPTIONS.map((r) => [r.key, r.label]));

// The six Bloom's Taxonomy stages, shown to teachers as "Learning Stage" -
// same concept, renamed label (never show "Bloom's Level" in the product).
// Only meaningful for custom_activity_report today; kept here (not scoped to
// that type) since it's also the exact set extractBloom/BloomTile already
// recognize on the mobile side.
export const LEARNING_STAGE_OPTIONS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;
export type LearningStage = (typeof LEARNING_STAGE_OPTIONS)[number];

export interface FlashcardsContent {
  type: "flashcards";
  cards: {
    front: string;
    back: string;
    // Optional - old generations predate this field. 2-3 short key terms
    // pulled from the answer, each rendered with a matching icon as a small
    // connected row on the card's back (mobile side picks the icon locally
    // by keyword-matching each term - see unified-app's topicIcons.ts).
    keyTerms?: string[];
  }[];
}

// "school_format" and "more_visual" are legacy - kept only so old
// generations (pre branding-by-default, and pre photo-removal) still parse
// and render exactly as before. New writes only ever use "detailed" or
// "instructional"; branding is applied independently of template choice now
// (see applyPresentationTemplateExtras in routes/generations.ts), and
// presentations no longer use stock photos at all.
export type PresentationTemplate = "detailed" | "instructional" | "school_format" | "more_visual";
// Legacy-only fallback (pre branding-sourced colors) - new generations don't
// write this, colors always come from the school's branding (or an override
// for one generation - see overridePrimaryColor/overrideSecondaryColor).
export type PresentationColorScheme = "indigo" | "coral" | "forest" | "slate";
export type PresentationSlideLayout = "title" | "bullets" | "stat" | "quote" | "divider" | "stat-grid" | "timeline" | "icon-grid" | "image";

// An image or PDF page the teacher chose to show as-is (see lib/media.ts).
// `id` is what a presentation slide's mediaId points at.
export interface MediaCatalogEntry {
  id: string;
  description: string;
}

export interface PresentationContent {
  type: "presentation";
  // Optional: old generations predate these fields - the parser/viewer
  // default to "detailed"/"indigo" when absent, no legacy-shape migration
  // needed since the slides array itself never changes.
  template?: PresentationTemplate;
  colorScheme?: PresentationColorScheme;
  // Set in code from the school's branding row (or a per-generation
  // override) whenever branding is configured - never generated by the
  // model, and independent of `template` (see routes/generations.ts).
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  // Set in code - "Prepared by {teacher} - {school}", rendered as a small
  // footer watermark on every slide. Never generated by the model.
  footerLabel?: string | null;
  // Set in code: the images / PDF pages shown as-is in "image" slides. Each
  // image slide's mediaId points at an entry here.
  media?: MediaItem[];
  slides: {
    // Optional so pre-layout generations keep parsing - readers default to
    // "bullets" when absent/unrecognized.
    layout?: PresentationSlideLayout;
    // Doubles as the big number on a "stat" slide, or the quote text on a
    // "quote" slide.
    title: string;
    // bullets[0] doubles as the stat's caption / the quote's attribution.
    bullets: string[];
    // Optional speaker notes - additive, not read anywhere yet outside the export.
    notes?: string;
    // Legacy only ("more_visual" decks predating the photo removal) - no
    // longer set on new generations, kept so those old rows still render.
    imageUrl?: string;
    // Only on layout "image": which entry of the deck's `media` this slide shows.
    mediaId?: string;
    // Used by "stat-grid" (title = the number, description = its label),
    // "timeline" (title = step name, tag = duration like "1 Week",
    // description = the step's paragraph), and "icon-grid" (title = card
    // heading, description = card body, icon auto-picked from title).
    items?: { title: string; description?: string; tag?: string }[];
  }[];
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
  // Only meaningful when outputType is "presentation".
  presentationTemplate?: PresentationTemplate;
  // Only meaningful when outputType is "custom_activity_report".
  activityGroupSize?: ActivityGroupSize;
  activityResources?: string[];
  // Learning Stage(s) the teacher constrained this report's objectives to -
  // empty/omitted means the AI picks freely, same as before this existed.
  learningStages?: string[];
  // Images / PDF pages the teacher picked to be shown as-is next to the
  // generated content. The model never sees the pixels - only these short
  // descriptions - and is told where/how to place them.
  mediaCatalog?: MediaCatalogEntry[];
}

export interface AnswerKeyQuestionInput {
  id: string;
  index: number;
  prompt: string;
  marks: number;
}

// true_false is stored exactly like mcq (options: ["True","False"],
// correctOptionIndex) so it settles through the same deterministic path -
// see settleMcqQuestions. fill_blank/very_short/short_answer share one data
// shape (prompt + modelAnswer) and differ only in phrasing/prompting; they
// all go to the AI grader like short_answer always has.
export type AssignmentQuestionType =
  | "mcq"
  | "true_false"
  | "fill_blank"
  | "very_short"
  | "short_answer"
  | "match_following"
  | "sequencing";

export interface AssignmentGenInput {
  // Plain-text summary of what was taught for this topic (assembled from the
  // topic's lesson generations, or its context sources as a fallback).
  taughtContent: string;
  objectives: string[];
  questionCount: number;
  difficultyMix: { easy: number; medium: number; hard: number };
  // Which format(s) to use - empty means "the model may use any of them".
  // A single entry forces every question to that type; several lets the
  // model mix among just those (never a type outside this list).
  questionTypes: AssignmentQuestionType[];
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
  // mcq / true_false only: 2-5 options (true_false is always exactly
  // ["True", "False"]), correctOptionIndex is 0-based into options.
  options?: string[];
  correctOptionIndex?: number;
  // match_following only: each pair's left/right correspond to each other -
  // the app shuffles the right column for display, this order is the answer key.
  pairs?: { left: string; right: string }[];
  // sequencing only: the steps/items already in their correct order - the
  // app shuffles them for display, this order is the answer key.
  items?: string[];
  // The model answer / grading reference: for mcq/true_false, the correct
  // option's text; for match_following, a readable "left - right" summary;
  // for sequencing, the items joined in order; otherwise the expected
  // written answer. Seeds the answer key.
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

export interface ContextResearchInput {
  topicName: string;
  subject: string;
  board: string;
}

export type ResearchCandidateType = "pdf" | "video" | "presentation" | "article" | "image";

export interface ResearchCandidateDraft {
  title: string;
  url: string;
  type: ResearchCandidateType;
  snippet: string;
}

export interface CleanArticleTextInput {
  rawText: string;
  sourceUrl: string;
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

export interface AssessmentInsightInput {
  topicName: string;
  subject: string;
  board: string;
  bands: { level_1: number; level_2: number; level_3: number };
  itemAnalysis: { prompt: string; correctRate: number | null; doubtCount: number }[];
  totalDoubts: number;
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

// A match_following/sequencing answer is submitted as a CSV of original
// indices - e.g. "2,0,1" for match_following means "I paired left[0] with
// pairs[2]'s right, left[1] with pairs[0]'s right, left[2] with pairs[1]'s
// right"; for sequencing, "I tapped items[2] first, then items[0], then
// items[1]". Since the stored pairs/items are already in correct
// correspondence/order, the correct answer is trivially "0,1,2,...N-1" -
// grading is just comparing position-by-position. Mirrored in
// unified-app's MatchingQuestion/SequencingQuestion (the two write this
// same format when the student submits).
function parseIndexList(value: string): number[] {
  return value
    .split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isInteger(n));
}

// Settles every deterministically-gradeable question - multiple-choice and
// true/false by exact option match, match_following/sequencing by comparing
// submitted order to the stored (already-correct) order - so only genuinely
// open-ended questions ever reach the grading model.
export function settleMcqQuestions(
  questions: GradingQuestion[],
  answers: Record<string, string>,
  answerKey?: AnswerKeyContext[]
): { mcqDetails: QuestionGradeDetail[]; shortAnswerQuestions: GradingQuestion[] } {
  const marksById = new Map((answerKey ?? []).map((k) => [k.questionId, k.marks]));
  const mcqDetails: QuestionGradeDetail[] = [];
  const shortAnswerQuestions: GradingQuestion[] = [];

  for (const q of questions) {
    const marks = marksById.get(q.id) ?? 1;
    const given = (answers[q.id] ?? "").trim();
    const answered = given.length > 0;

    const isMcq =
      (q.type === "mcq" || q.type === "true_false") &&
      Array.isArray(q.options) &&
      q.options.length > 0 &&
      typeof q.correctOptionIndex === "number" &&
      q.correctOptionIndex >= 0 &&
      q.correctOptionIndex < q.options.length;
    if (isMcq) {
      const correctText = String(q.options![q.correctOptionIndex!] ?? "");
      const correct = answered && normaliseOption(given) === normaliseOption(correctText);
      mcqDetails.push({
        questionId: q.id,
        correct: answered ? correct : false,
        marksAwarded: correct ? marks : 0,
        note: !answered ? "No option selected." : correct ? "Correct option selected." : `Incorrect option selected ("${given}").`,
      });
      continue;
    }

    const isMatching = q.type === "match_following" && Array.isArray(q.pairs) && q.pairs.length >= 2;
    const isSequencing = q.type === "sequencing" && Array.isArray(q.items) && q.items.length >= 2;
    if (isMatching || isSequencing) {
      const total = isMatching ? q.pairs!.length : q.items!.length;
      const submitted = answered ? parseIndexList(given) : [];
      const correctCount = submitted.length === total ? submitted.filter((n, i) => n === i).length : 0;
      const allCorrect = answered && correctCount === total;
      const marksAwarded = Math.round(((marks * correctCount) / total) * 100) / 100;
      mcqDetails.push({
        questionId: q.id,
        correct: allCorrect,
        marksAwarded,
        note: !answered
          ? isMatching
            ? "No pairs matched."
            : "No order submitted."
          : isMatching
          ? `${correctCount} of ${total} pairs matched correctly.`
          : `${correctCount} of ${total} items in the correct position.`,
      });
      continue;
    }

    shortAnswerQuestions.push(q);
  }

  return { mcqDetails, shortAnswerQuestions };
}

export const ALL_QUESTION_TYPES: AssignmentQuestionType[] = [
  "mcq",
  "true_false",
  "fill_blank",
  "very_short",
  "short_answer",
  "match_following",
  "sequencing",
];

// Mirrored in unified-app's AssignmentAiSetupScreen.tsx for the format
// picker (kept in sync manually, same pattern as the other small duplicated
// tables in this codebase - the mobile app can't import this backend file).
export const QUESTION_TYPE_LABELS: Record<AssignmentQuestionType, string> = {
  mcq: "Multiple choice (single correct)",
  true_false: "True / False",
  fill_blank: "Fill in the blanks",
  very_short: "Very short / one-word answer",
  short_answer: "Short answer",
  match_following: "Match the following",
  sequencing: "Sequencing / ordering",
};

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
  const allowedTypes = input.questionTypes.length > 0 ? input.questionTypes : ALL_QUESTION_TYPES;

  return Array.from({ length: count }, (_, i) => {
    const seed = seeds[i % seeds.length];
    const type = allowedTypes[i % allowedTypes.length];
    const difficulty = difficulties[i];

    switch (type) {
      case "mcq": {
        const options = ["Option A", "Option B", "Option C", "Option D"];
        return { prompt: `Which statement best relates to ${seed}?`, type, difficulty, options, correctOptionIndex: 0, modelAnswer: `${options[0]} — teacher review required.` };
      }
      case "true_false":
        return { prompt: `True or false: ${seed} is directly relevant to this topic.`, type, difficulty, options: ["True", "False"], correctOptionIndex: 0, modelAnswer: "True — teacher review required." };
      case "fill_blank":
        return { prompt: `Fill in the blank: ${seed} is an example of ___.`, type, difficulty, modelAnswer: "Teacher review required before use." };
      case "very_short":
        return { prompt: `In one word or phrase, name the key idea behind ${seed}.`, type, difficulty, modelAnswer: "Teacher review required before use." };
      case "match_following": {
        const pairs = [
          { left: `${seed} - term 1`, right: "Definition 1" },
          { left: `${seed} - term 2`, right: "Definition 2" },
          { left: `${seed} - term 3`, right: "Definition 3" },
        ];
        return { prompt: `Match each item on the left to its correct definition on the right, based on ${seed}.`, type, difficulty, pairs, modelAnswer: pairs.map((p) => `${p.left} - ${p.right}`).join("; ") };
      }
      case "sequencing": {
        const items = [`First step of ${seed}`, `Second step of ${seed}`, `Third step of ${seed}`];
        return { prompt: `Arrange these steps of ${seed} in the correct order.`, type, difficulty, items, modelAnswer: items.join(" -> ") };
      }
      case "short_answer":
      default:
        return { prompt: `Explain ${seed}. Give an example in your answer.`, type: "short_answer" as const, difficulty, modelAnswer: `Draft model answer covering ${seed}. Teacher review required before use.` };
    }
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Cleans a model's raw question rows into well-formed GeneratedAssignmentQuestion
// objects: enforces the requested type(s), valid shape per type (options for
// mcq/true_false, pairs for match_following, items for sequencing), a
// difficulty per the requested order, and a non-empty model answer. A row
// that claims a structured type but doesn't actually have that type's data
// (e.g. "match_following" with under 2 pairs) falls back to short_answer
// rather than being dropped or shown broken.
export function normaliseGeneratedQuestions(
  rows: any[],
  difficultyByIndex: ("easy" | "medium" | "hard")[],
  allowedTypes: AssignmentQuestionType[]
): GeneratedAssignmentQuestion[] {
  const allowed = allowedTypes.length > 0 ? allowedTypes : ALL_QUESTION_TYPES;
  const forcedType = allowedTypes.length === 1 ? allowedTypes[0] : null;
  const out: GeneratedAssignmentQuestion[] = [];

  rows.forEach((row, i) => {
    const prompt = typeof row?.prompt === "string" ? row.prompt.trim() : "";
    if (!prompt) return;

    const difficulty = difficultyByIndex[i] ?? "medium";
    const modelAnswerRaw = String(row?.modelAnswer ?? "").trim();
    const type: AssignmentQuestionType = forcedType ?? (allowed.includes(row?.type) ? row.type : allowed[0]);

    if (type === "mcq" || type === "true_false") {
      const rawOptions =
        type === "true_false"
          ? ["True", "False"]
          : Array.isArray(row?.options)
          ? row.options.map((o: any) => String(o ?? "").trim()).filter(Boolean)
          : [];
      if (rawOptions.length >= 2) {
        const options = rawOptions.slice(0, 5);
        let correctOptionIndex = Number.isInteger(row?.correctOptionIndex) ? row.correctOptionIndex : 0;
        if (correctOptionIndex < 0 || correctOptionIndex >= options.length) {
          const byText = options.findIndex((o: string) => o.toLowerCase() === modelAnswerRaw.toLowerCase());
          correctOptionIndex = byText >= 0 ? byText : 0;
        }
        out.push({ prompt, type, difficulty, options, correctOptionIndex, modelAnswer: modelAnswerRaw || options[correctOptionIndex] });
        return;
      }
      // Not enough options to be a real mcq/true_false - fall through to short_answer below.
    }

    if (type === "match_following") {
      const pairs = Array.isArray(row?.pairs)
        ? row.pairs
            .map((p: any) => ({ left: String(p?.left ?? "").trim(), right: String(p?.right ?? "").trim() }))
            .filter((p: { left: string; right: string }) => p.left && p.right)
        : [];
      if (pairs.length >= 2) {
        out.push({ prompt, type, difficulty, pairs, modelAnswer: modelAnswerRaw || pairs.map((p: { left: string; right: string }) => `${p.left} - ${p.right}`).join("; ") });
        return;
      }
    }

    if (type === "sequencing") {
      const items = Array.isArray(row?.items) ? row.items.map((it: any) => String(it ?? "").trim()).filter(Boolean) : [];
      if (items.length >= 2) {
        out.push({ prompt, type, difficulty, items, modelAnswer: modelAnswerRaw || items.join(" -> ") });
        return;
      }
    }

    // fill_blank / very_short / short_answer, and the structured-type fallbacks above.
    out.push({
      prompt,
      type: type === "mcq" || type === "true_false" || type === "match_following" || type === "sequencing" ? "short_answer" : type,
      difficulty,
      modelAnswer: modelAnswerRaw || "Teacher review required before use.",
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
  // mcq/true_false (options+correctOptionIndex), match_following (pairs) and
  // sequencing (items, already in correct order) all settle deterministically
  // and never reach the grading model - see settleMcqQuestions.
  type?: string;
  options?: string[];
  correctOptionIndex?: number;
  pairs?: { left: string; right: string }[];
  items?: string[];
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

export type AssistantPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface AssistantContent {
  role: "user" | "model";
  parts: AssistantPart[];
}

export interface AssistantToolDeclaration {
  name: string;
  description: string;
  // JSON-schema object; omit for a tool with no arguments.
  parameters?: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface AssistantStepInput {
  contents: AssistantContent[];
  systemPrompt: string;
  tools: AssistantToolDeclaration[];
}

export interface AiProvider {
  generateLessonPlan(input: LessonPlanInput): Promise<{ content: string; model: string }>;
  generateResearchReport(input: ResearchReportInput): Promise<{ content: string; model: string }>;
  // AI Research mode for the Context module (distinct from generateResearchReport
  // above, which produces a text report) - searches the web for candidate
  // sources a teacher can approve into real ContextSource rows. See
  // backend/src/lib/context-research.ts.
  researchContextSources(input: ContextResearchInput): Promise<{ candidates: ResearchCandidateDraft[] }>;
  generatePersonalisationSuggestion(
    input: PersonalisationInput
  ): Promise<{ suggestedMix: Record<string, number>; reasoning: string; model: string }>;
  // Used only by GET /assessments/:id/insight - replaces the three canned
  // suggestedActions strings assignments' class-insight uses with a
  // recommendation grounded in this specific quiz's actual bands/item data.
  generateAssessmentRecommendation(input: AssessmentInsightInput): Promise<{ recommendation: string; model: string }>;
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
  // Used only by the Lesson Studio topic-context URL upload path: a scraped
  // web page's body text is full of navigation/footer/ad boilerplate that
  // naive tag-stripping can't remove (modern sites build menus out of plain
  // divs, not <nav>/<footer>), so the AI extracts just the substantive
  // content instead of a DOM-heuristics library.
  cleanScrapedArticleText(input: CleanArticleTextInput): Promise<{ text: string; model: string }>;
  // One model turn of the in-app assistant (backend/src/lib/assistant-engine.ts
  // owns the tool loop - this only does a single request/response).
  assistantStep(input: AssistantStepInput): Promise<{ parts: AssistantPart[]; model: string }>;
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

  async researchContextSources({ topicName, board }: ContextResearchInput) {
    // Video/YouTube candidates are deferred to a later phase (no reliable way
    // to verify or extract real content from a video link yet) - see
    // GeminiAiProvider.researchContextSources for the real implementation.
    const encoded = encodeURIComponent(topicName);
    const candidates: ResearchCandidateDraft[] = [
      {
        title: `${topicName} — overview article`,
        url: `https://en.wikipedia.org/wiki/${encoded}`,
        type: "article",
        snippet: `A general overview of ${topicName}, useful as background reading before class.`,
      },
      {
        title: `${topicName} — study notes (PDF)`,
        url: `https://www.google.com/search?q=${encoded}+filetype:pdf`,
        type: "pdf",
        snippet: `Search results for downloadable PDF notes covering ${topicName}.`,
      },
    ];
    return { candidates };
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

  async generateAssessmentRecommendation({ bands, totalDoubts }: AssessmentInsightInput) {
    const graded = bands.level_1 + bands.level_2 + bands.level_3;
    let recommendation =
      graded === 0
        ? "No responses recorded yet."
        : bands.level_3 > graded / 2
          ? "More than half the class is below 50% — consider re-teaching this topic before moving on."
          : bands.level_3 > 0
            ? "A small group needs individual follow-up before the next lesson on this topic."
            : "Class-wide understanding looks solid — safe to move to the next topic.";
    if (totalDoubts > 0) recommendation += ` ${totalDoubts} doubt${totalDoubts === 1 ? " was" : "s were"} raised during the quiz — worth revisiting in class.`;
    return { recommendation, model: "stub" };
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
    presentationTemplate,
    learningStages,
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
          template: presentationTemplate ?? "detailed",
          slides: [
            { title: `Introducing ${topicName}`, bullets: [`What ${topicName} is`, `Why it matters in ${subject}`] },
            { title: "Key ideas", bullets: [`The core concepts ${audience} need to know`] },
            { title: "Worked example", bullets: [`A step-by-step ${topicName} example`] },
            { title: "Practice", bullets: [`A question for ${audience} to try`] },
            { title: "Summary", bullets: ["Recap of the key takeaway", "Next steps"] },
          ],
        };
        break;
      case "custom_activity_report": {
        const stage = learningStages?.[0] ?? "Apply";
        content = {
          type: "custom_activity_report",
          objectives: [`[${stage}] ${audience} demonstrate understanding of ${topicName}.${custom}`],
          activities: [
            {
              title: `${topicName} in practice`,
              description: [`Set up a ${minutesPerClass}-minute in-class task applying ${topicName}`, "Circulate and check in with each group"],
              durationMinutes,
              materials: [],
            },
          ],
          reportFormat: ["What was attempted", "What was observed", "What to reinforce next class"],
        };
        break;
      }
      case "lesson_plan":
      default: {
        // One 5E arc for the whole topic, spread across `classCount` classes -
        // not a fresh cycle per class. Each stage's [start, end) minutes range
        // (stages partition [0, durationMinutes) with no gaps, by construction
        // below) determines which class period(s) it falls in.
        const assignSessions = <T extends { durationMinutes: number }>(stages: T[]): (T & { sessions?: number[] })[] => {
          if (classCount <= 1) return stages;
          let cursor = 0;
          return stages.map((stage) => {
            const start = cursor;
            cursor += stage.durationMinutes;
            const first = Math.min(classCount, Math.floor(start / minutesPerClass) + 1);
            const last = Math.min(classCount, Math.max(first, Math.ceil(cursor / minutesPerClass)));
            return { ...stage, sessions: Array.from({ length: last - first + 1 }, (_, i) => first + i) };
          });
        };
        const objectives = [
          `[Understand] Understand the core principles of ${topicName}`,
          `[Apply] Apply ${topicName} concepts to examples appropriate for ${board}`,
        ];
        const engageMinutes = Math.round(durationMinutes * 0.1);
        const exploreMinutes = Math.round(durationMinutes * 0.25);
        const explainMinutes = Math.round(durationMinutes * 0.3);
        const elaborateMinutes = Math.max(0, durationMinutes - engageMinutes - exploreMinutes - explainMinutes - Math.round(durationMinutes * 0.1));
        const evaluateMinutes = durationMinutes - engageMinutes - exploreMinutes - explainMinutes - elaborateMinutes;
        content = {
          type: "lesson_plan",
          structureType: "5e",
          overview: `${audience} explore ${topicName} through guided and independent practice.${custom}`,
          durationMinutes,
          objectives,
          stages: assignSessions([
            {
              stage: "Engage",
              durationMinutes: engageMinutes,
              summary: `Hook ${audience} and surface what they already know about ${topicName}.`,
              activities: [
                {
                  title: "Warm-up",
                  description: [`Ask ${audience} what they already know about ${topicName}`, "Collect a few answers on the board before moving on"],
                  materials: [],
                },
              ],
            },
            {
              stage: "Explore",
              durationMinutes: exploreMinutes,
              summary: `${audience} investigate ${topicName} hands-on before it's formally explained.`,
              activities: [
                {
                  title: "Guided exploration",
                  description: [`Split into small groups`, `Work through a ${topicName} example together`, "Note down what the group notices"],
                  materials: ["Whiteboard or projector"],
                },
              ],
            },
            {
              stage: "Explain",
              durationMinutes: explainMinutes,
              summary: `Introduce the core concepts of ${topicName} with guided notes.`,
              activities: [
                {
                  title: "Direct instruction",
                  description: [`Explain the core ${topicName} concepts`, "Tie the explanation back to what came up during exploration"],
                  materials: ["Whiteboard or projector"],
                },
              ],
            },
            {
              stage: "Elaborate",
              durationMinutes: elaborateMinutes,
              summary: `${audience} apply ${topicName} to a new, slightly harder example.`,
              activities: [
                { title: "Independent practice", description: ["Work through examples applying the concept just taught"], materials: [] },
              ],
            },
            {
              stage: "Evaluate",
              durationMinutes: evaluateMinutes,
              summary: "Quick check of whether the lesson's objectives were met.",
              activities: [
                { title: "Exit ticket", description: ["Short check for understanding before class ends"], materials: [] },
              ],
            },
          ]),
          // One check per objective, not one exit-ticket question covering all
          // of them - Layer 3 eval judges consistently marked a single question
          // down for leaving most objectives unassessed. Real newlines so the
          // markdown renderer in LessonPlanView actually shows it as a list.
          assessment: objectives
            .map((o, i) => `${i + 1}. Check: ${o.replace(/^\[[^\]]+\]\s*/, "")}`)
            .join("\n"),
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

  async cleanScrapedArticleText({ rawText }: CleanArticleTextInput) {
    // No model to do real cleanup offline - pass the scrape through as-is
    // rather than fail the upload; a human can still edit it via the
    // "manual override" text-edit path if it's noisy.
    return { text: rawText, model: "stub" };
  }

  async assistantStep({ contents }: AssistantStepInput) {
    // Deterministic and offline: acknowledges the last thing the user said.
    // Never requests a tool, so tests and no-API-key dev runs stay predictable.
    const lastUser = [...contents].reverse().find((c) => c.role === "user");
    const lastText = lastUser?.parts.map((p) => ("text" in p ? p.text : "")).join(" ").trim() ?? "";
    return { parts: [{ text: `(stub assistant) You said: "${lastText}"` }], model: "stub" };
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
  // "stages" replaces the old separate lessonFlow+activities pair - nesting
  // activities under the 5E stage they actually happen in is what makes the
  // stage breakdown carry real content instead of just repeating stage names
  // a teacher can't connect to anything (see LessonPlanStage in this file).
  lesson_plan:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"overview": string (2-3 sentences summarising the lesson), ' +
    '"durationMinutes": number, ' +
    '"objectives": string[] (each labelled with its Bloom\'s Taxonomy level in square brackets, e.g. "[Understand] ..."), ' +
    '"stages": {"stage": "Engage"|"Explore"|"Explain"|"Elaborate"|"Evaluate", "durationMinutes": number, ' +
    '"summary": string (one sentence on the purpose of this stage), ' +
    '"activities": {"title": string, "description": string[] (2-4 short, concrete steps of the activity, ' +
    'in the order a teacher would run them - each its own bullet, not one long sentence), ' +
    '"materials": string[]}[], ' +
    '"sessions": number[] (OMIT this field entirely when the lesson is a single class; when it spans more ' +
    'than one class, the 1-indexed class period(s) - out of the total given - this stage happens in, e.g. ' +
    '[1] or [2, 3] for a stage that runs long)}[] ' +
    '(the 5E model - all 5 stages present, in that exact order, durations summing to durationMinutes; ' +
    'put each activity under the ONE stage it actually happens in, never repeat an activity across stages; ' +
    'this is ONE 5E arc for the whole topic, spread across the classes - never a fresh 5E cycle repeated ' +
    'in each class), ' +
    '"assessment": string (how understanding is checked - MUST include one distinct question or task ' +
    'for EACH objective listed above, not a single question covering only some of them; format as a ' +
    'markdown numbered list ("1. ...", one item per line with a real newline between items), one line ' +
    'per objective, in the same order as the objectives)}',
  custom_activity_report:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"objectives": string[] (one or more, each labelled with its Bloom\'s Taxonomy level in square brackets, ' +
    'e.g. "[Understand] ..." - see "Learning stage(s) to target" below if given), ' +
    '"activities": {"title": string, "description": string[] (2-4 short, concrete steps of the activity, in the ' +
    'order a teacher would run them - each its own bullet, not one long sentence), "durationMinutes": number, ' +
    '"materials": string[]}[] (sized to fit the given minutes per class; between them, cover every objective above), ' +
    '"reportFormat": string[] (2-3 short bullets on what the teacher should record afterwards - what was attempted, ' +
    'what was observed, what to reinforce next class)}',
  flashcards:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"cards": {"front": string, "back": string, "keyTerms": string[]}[]} with at least 8 cards covering the ' +
    "key concepts of the topic. \"keyTerms\" is 2-3 short words or short phrases (1-2 words each, not full " +
    "sentences) pulled directly from that card's answer, in the order they matter to the answer - e.g. for an " +
    'answer about photosynthesis: ["Sunlight", "Chlorophyll", "Energy"]. Every card needs keyTerms, even if ' +
    "it's just repeating the most important word or two from the answer.",
  presentation:
    'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
    '{"slides": {"layout": "title"|"bullets"|"stat"|"quote"|"divider"|"stat-grid"|"timeline"|"icon-grid", ' +
    '"title": string, "bullets": string[], "notes": string, "items": {"title": string, "description": string, "tag": string}[]}[]}. ' +
    "This presentation uses NO images or photos anywhere - rely entirely on color, structure, and layout variety " +
    "to make it visually interesting. For most slides, layout is \"bullets\" (short title, 2-4 bullet points) - " +
    'but vary it purposefully: open the deck with a "title" slide (just a strong title, empty bullets/items), ' +
    'use a "divider" slide (title only) between major sections, use a "stat" slide for one standout number ' +
    '(title = the number/statistic, bullets[0] = a short caption explaining it), a "quote" slide for a notable ' +
    'quote (title = the quote text, bullets[0] = who said it or where it\'s from), a "stat-grid" slide when you ' +
    "have 3-5 related key numbers or facts to show together (items[].title = each number, items[].description = " +
    'its label), a "timeline" slide for a sequence of steps or stages (items[].title = the step name, ' +
    "items[].tag = a short duration/order label, items[].description = what happens in that step), and an " +
    '"icon-grid" slide for 3-4 parallel concepts, features, or vocabulary terms (items[].title = the term or ' +
    "heading, items[].description = its explanation). Every slide needs 1-2 sentences of presenter speaker " +
    'notes in "notes" - what the teacher should say while showing it, not a repeat of the bullets.',
};

// Tells the model about images / PDF pages the teacher chose to show as-is.
// The point is to spend generation on the parts that need writing and reuse
// the teacher's own material for the rest - so the model is told not to
// re-describe or duplicate what those items already show.
function mediaCatalogInstructions(outputType: GenerationOutputType, catalog: MediaCatalogEntry[] | undefined): string {
  if (!catalog || catalog.length === 0) return "";
  const list = catalog.map((entry) => `- ${entry.id}: ${entry.description}`).join("\n");
  if (outputType === "presentation") {
    return (
      "The teacher has chosen these images / PDF pages to be shown as-is inside the deck:\n" +
      `${list}\n` +
      'Show each one on its own slide with layout "image": set mediaId to its id (e.g. "m1"), give the slide a short ' +
      "title (a caption of a few words), and use bullets only for at most two short supporting lines, or an empty array. " +
      "Place each where it best supports the teaching flow, use every item exactly once, and never invent a mediaId that " +
      "is not in the list. Do not re-describe what an item shows in the other slides - refer to it in the speaker notes " +
      "instead."
    );
  }
  return (
    "The teacher is attaching these images / PDF pages to the material as-is; they will be shown alongside it:\n" +
    `${list}\n` +
    "You may point the reader to them by name where it helps (for example: see the attached diagram), but do not try to " +
    "reproduce or describe their content at length, do not change the required JSON shape because of them, and never " +
    "put a double-quote character inside a text value when mentioning them."
  );
}

async function getPromptInstructions(outputType: GenerationOutputType): Promise<string> {
  const override = await prisma.aiPromptTemplate.findUnique({ where: { outputType } });
  return override?.promptBody ?? DEFAULT_OUTPUT_TYPE_INSTRUCTIONS[outputType];
}

// Layered on top of DEFAULT_OUTPUT_TYPE_INSTRUCTIONS.presentation's base JSON
// shape when outputType is "presentation" - only affects content structure.
// Colors/branding never reach this: they're a pure display concern, set
// directly on the stored content in routes/generations.ts, never decided by
// the model.
const PRESENTATION_TEMPLATE_INSTRUCTIONS: Record<PresentationTemplate, string> = {
  detailed:
    "Make this a text-heavy, detailed reference deck: on \"bullets\"-layout slides, use 4-6 bullet points, " +
    "each a full explanatory sentence (not a fragment), suitable for a student reading it independently without " +
    'a teacher present. Favor a "stat-grid" or "icon-grid" slide wherever the content has a natural group of ' +
    "related facts or terms, instead of cramming everything into one bullet list.",
  instructional:
    "Structure this as step-by-step instructions for a process. When there are 3-6 steps that each fit in a " +
    'sentence or two, use a single "timeline" slide for the whole sequence (items = the ordered steps, ' +
    "items[].tag = a short label like \"Step 1\"). Fall back to individual \"bullets\" slides - title MUST " +
    'start with "Step N: " - only for a step that needs more detail than a timeline card can hold. Skip ' +
    '"stat"/"quote" slides for this template - they don\'t fit a procedure.',
  // Legacy values, no longer offered in the picker - kept only so old
  // generations using them keep working if ever regenerated. Branding and
  // images are both applied independently of template now (and images are
  // never used at all any more - "more_visual" falls back to "detailed").
  school_format:
    "Make this a text-heavy, detailed reference deck: on \"bullets\"-layout slides, use 4-6 bullet points, " +
    "each a full explanatory sentence (not a fragment), suitable for a student reading it independently without a teacher present.",
  more_visual:
    "Make this a text-heavy, detailed reference deck: on \"bullets\"-layout slides, use 4-6 bullet points, " +
    "each a full explanatory sentence (not a fragment), suitable for a student reading it independently without a teacher present.",
};

// Gemini structured-output schema for presentations (Gemini's schema dialect
// is a restricted subset of OpenAPI 3.0 - no "$ref", no "additionalProperties").
const PRESENTATION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          layout: { type: "string", enum: ["title", "bullets", "stat", "quote", "divider", "stat-grid", "timeline", "icon-grid", "image"] },
          title: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
          mediaId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                tag: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["layout", "title", "bullets", "notes"],
      },
    },
  },
  required: ["slides"],
};

// Normalizes away formatting differences (protocol, www, trailing slash,
// query string) so a model-typed URL can be matched against a real grounding
// chunk URL even when they differ in trivial ways.
function normalizeUrlForMatch(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

// Strict parse first; if the model's JSON is slightly malformed (missing
// closing brace/bracket, trailing comma, stray text around it), repair it
// rather than failing the whole generation. Throws if it is beyond repair.
function parseModelJson(raw: string): unknown {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    return JSON.parse(jsonrepair(cleaned));
  }
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

class GeminiAiProvider implements AiProvider {
  generateLessonPlan = stubProvider.generateLessonPlan.bind(stubProvider);
  generateResearchReport = stubProvider.generateResearchReport.bind(stubProvider);

  async researchContextSources({ topicName, subject, board }: ContextResearchInput) {
    // Video/YouTube candidates are deferred to a later phase - no reliable
    // way yet to verify or pull real content from a video link.
    const prompt = [
      `Find real, currently-accessible web resources a school teacher could use as reference material to teach "${topicName}" (${subject}, ${board} curriculum) — PDFs, articles, and presentations.`,
      "Use web search extensively to find actual pages, not invented ones.",
      "",
      'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
        '{"candidates": {"url": string (the real, full URL - MUST be a URL you actually saw in search results, ' +
        'never typed from memory), "title": string, "type": "pdf"|"presentation"|"article", ' +
        '"snippet": string (one sentence on what it covers and why it is useful for this lesson)}[]}. ' +
        "Return as many directly relevant candidates as your search turned up.",
    ].join("\n");

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        }),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = (await response.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
        }[];
      };
      const first = data.candidates?.[0];
      const text = first?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error("Gemini returned no text");
      const parsed = JSON.parse(stripJsonFence(text)) as { candidates?: ResearchCandidateDraft[] };

      // Grounding chunks are the URLs Gemini's search tool actually
      // retrieved - the real source of truth. The model's own "url" field in
      // its JSON is free-form text it typed itself, which it will
      // confidently fabricate to match a well-known site's URL pattern even
      // when it never saw that exact page (that's the bug this guards
      // against) - so a candidate only survives if its URL matches a real
      // grounding chunk, normalized to ignore trivial formatting diffs.
      const groundedChunks = first?.groundingMetadata?.groundingChunks ?? [];
      const groundedByNormalizedUrl = new Map<string, { url: string; title?: string }>();
      for (const chunk of groundedChunks) {
        if (chunk.web?.uri) groundedByNormalizedUrl.set(normalizeUrlForMatch(chunk.web.uri), { url: chunk.web.uri, title: chunk.web.title });
      }

      const draftByNormalizedUrl = new Map<string, ResearchCandidateDraft>();
      for (const draft of parsed.candidates ?? []) {
        if (draft.url) draftByNormalizedUrl.set(normalizeUrlForMatch(draft.url), draft);
      }

      const validTypes = new Set<ResearchCandidateType>(["pdf", "presentation", "article"]);
      const candidates: ResearchCandidateDraft[] = Array.from(groundedByNormalizedUrl.entries())
        .slice(0, 14)
        .map(([normalized, grounded]) => {
          const draft = draftByNormalizedUrl.get(normalized);
          return {
            title: draft?.title || grounded.title || grounded.url,
            url: grounded.url,
            type: draft && validTypes.has(draft.type) ? draft.type : ("article" as ResearchCandidateType),
            snippet: draft?.snippet ?? "",
          };
        });

      if (candidates.length === 0) throw new Error("No grounded candidates in research response");
      return { candidates };
    } catch (err) {
      console.error("[ai] researchContextSources fell back to stub:", err);
      return stubProvider.researchContextSources({ topicName, subject, board });
    }
  }

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

  async generateAssessmentRecommendation(input: AssessmentInsightInput) {
    const { topicName, subject, board, bands, itemAnalysis, totalDoubts } = input;
    const prompt = [
      `A teacher just ran a quick in-class quiz checking understanding of "${topicName}" (${subject}, ${board}).`,
      `Performance bands: ${bands.level_1} scored above 80%, ${bands.level_2} scored 50-80%, ${bands.level_3} scored below 50%.`,
      itemAnalysis.length > 0
        ? "Per-question correct rate:\n" +
          itemAnalysis
            .map(
              (q) =>
                `- "${q.prompt}": ${q.correctRate === null ? "not yet known" : `${Math.round(q.correctRate * 100)}% correct`}` +
                (q.doubtCount > 0 ? `, ${q.doubtCount} student(s) raised doubt on it` : "")
            )
            .join("\n")
        : "",
      totalDoubts > 0 ? `${totalDoubts} doubt(s) were raised across the quiz in total (students pressed "not sure" instead of answering).` : "",
      "",
      'Respond with ONLY a JSON object of this exact shape (no prose, no markdown fences): ' +
        '{"recommendation": string (2-3 sentences, addressed to the teacher, naming the specific weakest ' +
        "question/concept if one stands out, and a concrete next step - re-teach, small-group follow-up, or move on)}.",
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
      const parsed = JSON.parse(stripJsonFence(text)) as { recommendation?: string };
      if (!parsed.recommendation) throw new Error("Malformed assessment recommendation response");
      return { recommendation: parsed.recommendation, model: MODEL_GEMINI_FLASH };
    } catch (err) {
      console.error("[ai] generateAssessmentRecommendation fell back to heuristic:", err);
      return stubProvider.generateAssessmentRecommendation(input);
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
    const allowedTypes = input.questionTypes.length > 0 ? input.questionTypes : ALL_QUESTION_TYPES;
    const typeInstruction =
      allowedTypes.length === 1
        ? `Every question MUST be of type "${allowedTypes[0]}" (${QUESTION_TYPE_LABELS[allowedTypes[0]]}).`
        : `Use a mix of these question types, never any other: ${allowedTypes.map((t) => `"${t}" (${QUESTION_TYPE_LABELS[t]})`).join(", ")}.`;

    const prompt = [
      `You are an experienced ${input.board} curriculum teacher writing an assignment for ${input.classLabel} students in ${input.subject}.`,
      boardGuidance(input.board),
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
        '{"questions": {"prompt": string, "type": "mcq"|"true_false"|"fill_blank"|"very_short"|"short_answer"|"match_following"|"sequencing", ' +
        '"difficulty": "easy"|"medium"|"hard", ' +
        '"options": string[] (ONLY for "mcq": 3-5 items; for "true_false": omit, it is always exactly [true, false]), ' +
        '"correctOptionIndex": number (0-based into options, ONLY for "mcq"/"true_false"), ' +
        '"pairs": {"left": string, "right": string}[] (ONLY for "match_following": 3-5 correct pairs - the app shuffles the right column for the student), ' +
        '"items": string[] (ONLY for "sequencing": 3-5 steps already in their correct order - the app shuffles them for the student), ' +
        '"modelAnswer": string (for "mcq"/"true_false" the exact correct option text; for "fill_blank" the exact word/phrase that fills the blank - phrase the prompt with a literal "___" for the blank; ' +
        'for "very_short" one word or a very short phrase; for "match_following"/"sequencing" a readable summary of the correct answer; otherwise the expected written answer)}[]} ' +
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

  async cleanScrapedArticleText({ rawText, sourceUrl }: CleanArticleTextInput): Promise<{ text: string; model: string }> {
    const NO_CONTENT_SENTINEL = "NO_USABLE_CONTENT";
    const prompt = [
      `The following text was scraped from a web page (${sourceUrl}) and mixes real content with site` +
        " boilerplate - navigation menus, course/category link lists, footers, ads, and cookie notices.",
      "Extract ONLY the substantive article/reference content a teacher would want to read. Copy it " +
        "VERBATIM - do not summarize, paraphrase, or add commentary. Just remove the boilerplate around it.",
      `If nothing usable remains after removing boilerplate, respond with exactly: ${NO_CONTENT_SENTINEL}`,
      "",
      "--- SCRAPED TEXT ---",
      rawText,
    ].join("\n");

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text || text === NO_CONTENT_SENTINEL) return { text: "", model: MODEL_GEMINI_FLASH };
      return { text: text.slice(0, MAX_EXTRACTED_CHARS), model: MODEL_GEMINI_FLASH };
    } catch (err) {
      // Fall back to the raw scrape rather than losing the source entirely
      // over a single failed cleanup call.
      console.error("[ai] cleanScrapedArticleText fell back to raw text:", err);
      return { text: rawText.slice(0, MAX_EXTRACTED_CHARS), model: "raw-fallback" };
    }
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
    presentationTemplate,
    activityGroupSize,
    activityResources,
    learningStages,
    mediaCatalog,
  }: GenerationInput): Promise<{ content: string; model: string }> {
    const audience = classLabel ? `${classLabel} students` : "students";
    const instructions = await getPromptInstructions(outputType);
    const prompt = [
      `You are an experienced ${board} curriculum teacher writing material for ${audience}.`,
      `Topic: ${topicName}`,
      `Subject: ${subject}`,
      `Board: ${board}`,
      boardGuidance(board),
      // Only lesson plans and custom activity reports actually size content
      // around these (explicit durationMinutes / "fit the given minutes"
      // instructions) - presentations and flashcards have no rule tied to
      // them, so including them there was just noise the model might latch
      // onto without any real effect (the mobile setup screen hides these
      // inputs for the same two output types - see GenerationSetupScreen.tsx).
      outputType !== "presentation" && outputType !== "flashcards" ? `Classes covered: ${classCount}` : "",
      outputType !== "presentation" && outputType !== "flashcards" ? `Minutes per class: ${minutesPerClass}` : "",
      outputType === "lesson_plan" && classCount > 1
        ? `This lesson spans ${classCount} separate class periods, so every stage needs a "sessions" array ` +
          `(1 to ${classCount}) saying which period(s) it happens in. Every period from 1 to ${classCount} ` +
          "must be covered by at least one stage, assigned in chronological order (stage order = teaching " +
          "order), with each period's stages roughly filling its minutes-per-class."
        : "",
      `Output language: ${language}`,
      outputType === "presentation"
        ? `Write at a level, and with examples, genuinely appropriate for ${audience} studying ${subject} under ${board} - ` +
          "not generic material that could apply to any grade."
        : "",
      // Without these, the model had no idea how many students would do each
      // activity together or what's physically in the room, so it would
      // suggest group work for a solo activity, or a printed handout with no
      // printer available - this is what the client meant by "random".
      outputType === "custom_activity_report" && activityGroupSize
        ? `Activity group size: ${ACTIVITY_GROUP_SIZE_LABELS[activityGroupSize]}. Design every activity around this ` +
          "group size specifically, not a mix of structures."
        : "",
      outputType === "custom_activity_report"
        ? activityResources && activityResources.length > 0
          ? `Classroom resources available: ${activityResources.map((key) => ACTIVITY_RESOURCE_LABELS[key] ?? key).join(", ")}. ` +
            "Every activity and its materials list must only use what's in this list (or nothing at all, e.g. discussion/verbal " +
            "Q&A) - never assume access to anything not listed here, and never require the teacher to source or print anything " +
            "outside of it."
          : "Classroom resources available: none specified - assume only a whiteboard/blackboard is available. Do not require " +
            "printing, a projector, computers, or any other special equipment."
        : "",
      outputType === "custom_activity_report" && learningStages && learningStages.length > 0
        ? `Learning stage(s) to target: ${learningStages.join(", ")}. Every objective's square-bracket tag must be one of ` +
          `these - do not use any other Bloom's Taxonomy level, and cover each of these stages at least once if there is ` +
          "more than one."
        : "",
      "",
      instructions,
      outputType === "presentation" ? PRESENTATION_TEMPLATE_INSTRUCTIONS[presentationTemplate ?? "detailed"] : "",
      mediaCatalogInstructions(outputType, mediaCatalog),
      "",
      "Return raw JSON only - no preamble, no closing remarks, no markdown code fences around it.",
      // Presentations and flashcards are excluded - neither shape has a real
      // "objective"/"outcome" field, and the model was applying this to slide
      // titles and flashcard fronts instead (e.g. "[Understand] Evolution of
      // Atomic Models" / "[Remember] What is ...?" as literal rendered text),
      // which looks wrong once it's real display text instead of an internal
      // label.
      outputType !== "presentation" && outputType !== "flashcards"
        ? "Wherever the shape includes an objective or outcome, label it with its Bloom's " +
          "Taxonomy level in square brackets immediately before the text (e.g., " +
          "\"[Understand] Explain why...\"). Use only these levels: Remember, Understand, Apply, " +
          "Analyze, Evaluate, Create."
        : "",
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

    // Presentations get an enforced response schema - layout variety and
    // speaker notes are new and easy for prose-only instructions to drift on;
    // every other output type stays on today's prose-instructed JSON.
    // Every other type is still instructed in prose, but asking for JSON mode
    // steers the model to a plain JSON body instead of prose around it.
    const generationConfig =
      outputType === "presentation"
        ? { responseMimeType: "application/json", responseSchema: PRESENTATION_RESPONSE_SCHEMA }
        : { responseMimeType: "application/json" };

    // The model occasionally writes structurally broken JSON (a missing closing
    // brace after a list, say) even in JSON mode - on roughly a third of
    // lesson plans / flashcard sets in testing. Small slips are repaired
    // locally for free; if that isn't enough the call is repeated once, so a
    // teacher isn't shown a failed generation for what is a transient glitch.
    const MAX_ATTEMPTS = 2;
    let parsed: unknown;
    let lastFailure = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], ...(generationConfig ? { generationConfig } : {}) }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`Gemini API request failed (${response.status}): ${errBody}`);
      }

      const data = (await response.json()) as {
        candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      // A long reply can come back split across several parts (and a thinking
      // model may put its reasoning in a separate, flagged part) - reading only
      // the first one could cut the JSON off mid-way.
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("");
      if (!text) {
        throw new Error(`Gemini API returned no generated text${candidate?.finishReason ? ` (finishReason ${candidate.finishReason})` : ""}`);
      }

      try {
        parsed = parseModelJson(text);
        break;
      } catch {
        lastFailure =
          `Gemini returned non-JSON content for outputType "${outputType}" (finishReason ${candidate?.finishReason ?? "unknown"}, ` +
          `${text.length} chars): ${text.slice(0, 200)} ... ${text.slice(-120)}`;
        console.error(`[ai] attempt ${attempt}/${MAX_ATTEMPTS}: ${lastFailure}`);
      }
    }
    if (parsed === undefined) throw new Error(lastFailure);

    if (Array.isArray(parsed)) {
      if (outputType === "flashcards") parsed = { cards: parsed };
      else if (outputType === "presentation") parsed = { slides: parsed };
      // The model often returns just the list of activities; wrap it in the
      // shape the app expects rather than handing back something the viewer
      // can't read (and that nothing, e.g. attached media, can be added to).
      else if (outputType === "custom_activity_report") parsed = { objective: `Activities for ${topicName}`, activities: parsed, reportFormat: "" };
      else if (outputType === "lesson_plan") {
        // Sometimes the plan itself comes back wrapped in a list next to an
        // extra object (e.g. a school-format "reviewed by" block). Keep the
        // real plan and fold the extras into it.
        const objects = (parsed as unknown[]).filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o));
        const plan = objects.find((o) => Array.isArray(o.stages) || Array.isArray(o.objectives));
        if (plan) parsed = Object.assign({}, ...objects.filter((o) => o !== plan), plan);
      }
    }
    // Set in code, not trusted to the model's own JSON - "5e" is the only
    // structure today; a future second structure would pass its id through
    // here instead of hardcoding it.
    if (outputType === "lesson_plan" && parsed && typeof parsed === "object") {
      (parsed as Record<string, unknown>).structureType = "5e";
    }
    // template is set in code, not trusted to the model's own JSON - colors
    // are applied separately, after this call returns (see
    // applyPresentationTemplateExtras in routes/generations.ts).
    if (outputType === "presentation" && parsed && typeof parsed === "object") {
      (parsed as Record<string, unknown>).template = presentationTemplate ?? "detailed";
    }

    return { content: JSON.stringify(parsed), model: MODEL_GEMINI_FLASH };
  }

  async assistantStep({ contents, systemPrompt, tools }: AssistantStepInput) {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        ...(tools.length
          ? {
              tools: [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    ...(t.parameters && Object.keys(t.parameters.properties).length ? { parameters: t.parameters } : {}),
                  })),
                },
              ],
            }
          : {}),
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = (await response.json()) as { candidates?: { content?: { parts?: AssistantPart[] } }[] };
    // Returned parts are passed straight back into the next request's contents,
    // untouched - Gemini may attach extra fields (e.g. thought signatures) that
    // must be echoed for a function-calling turn to stay valid.
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    if (!parts.length) throw new Error("Gemini returned no content");
    return { parts, model: MODEL_GEMINI_FLASH };
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
  const status = params.status ?? "success";
  const log = await prisma.aiUsageLog.create({
    data: {
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      feature: params.feature,
      model: params.model,
      status,
      durationMs: params.durationMs,
    },
  });

  // Only successful calls are charged - callers are expected to have already
  // pre-flight-checked hasSufficientCredits() before making the AI provider
  // call in the first place (see the per-route pre-flight checks). See
  // Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
  // credits.md.
  if (status === "success") {
    const cost = await getFeatureCost(params.feature);
    await deductCredits(params.teacherUserId, cost, { feature: params.feature, aiUsageLogId: log.id });
  }
}
