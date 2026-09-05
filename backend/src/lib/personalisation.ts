// Turns a PersonalisationSuggestion's appliedMix into the actual subset of
// questions a student is shown. Previously the mix was computed and decided
// but never consumed anywhere - this is the missing link (see
// Docs review 28 Aug 2026: "personalisation is inert").
//
// Deterministic and side-effect free so the same (questions, mix) always
// resolves to the same subset - called once when the student fetches their
// assignment list and again when the teacher grades their submission, and
// the two must agree without persisting the chosen subset anywhere.

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

function normaliseDifficulty(value: string | undefined): QuestionDifficulty {
  return value === "easy" || value === "hard" ? value : "medium";
}

// mix: counts of {easy, medium, hard} questions to deliver. Any difficulty
// not present (or falsy) contributes zero questions. When a bucket asks for
// more than exist at that difficulty, the student simply gets all of them -
// no backfill from other buckets, so what a teacher approves is exactly what
// gets delivered, never padded out with unrelated difficulty questions.
// Original relative order is preserved within and across buckets.
export function selectQuestionsForMix<T extends DifficultyTaggedQuestion>(
  questions: T[],
  mix: Record<string, number> | null | undefined
): T[] {
  if (!mix) return questions;

  const remaining: Record<QuestionDifficulty, number> = {
    easy: Math.max(0, Math.floor(mix.easy ?? 0)),
    medium: Math.max(0, Math.floor(mix.medium ?? 0)),
    hard: Math.max(0, Math.floor(mix.hard ?? 0)),
  };

  // A mix that requests nothing at all (every count 0, or an empty object)
  // reads as "no restriction specified" rather than "deliver zero
  // questions" - treated the same as no mix. A mix that requests specific
  // difficulties that just don't exist in this question set is a genuine,
  // if unlucky, empty result and is returned as such (not silently padded
  // back out to the full set).
  if (remaining.easy + remaining.medium + remaining.hard === 0) return questions;

  const result: T[] = [];
  for (const q of questions) {
    const difficulty = normaliseDifficulty(q.difficulty);
    if (remaining[difficulty] > 0) {
      remaining[difficulty] -= 1;
      result.push(q);
    }
  }
  return result;
}

export function summariseMix(mix: Record<string, number>): string {
  return DIFFICULTIES.filter((d) => (mix[d] ?? 0) > 0)
    .map((d) => `${mix[d]} ${d}`)
    .join(", ");
}
