// Structured content shapes emitted by the backend for each Generation
// outputType (backend/src/lib/ai.ts - keep in sync). Generation.aiOutput/
// editedOutput are plain strings; these are JSON.stringify'd into that
// string. Generations created before this existed are plain Markdown text,
// not JSON, so parseGenerationContent must fail soft on those, never throw.

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

function isLessonPlan(v: any): boolean {
  return Array.isArray(v?.objectives) && Array.isArray(v?.activities) && Array.isArray(v?.lessonFlow);
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

// The known outputType (from the Generation record itself, e.g.
// generation.outputType) drives which shape to validate against - the model
// is never trusted to self-report a "type" field, since it's easy for a
// prompt to produce an otherwise-correct object that just omits it. Returns
// null (never throws) for legacy plain-text generations, or JSON that
// doesn't structurally match the expected shape - callers fall back to the
// raw-text/Markdown view.
export function parseGenerationContent(
  outputType: string,
  raw: string
): StructuredGenerationContent | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // A generation stored before the backend started normalizing this (or any
  // future model slip) may be a bare array instead of the documented
  // {cards: [...]} / {slides: [...]} wrapper - accepted here too rather than
  // falling back to plain text for content that's otherwise perfectly usable.
  if (Array.isArray(parsed)) {
    if (outputType === "flashcards") parsed = { cards: parsed };
    else if (outputType === "presentation") parsed = { slides: parsed };
  }

  if (outputType === "lesson_plan" && isLessonPlan(parsed)) {
    return { ...parsed, type: "lesson_plan" };
  }
  if (outputType === "custom_activity_report" && isCustomActivity(parsed)) {
    return { ...parsed, type: "custom_activity_report" };
  }
  if (outputType === "flashcards" && isFlashcards(parsed)) {
    return { ...parsed, type: "flashcards" };
  }
  if (outputType === "presentation" && isPresentation(parsed)) {
    return { ...parsed, type: "presentation" };
  }
  return null;
}
