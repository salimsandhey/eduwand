import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaughtContentText, GenerationForTaughtContent } from "./generation-content";

function gen(overrides: Partial<GenerationForTaughtContent> & { outputType: string; aiOutput: string }): GenerationForTaughtContent {
  return { editedOutput: null, generationStatus: "succeeded", ...overrides };
}

test("buildTaughtContentText ignores failed generations", () => {
  const { text } = buildTaughtContentText([
    gen({ outputType: "lesson_plan", aiOutput: "not json", generationStatus: "failed" }),
  ]);
  assert.equal(text, "");
});

test("buildTaughtContentText pulls overview + objectives + activities from a lesson plan", () => {
  const lessonPlan = {
    overview: "Students explore photosynthesis.",
    objectives: ["[Understand] Explain photosynthesis"],
    lessonFlow: [],
    activities: [{ title: "Warm-up", description: "Discuss what plants need to grow", durationMinutes: 5, materials: [] }],
    assessment: "Exit ticket",
  };
  const { text, objectives } = buildTaughtContentText([
    gen({ outputType: "lesson_plan", aiOutput: JSON.stringify(lessonPlan) }),
  ]);
  assert.match(text, /Students explore photosynthesis/);
  assert.match(text, /Warm-up: Discuss what plants need to grow/);
  assert.deepEqual(objectives, ["Explain photosynthesis"]);
});

test("buildTaughtContentText prefers editedOutput over aiOutput", () => {
  const original = { overview: "original", objectives: [], lessonFlow: [], activities: [], assessment: "" };
  const edited = { overview: "edited by teacher", objectives: [], lessonFlow: [], activities: [], assessment: "" };
  const { text } = buildTaughtContentText([
    gen({ outputType: "lesson_plan", aiOutput: JSON.stringify(original), editedOutput: JSON.stringify(edited) }),
  ]);
  assert.match(text, /edited by teacher/);
  assert.doesNotMatch(text, /^original$/);
});

test("buildTaughtContentText dedupes objectives case-insensitively across generations", () => {
  const plan = (overview: string) => ({
    overview,
    objectives: ["[Understand] Explain photosynthesis", "[understand] EXPLAIN PHOTOSYNTHESIS"],
    lessonFlow: [],
    activities: [],
    assessment: "",
  });
  const { objectives } = buildTaughtContentText([
    gen({ outputType: "lesson_plan", aiOutput: JSON.stringify(plan("a")) }),
    gen({ outputType: "lesson_plan", aiOutput: JSON.stringify(plan("b")) }),
  ]);
  assert.equal(objectives.length, 1);
});

test("buildTaughtContentText handles flashcards and presentations", () => {
  const { text } = buildTaughtContentText([
    gen({ outputType: "flashcards", aiOutput: JSON.stringify({ cards: [{ front: "Q1", back: "A1" }] }) }),
    gen({ outputType: "presentation", aiOutput: JSON.stringify({ slides: [{ title: "Slide 1", bullets: ["point a"] }] }) }),
  ]);
  assert.match(text, /Q1/);
  assert.match(text, /Slide 1: point a/);
});

test("buildTaughtContentText returns empty text for unparseable content", () => {
  const { text, objectives } = buildTaughtContentText([gen({ outputType: "lesson_plan", aiOutput: "not json at all" })]);
  assert.equal(text, "");
  assert.deepEqual(objectives, []);
});
