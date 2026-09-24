import { test } from "node:test";
import assert from "node:assert/strict";
import { findVerbatimOverlap } from "./overlapCheck";

test("findVerbatimOverlap flags a generated line that near-verbatim matches a long span of source text", () => {
  const source = "Photosynthesis is the process by which green plants use sunlight to make their own food from carbon dioxide and water.";
  const generated = ["Photosynthesis is the process by which green plants use sunlight to make their own food from carbon dioxide and water."];
  const flags = findVerbatimOverlap(source, generated);
  assert.equal(flags.length, 1);
});

test("findVerbatimOverlap does not flag an independently-worded sentence covering the same idea", () => {
  const source = "Photosynthesis is the process by which green plants use sunlight to make their own food from carbon dioxide and water.";
  const generated = ["Plants use sunlight, water, and carbon dioxide to make food - this is called photosynthesis."];
  const flags = findVerbatimOverlap(source, generated);
  assert.equal(flags.length, 0);
});

test("findVerbatimOverlap does not flag a short quoted phrase under the threshold", () => {
  const source = "Photosynthesis is the process by which green plants use sunlight to make their own food.";
  const generated = ['The textbook calls it "green plants use sunlight" in one section.'];
  const flags = findVerbatimOverlap(source, generated);
  assert.equal(flags.length, 0);
});
