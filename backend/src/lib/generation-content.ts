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
  activities: { title: string; description: string; materials: string[] }[];
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
  activities?: { title: string; description: string; durationMinutes: number; materials: string[] }[];
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
  return typeof v?.objective === "string" && Array.isArray(v?.activities) && typeof v?.reportFormat === "string";
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

  const addObjective = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seenObjective.has(key)) return;
    seenObjective.add(key);
    objectives.push(trimmed);
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
            lines.push(...stage.activities.map((a) => `${a.title}: ${a.description}`));
          }
        } else if (content.activities) {
          lines.push(...content.activities.map((a) => `${a.title}: ${a.description}`));
        }
        if (content.assessment) lines.push(`Assessment: ${content.assessment}`);
        break;
      case "custom_activity_report":
        addObjective(content.objective);
        lines.push(`Objective: ${content.objective}`);
        lines.push(...content.activities.map((a) => `${a.title}: ${a.description}`));
        if (content.reportFormat) lines.push(`Report format: ${content.reportFormat}`);
        break;
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
