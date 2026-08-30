import { test } from "node:test";
import assert from "node:assert/strict";
import { stubProvider, GenerationInput } from "./ai";

// Test the offline stub directly - it is the dev default and the offline
// fallback, and the frontend's parseGenerationContent relies on this JSON shape.
const aiProvider = stubProvider;

const baseInput: Omit<GenerationInput, "outputType"> = {
  topicName: "Photosynthesis",
  subject: "Biology",
  board: "CBSE",
  classCount: 2,
  minutesPerClass: 45,
  language: "English",
};

test("stub describeImageForContext returns empty text (nothing to store)", async () => {
  const result = await aiProvider.describeImageForContext({ fileLocation: "x.png" });
  assert.equal(result.text, "");
});

test("stub generateContent(lesson_plan) is JSON the frontend parser accepts", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "lesson_plan" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.objectives));
  assert.ok(Array.isArray(parsed.activities));
  assert.ok(Array.isArray(parsed.lessonFlow));
  assert.equal(parsed.durationMinutes, 90);
});

test("stub generateContent(flashcards) is JSON with a cards array", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "flashcards" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.cards));
  assert.ok(parsed.cards.length > 0);
});

test("stub generateContent(presentation) is JSON with a slides array", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "presentation" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.slides));
});

test("stub generateContent(custom_activity_report) has objective + activities + reportFormat", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "custom_activity_report" });
  const parsed = JSON.parse(content);
  assert.equal(typeof parsed.objective, "string");
  assert.ok(Array.isArray(parsed.activities));
  assert.equal(typeof parsed.reportFormat, "string");
});
