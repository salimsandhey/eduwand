import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPresentationPptx } from "./pptxExport";
import type { PresentationContent } from "./ai";

test("buildPresentationPptx renders a deck containing every one of the 14 layouts without throwing", async () => {
  const content: PresentationContent = {
    type: "presentation",
    slides: [
      { layout: "title", title: "Photosynthesis", bullets: [] },
      { layout: "big_statement", title: "What was missing?", bullets: ["Kept in the dark for ten days"] },
      { layout: "definition", title: "Photosynthesis", bullets: ["The process by which green plants use sunlight to make food"] },
      {
        layout: "compare_2col",
        title: "Goes in / comes out",
        bullets: [],
        columns: [
          { heading: "GOES IN", rows: ["Carbon dioxide", "Water"] },
          { heading: "COMES OUT", rows: ["Oxygen", "Starch"] },
        ],
      },
      { layout: "process_flow", title: "The sequence", bullets: [], items: [{ title: "Light hits chlorophyll" }, { title: "Starch is stored" }] },
      { layout: "step", title: "Boil the leaf", bullets: ["Softens the leaf and stops the reaction"], stepIndex: 3, stepTotal: 7 },
      { layout: "timeline", title: "From sunlight to starch", bullets: [], items: [{ title: "Light hits chlorophyll", tag: "Step 1" }] },
      { layout: "card_grid", title: "Must know", bullets: [], items: [{ title: "Autotroph", description: "Makes its own food" }] },
      { layout: "table", title: "Compare", bullets: [], table: { headers: ["Mode", "Example"], rows: [["Autotrophic", "Green plants"]] } },
      { layout: "callout", title: "Safety", bullets: [], calloutIcon: "!", calloutBody: "Never heat it directly over a flame." },
      { layout: "bullets", title: "How it works", bullets: ["Carbon dioxide enters the leaf", "Water travels up from the roots"] },
      { layout: "divider", title: "Class 2 of 3", bullets: [] },
      { layout: "recap_bridge", title: "Where we left off", bullets: ["Plants make their own food"] },
      { layout: "closing_recap", title: "What we covered", bullets: ["Point one", "Point two"] },
    ],
  };

  const buffer = await buildPresentationPptx(content, "Photosynthesis");
  assert.ok(buffer.length > 0);
  // A valid .pptx is a zip archive - starts with the "PK" local file header signature.
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
});
