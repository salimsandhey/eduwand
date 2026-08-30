
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
