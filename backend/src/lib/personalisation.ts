// Shared types/helpers for the "Personalise for each student" feature.
// Personalisation ADDS an extra, difficulty-matched section of questions on
// top of an assignment's own (always-full, teacher-reviewed) question set -
// it never filters or subsets the assignment's own questions. The extra
// questions themselves are generated once (per student) at
// POST /assignments/:id/personalisation-suggestions and stored on
// PersonalisationSuggestion.extraQuestions - see backend/src/routes/
// assignments.ts's generateExtraQuestions/buildExtraQuestionGenInput.

export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface DifficultyTaggedQuestion {
  id: string;
  prompt: string;
  type?: string;
  difficulty?: string;
  // Carried through for AI-generated multiple-choice questions so grading can
  // settle them by exact option match (see lib/ai.ts settleMcqQuestions).
  options?: string[];
  correctOptionIndex?: number;
}

const DIFFICULTIES: QuestionDifficulty[] = ["easy", "medium", "hard"];

export function summariseMix(mix: Record<string, number>): string {
  return DIFFICULTIES.filter((d) => (mix[d] ?? 0) > 0)
    .map((d) => `${mix[d]} ${d}`)
    .join(", ");
}
