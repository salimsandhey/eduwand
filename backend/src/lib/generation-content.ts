// Backend-side parser for the structured JSON a Generation stores in
// aiOutput/editedOutput. Mirrors the client's
// unified-app/src/screens/studio/generation/content.ts so both sides read
// the same shapes. Used by the "Generate assignment with AI" flow to turn a
// topic's lesson generations into plain "what was taught" text.

import { ContextSource } from "@prisma/client";

export type LessonPlanStructureType = "5e";

export interface LessonPlanStage {
  stage: string;
  durationMinutes: number;
  summary: string;
  // New generations return a short array of steps; older rows (permanent,
  // never rewritten) still have one prose string - both parse and flatten
  // fine below (see describeActivity).
  activities: { title: string; description: string | string[]; materials: string[] }[];
  sessions?: number[];
}

export interface LessonPlanContent {
  type: "lesson_plan";
  overview: string;
  objectives: string[];
  // New shape (all generations going forward): activities nested under the
  // stage they happen in. Legacy fields below stay optional so old
  // Generation rows (permanent, never rewritten) still parse.
  structureType?: LessonPlanStructureType;
  stages?: LessonPlanStage[];
  // Legacy shape (pre-5E-restructure generations only).
  lessonFlow?: { label: string; durationMinutes: number }[];
  activities?: { title: string; description: string | string[]; durationMinutes: number; materials: string[] }[];
  assessment: string;
}

export interface CustomActivityContent {
  type: "custom_activity_report";
  // Legacy (pre-Learning Stage picker) generations only; new ones use
  // `objectives` instead - see ai.ts's CustomActivityContent.
  objective?: string;
  objectives?: string[];
  activities: { title: string; description: string | string[]; durationMinutes: number; materials: string[] }[];
  reportFormat: string | string[];
}

export interface FlashcardsContent {
  type: "flashcards";
  cards: { front: string; back: string }[];
}

export interface PresentationContent {
  type: "presentation";
  template?: "detailed" | "instructional";
  colorScheme?: "indigo" | "coral" | "forest" | "slate";
  slides: { title: string; bullets: string[] }[];
}

export type StructuredGenerationContent =
  | LessonPlanContent
  | CustomActivityContent
  | FlashcardsContent
  | PresentationContent;

/* eslint-disable @typescript-eslint/no-explicit-any */
function isLessonPlan(v: any): boolean {
  if (!Array.isArray(v?.objectives)) return false;
  if (Array.isArray(v?.stages)) return true; // new shape
  return Array.isArray(v?.activities) && Array.isArray(v?.lessonFlow); // legacy shape
}
function isCustomActivity(v: any): boolean {
  const hasObjective = typeof v?.objective === "string" || Array.isArray(v?.objectives);
  const hasReportFormat = typeof v?.reportFormat === "string" || Array.isArray(v?.reportFormat);
  return hasObjective && Array.isArray(v?.activities) && hasReportFormat;
}
function isFlashcards(v: any): boolean {
  return Array.isArray(v?.cards);
}
function isPresentation(v: any): boolean {
  return Array.isArray(v?.slides);
}

export function parseGenerationContent(outputType: string, raw: string): StructuredGenerationContent | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    if (outputType === "flashcards") parsed = { cards: parsed };
    else if (outputType === "presentation") parsed = { slides: parsed };
  }

  if (outputType === "lesson_plan" && isLessonPlan(parsed)) return { ...parsed, type: "lesson_plan" };
  if (outputType === "custom_activity_report" && isCustomActivity(parsed)) return { ...parsed, type: "custom_activity_report" };
  if (outputType === "flashcards" && isFlashcards(parsed)) return { ...parsed, type: "flashcards" };
  if (outputType === "presentation" && isPresentation(parsed)) return { ...parsed, type: "presentation" };
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const BLOOMS_PREFIX = /^\[(Remember|Understand|Apply|Analyze|Evaluate|Create)\]\s*/i;

// Common words that don't help tell two objectives apart - excluded from the
// near-duplicate word-overlap check below.
const OBJECTIVE_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "and", "in", "on", "for", "that", "this",
  "with", "is", "are", "was", "were", "be", "how", "why", "what", "their",
  "students", "student", "will", "can", "by", "at", "as", "it", "its",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !OBJECTIVE_STOPWORDS.has(w))
  );
}

// Two objectives phrased differently ("Explain the causes of X" vs. "Describe
// why X occurred") but covering the same ground - a plain Jaccard overlap on
// their significant words is enough to catch this without an extra AI call.
function isNearDuplicateObjective(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let overlap = 0;
  for (const word of a) if (b.has(word)) overlap++;
  const union = a.size + b.size - overlap;
  return union > 0 && overlap / union >= 0.6;
}

// "Students will be able to explain X" is a valid SWBAT-style objective, but
// reads inconsistently next to the app's terse "[Bloom] Explain X" form -
// normalize it down to just the capability, the same shape everything else
// is in.
const SWBAT_PREFIX = /^students?\s+(will|should|shall)\s+be\s+able\s+to\s+/i;

// A model asked for "objectives" sometimes writes an assessment task/prompt
// into that field instead ("Give an example of...", "Identify at least
// three... and name..."). Those read as instructions addressed to the
// student, not statements of what the student will understand or be able to
// do, and don't belong in this list.
// These verbs are pure test/quiz-instruction boilerplate ("Choose the
// correct answer...", "Circle the odd one out...") - essentially never how a
// real learning objective is phrased, so they're dropped on their own.
const ALWAYS_TASK_VERB_RE = /^(choose|select|circle|underline|fill\s+in)\b/i;
// These verbs are also common, legitimate Bloom's-level objective verbs
// ("Identify the causes of...", "Solve linear equations", "Match each event
// to its century") - only treated as a task instruction when corroborated by
// a second signal (direct address, or a "give me N of these" quantifier).
const SOFT_TASK_VERB_RE = /^(give|identify|list|name|state|provide|find|show|write|draw|complete|solve|calculate|match)\b/i;
const DIRECT_ADDRESS_RE = /\byou(r)?\b/i;
// No digit requirement - "at least three" is just as much a quantifier as
// "at least 3".
const QUANTIFIER_RE = /\bat least\b/i;

function looksLikeTaskNotObjective(text: string): boolean {
  if (text.trim().endsWith("?")) return true;
  if (ALWAYS_TASK_VERB_RE.test(text)) return true;
  if (!SOFT_TASK_VERB_RE.test(text)) return false;
  return DIRECT_ADDRESS_RE.test(text) || QUANTIFIER_RE.test(text);
}

function describeActivity(description: string | string[]): string {
  return Array.isArray(description) ? description.join("; ") : description;
}

export interface GenerationForTaughtContent {
  outputType: string;
  aiOutput: string;
  editedOutput: string | null;
  generationStatus: string;
}

const MAX_TAUGHT_CONTENT_CHARS = 12000;

// Turns a topic's succeeded generations into a plain-text summary of what was
// taught, plus the distinct Bloom's-tagged objectives found across them.
// Generations are considered newest-first (pass them in that order).
export function buildTaughtContentText(generations: GenerationForTaughtContent[]): {
  text: string;
  objectives: string[];
} {
  const blocks: string[] = [];
  const objectives: string[] = [];
  const seenObjective = new Set<string>();
  const keptObjectiveWords: Set<string>[] = [];

  const addObjective = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Dedup on the text alone, not the raw [Bloom] tag - two generation runs
    // producing the identical objective under different Bloom levels (e.g.
    // "[Remember] Explain photosynthesis" and "[Understand] Explain
    // photosynthesis") must collapse to one, since the tag is stripped
    // before this ever reaches the teacher anyway (see the return below).
    let stripped = trimmed.replace(BLOOMS_PREFIX, "").replace(SWBAT_PREFIX, "").trim();
    if (!stripped) return;
    // The SWBAT prefix ("Students will be able to ") leaves its verb
    // lowercase ("...to explain X") - capitalize so the objective reads as
    // its own sentence once the prefix is gone.
    stripped = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    if (looksLikeTaskNotObjective(stripped)) return;
    const key = stripped.toLowerCase();
    if (seenObjective.has(key)) return;

    // Also catch a paraphrase of an objective already kept from an earlier
    // (separate) generation run - the model never sees a topic's prior
    // objectives when writing a new one, so near-duplicates across runs are
    // otherwise common.
    const words = significantWords(stripped);
    if (keptObjectiveWords.some((existing) => isNearDuplicateObjective(words, existing))) return;

    seenObjective.add(key);
    keptObjectiveWords.push(words);
    // Re-attach the Bloom tag (if any) to the normalized text, so the
    // pushed/returned objective still carries it for the "Objective: ..."
    // lines in the taught-content text, even though the SWBAT prefix is gone.
    const bloomTag = trimmed.match(BLOOMS_PREFIX)?.[0] ?? "";
    objectives.push(`${bloomTag}${stripped}`);
  };

  for (const gen of generations) {
    if (gen.generationStatus !== "succeeded") continue;
    const content = parseGenerationContent(gen.outputType, gen.editedOutput ?? gen.aiOutput);
    if (!content) continue;

    const lines: string[] = [];
    switch (content.type) {
      case "lesson_plan":
        lines.push(content.overview);
        content.objectives.forEach(addObjective);
        lines.push(...content.objectives.map((o) => `Objective: ${o}`));
        if (content.stages) {
          for (const stage of content.stages) {
            lines.push(`${stage.stage}: ${stage.summary}`);
            lines.push(...stage.activities.map((a) => `${a.title}: ${describeActivity(a.description)}`));
          }
        } else if (content.activities) {
          lines.push(...content.activities.map((a) => `${a.title}: ${describeActivity(a.description)}`));
        }
        if (content.assessment) lines.push(`Assessment: ${content.assessment}`);
        break;
      case "custom_activity_report": {
        const objectives = content.objectives ?? (content.objective ? [content.objective] : []);
        objectives.forEach(addObjective);
        lines.push(...objectives.map((o) => `Objective: ${o}`));
        lines.push(...content.activities.map((a) => `${a.title}: ${describeActivity(a.description)}`));
        if (content.reportFormat) lines.push(`Report format: ${describeActivity(content.reportFormat)}`);
        break;
      }
      case "flashcards":
        lines.push(...content.cards.map((c) => `Q: ${c.front} A: ${c.back}`));
        break;
      case "presentation":
        lines.push(...content.slides.map((s) => `${s.title}: ${s.bullets.join("; ")}`));
        break;
    }

    const block = lines.filter(Boolean).join("\n").trim();
    if (block) blocks.push(block);
  }

  return {
    text: blocks.join("\n\n---\n\n").slice(0, MAX_TAUGHT_CONTENT_CHARS),
    objectives: objectives.map((o) => o.replace(BLOOMS_PREFIX, "").trim()).filter(Boolean),
  };
}

// Fallback when a topic has no succeeded generations: use the extracted text
// of its context sources instead, same 12k cap.
export function buildContextSourceText(contextSources: ContextSource[]): string {
  const used = contextSources.filter((s) => s.extractionStatus === "extracted" && s.extractedText);
  return used
    .map((s) => s.extractedText)
    .join("\n\n---\n\n")
    .slice(0, MAX_TAUGHT_CONTENT_CHARS);
}
