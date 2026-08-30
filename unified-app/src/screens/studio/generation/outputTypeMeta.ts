import { Ionicons } from "@expo/vector-icons";
import { GenerationOutputType } from "../../../api/client";

// Single source of truth for how each output type is labelled/iconed, so the
// label is consistent everywhere the type appears (setup screen, review
// screen, generated-content screen).
export const OUTPUT_TYPE_ORDER: GenerationOutputType[] = [
  "lesson_plan",
  "custom_activity_report",
  "flashcards",
  "presentation",
];

export const OUTPUT_TYPE_LABELS: Record<GenerationOutputType, string> = {
  lesson_plan: "Lesson plan",
  custom_activity_report: "Activity report",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

export const OUTPUT_TYPE_CAPTIONS: Record<GenerationOutputType, string> = {
  lesson_plan: "Structured class flow",
  custom_activity_report: "Activity plus teacher report",
  flashcards: "Quick recall practice",
  presentation: "Slide deck for class",
};

export const OUTPUT_TYPE_ICONS: Record<GenerationOutputType, keyof typeof Ionicons.glyphMap> = {
  lesson_plan: "school-outline",
  custom_activity_report: "compass-outline",
  flashcards: "albums-outline",
  presentation: "easel-outline",
};
