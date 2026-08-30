import { test } from "node:test";
import assert from "node:assert/strict";
import { selectQuestionsForMix } from "./personalisation";

const questions = [
  { id: "q1", prompt: "easy 1", difficulty: "easy" },
  { id: "q2", prompt: "medium 1", difficulty: "medium" },
  { id: "q3", prompt: "hard 1", difficulty: "hard" },
  { id: "q4", prompt: "easy 2", difficulty: "easy" },
  { id: "q5", prompt: "medium 2", difficulty: "medium" },
];

test("null mix returns every question unchanged", () => {
  assert.deepEqual(selectQuestionsForMix(questions, null), questions);
});

test("selects up to the requested count per difficulty, preserving original order", () => {
  const result = selectQuestionsForMix(questions, { easy: 1, medium: 1, hard: 0 });
  assert.deepEqual(
    result.map((q) => q.id),
    ["q1", "q2"]
  );
});

test("asking for more than exist at a difficulty returns all of that difficulty, no backfill", () => {
  const result = selectQuestionsForMix(questions, { easy: 5, medium: 0, hard: 0 });
  assert.deepEqual(
    result.map((q) => q.id),
    ["q1", "q4"]
  );
});

test("a mix with every count zero falls back to the full question set instead of an empty assignment", () => {
  const result = selectQuestionsForMix(questions, { easy: 0, medium: 0, hard: 0 });
  assert.deepEqual(result, questions);
});

test("questions with no difficulty tag are treated as medium", () => {
  const untagged = [{ id: "u1", prompt: "no tag" }];
  assert.deepEqual(selectQuestionsForMix(untagged, { easy: 0, medium: 1, hard: 0 }), untagged);
  assert.deepEqual(selectQuestionsForMix(untagged, { easy: 1, medium: 0, hard: 0 }), []);
});
