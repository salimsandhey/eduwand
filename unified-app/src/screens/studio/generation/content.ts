
export type LessonPlanStructureType = "5e";

export interface LessonPlanStage {
  stage: string;
  durationMinutes: number;
  summary: string;
  // New generations return a short array of steps (rendered as bullets);
  // older, already-generated rows still have one prose string and keep
  // rendering as a single paragraph - see ActivityDescription in
  // LessonPlanView.tsx.
  activities: { title: string; description: string | string[]; materials: string[] }[];
  // Which class period(s) this stage happens in, when the lesson spans more
  // than one class - omitted for the common single-class case.
  sessions?: number[];
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
  activities?: { title: string; description: string | string[]; durationMinutes: number; materials: string[] }[];
  assessment: string;
}

export interface CustomActivityContent {
  type: "custom_activity_report";
  // Legacy (pre-Learning Stage picker) generations only - new ones use
  // `objectives` instead. Both optional so either shape renders.
  objective?: string;
  objectives?: string[];
  activities: { title: string; description: string | string[]; durationMinutes: number; materials: string[] }[];
  reportFormat: string | string[];
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

// New presentation flow (PPT guidelines.pdf) - mirrored manually from
// backend/src/lib/ai.ts, same "small duplicated table" convention already
// used elsewhere in this app (mobile can't import a backend file).
export type PresentationReason = "concept_deck" | "activity_walkthrough" | "revision_deck";
export type PresentationDensity = "light" | "balanced" | "dense";
export type PresentationSlideRole =
  | "title" | "hook" | "define" | "explain_core" | "worked_example" | "check" | "recap"
  | "aim" | "materials" | "safety" | "step" | "record" | "expected_result" | "conclusion"
  | "whats_covered" | "must_know" | "common_mistakes" | "rapid_fire" | "answer_key"
  | "section_divider" | "recap_bridge";

export const PRESENTATION_REASON_LABELS: Record<PresentationReason, { label: string; caption: string }> = {
  concept_deck: { label: "Teaching this for the first time", caption: "A new chapter or sub-topic. The default." },
  activity_walkthrough: { label: "Running an activity or experiment", caption: "Practicals, lab work, classroom activities" },
  revision_deck: { label: "Revising before a test", caption: "End of chapter, pre-exam recap" },
};
export const PRESENTATION_DENSITY_LABELS: Record<PresentationDensity, { label: string; caption: string }> = {
  light: { label: "Light", caption: "Headline points only" },
  balanced: { label: "Balanced", caption: "The default - enough to teach from" },
  dense: { label: "Dense", caption: "Full detail, reference-ready" },
};

// Spec step 6's live per-class slide-count band - mirrored from
// backend/src/lib/presentationPlan.ts's slidesPerClassRange.
export function slidesPerClassRange(classes: number): { min: number; max: number } {
  if (classes <= 1) return { min: 8, max: 12 };
  if (classes === 2) return { min: 7, max: 10 };
  return { min: 5, max: 8 };
}

export type PresentationSlideLayout =
  | "title" | "bullets" | "stat" | "quote" | "divider" | "stat-grid" | "timeline" | "icon-grid" | "image"
  | "big_statement" | "definition" | "compare_2col" | "process_flow" | "step" | "card_grid" | "table" | "callout"
  | "recap_bridge" | "closing_recap";

// An image, or one page of a PDF, the teacher chose to show as-is in generated
// content (see backend/src/lib/media.ts). Loaded from the topic's source via
// api.contextMediaUrl.
export interface MediaItem {
  id: string;
  sourceId: string;
  kind: "image" | "pdf_page";
  page?: number;
  caption: string;
  attribution: string | null;
}

// Media attached to any generated output (a presentation shows it on image
// slides; the other output types list it as attached material).
export function getAttachedMedia(raw: string | null | undefined): MediaItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { media?: unknown };
    return Array.isArray(parsed.media) ? (parsed.media as MediaItem[]) : [];
  } catch {
    return [];
  }
}

export interface PresentationContent {
  type: "presentation";
  template?: PresentationTemplate;
  colorScheme?: PresentationColorScheme;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  footerLabel?: string | null;
  // The images / PDF pages shown as-is on "image" slides (each slide's mediaId
  // points at an entry here).
  media?: MediaItem[];
  slides: {
    // Only on layout "image".
    mediaId?: string;
    // Optional - old generations predate this field; readers default to
    // "bullets" (or "image-right" when imageUrl is present) when absent.
    layout?: PresentationSlideLayout;
    // Which role this slide fills (new flow only - absent on legacy rows).
    role?: PresentationSlideRole;
    // 0-indexed class period this slide belongs to (new flow, multi-class
    // decks only).
    classIndex?: number;
    title: string;
    bullets: string[];
    notes?: string;
    // Legacy only - no longer set on new generations (no more stock photos),
    // kept so old "more_visual" rows with a saved photo still render.
    imageUrl?: string;
    // Used by "stat-grid", "timeline", "icon-grid", and "card_grid" - see the
    // matching comment in backend/src/lib/ai.ts's PresentationContent.
    items?: { title: string; description?: string; tag?: string }[];
    // "compare_2col": two labelled columns of short lines.
    columns?: { heading: string; rows: string[] }[];
    // "table": a simple grid - header row + data rows.
    table?: { headers: string[]; rows: string[][] };
    // "step": one action per slide with a progress indicator.
    stepIndex?: number;
    stepTotal?: number;
    // "callout": a flagged warning/note (used by the "safety" role).
    calloutIcon?: string;
    calloutBody?: string;
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
