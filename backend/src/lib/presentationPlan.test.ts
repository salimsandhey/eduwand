import { test } from "node:test";
import assert from "node:assert/strict";
import { slidesPerClassRange, buildRoleSequence } from "./presentationPlan";

test("slidesPerClassRange returns the spec's bands per class count", () => {
  assert.deepEqual(slidesPerClassRange(1), { min: 8, max: 12 });
  assert.deepEqual(slidesPerClassRange(2), { min: 7, max: 10 });
  assert.deepEqual(slidesPerClassRange(3), { min: 5, max: 8 });
});

test("buildRoleSequence expands variable-count roles to fit the target slide count for a single class", () => {
  const seq = buildRoleSequence({ reason: "concept_deck", totalSlides: 10, classes: 1 });
  assert.equal(seq.length, 10);
  assert.deepEqual(seq[0], { role: "title", classIndex: 0 });
  assert.ok(seq.every((s) => s.classIndex === 0));
});

test("buildRoleSequence splits across classes and inserts section_divider + recap_bridge for multi-class decks", () => {
  const seq = buildRoleSequence({ reason: "concept_deck", totalSlides: 16, classes: 2 });
  const classTwoStart = seq.findIndex((s) => s.classIndex === 1);
  assert.ok(classTwoStart > 0);
  assert.equal(seq[classTwoStart - 1].role, "section_divider");
  assert.equal(seq[classTwoStart].role, "recap_bridge");
});

test("buildRoleSequence keeps the activity_walkthrough safety role even at the smallest slide count", () => {
  const seq = buildRoleSequence({ reason: "activity_walkthrough", totalSlides: 8, classes: 1 });
  assert.ok(seq.some((s) => s.role === "safety"));
});

test("buildRoleSequence expands revision_deck's rapid_fire toward its 5-10 band", () => {
  const seq = buildRoleSequence({ reason: "revision_deck", totalSlides: 12, classes: 1 });
  const rapidFireCount = seq.filter((s) => s.role === "rapid_fire").length;
  assert.ok(rapidFireCount >= 5 && rapidFireCount <= 10);
});
