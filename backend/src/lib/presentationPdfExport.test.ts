import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPresentationPdf } from "./presentationPdfExport";
import type { PresentationContent } from "./ai";

test("buildPresentationPdf renders one PDF page per slide across every layout without throwing", async () => {
  const content: PresentationContent = {
    type: "presentation",
    slides: [
      { layout: "title", title: "Photosynthesis", bullets: [] },
      { layout: "big_statement", title: "What was missing?", bullets: ["Kept in the dark"] },
      { layout: "definition", title: "Photosynthesis", bullets: ["Uses sunlight to make food"] },
      {
        layout: "compare_2col",
        title: "Goes in / comes out",
        bullets: [],
        columns: [{ heading: "GOES IN", rows: ["Carbon dioxide"] }, { heading: "COMES OUT", rows: ["Oxygen"] }],
      },
      { layout: "process_flow", title: "The sequence", bullets: [], items: [{ title: "Light hits chlorophyll" }] },
      { layout: "step", title: "Boil the leaf", bullets: ["Softens the leaf"], stepIndex: 3, stepTotal: 7 },
      { layout: "card_grid", title: "Must know", bullets: [], items: [{ title: "Autotroph", description: "Makes its own food" }] },
      { layout: "table", title: "Compare", bullets: [], table: { headers: ["Mode", "Example"], rows: [["Autotrophic", "Green plants"]] } },
      { layout: "callout", title: "Safety", bullets: [], calloutIcon: "!", calloutBody: "Never heat it directly." },
      { layout: "timeline", title: "Sequence", bullets: [], items: [{ title: "Step one" }] },
      { layout: "bullets", title: "How it works", bullets: ["Point one", "Point two"] },
      { layout: "divider", title: "Class 2 of 3", bullets: [] },
      { layout: "recap_bridge", title: "Where we left off", bullets: ["Plants make their own food"] },
      { layout: "closing_recap", title: "What we covered", bullets: ["Point one", "Point two"] },
    ],
  };

  const buffer = await buildPresentationPdf(content);
  assert.ok(buffer.length > 0);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
});
