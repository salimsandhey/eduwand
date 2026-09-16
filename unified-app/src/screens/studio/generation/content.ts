
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
  durationMinutes: number;
  objectives: string[];
  // New shape (all generations going forward): activities nested under the
  // stage they happen in. Legacy fields below stay optional so old
  // Generation rows (permanent, never rewritten) still render.
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
  cards: {
    front: string;
    back: string;
    // Optional - old generations predate this field. 2-3 short key terms
    // from the answer, shown as a small connected icon row on the back
    // (icon picked locally by keyword-matching each term - see topicIcons.ts).
    keyTerms?: string[];
  }[];
}

// "school_format" and "more_visual" are legacy - no longer selectable
// (branding applies by default now, and presentations no longer use stock
// photos - see GenerationSetupScreen.tsx), kept only so old generations
// still parse/render.
export type PresentationTemplate = "detailed" | "instructional" | "school_format" | "more_visual";
// Legacy-only fallback (pre branding-sourced colors).
export type PresentationColorScheme = "indigo" | "coral" | "forest" | "slate";
export type PresentationSlideLayout = "title" | "bullets" | "stat" | "quote" | "divider" | "stat-grid" | "timeline" | "icon-grid";

export interface PresentationContent {
  type: "presentation";
  template?: PresentationTemplate;
  colorScheme?: PresentationColorScheme;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  footerLabel?: string | null;
  slides: {
    // Optional - old generations predate this field; readers default to
    // "bullets" (or "image-right" when imageUrl is present) when absent.
    layout?: PresentationSlideLayout;
    title: string;
    bullets: string[];
    notes?: string;
    // Legacy only - no longer set on new generations (no more stock photos),
    // kept so old "more_visual" rows with a saved photo still render.
    imageUrl?: string;
    // Used by "stat-grid", "timeline", and "icon-grid" - see the matching
    // comment in backend/src/lib/ai.ts's PresentationContent.
    items?: { title: string; description?: string; tag?: string }[];
  }[];
}

export type StructuredGenerationContent =
  | LessonPlanContent
  | CustomActivityContent
  | FlashcardsContent
  | PresentationContent;

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
