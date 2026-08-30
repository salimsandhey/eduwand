# Lesson Studio accuracy eval

Not unit tests of code — tests of *output quality*. Layer 0 checks the AI
followed the rules; Layers 1-3 check whether it extracted the right things
and produced something grounded and good. See the conversation log for the
full reasoning; this file is the quick reference for running/adding cases.

## Layers

- **Layer 0 - contract checks.** Deterministic, free, runs against the stub
  provider. Lives in `backend/src/lib/ai.test.ts` already (schema shape).
  No fixtures needed.
- **Layer 1 - extraction accuracy.** One fixture file per topic in
  `fixtures/<fixture_id>/`, hand-authored `expected.json` next to it. Scored
  by key-point recall + correct `extractionStatus`.
- **Layer 2 - grounding.** Two of the fixtures carry a "canary fact" - a
  specific detail the model can't already know. Generate with and without the
  source attached; the canary should appear only when the source is used.
- **Layer 3 - pedagogical quality.** LLM-judge rubric (coverage, factual
  correctness, age fit, activity practicality, assessment alignment, board
  fit) scored 1-5, averaged over a few runs per fixture.

## Folder layout

```
eval/
  fixtures/
    t1-photosynthesis/
      source.pdf
      expected.json
    t2-newtons-laws/
      source.pdf
      expected.json
    ...
  tracker/
    fixtures-register.csv     one row per fixture - what it is, what's expected
    extraction-results.csv    one row per extraction test run (Layer 1)
    generation-runs.csv       one row per generation test run (Layers 2-3)
  reports/                    generated run summaries (not yet created)
```

`expected.json` shape (Layer 1):
```json
{
  "expectedStatus": "extracted",
  "mustContain": ["short phrase 1", "short phrase 2"],
  "figureFacts": ["only for image/diagram fixtures - what a figure shows"]
}
```

## Running Layer 1

```
cd backend
npm run eval:extraction
```

Reads every `fixtures/<id>/expected.json` + `source.*`, runs it through the
real `runContextExtraction`, prints a PASS/FAIL line per fixture, writes the
full extracted text to `fixtures/<id>/actual-extracted.txt` for review,
appends a row to `tracker/extraction-results.csv`, and writes a full report
to `reports/extraction-<timestamp>.md` (includes the expected figure facts
next to the actual figure description, for manual eyeballing - that part
isn't auto-scored yet).

A fixture passes when: extractionStatus matches expected (an image with no
`GEMINI_API_KEY` configured is allowed to be `pending` instead of
`extracted`), key-point recall is >= 70%, and none of the forbidden strings
(the `NO_TEXT_FOUND` sentinel, plus any fixture-specific `mustNotContain`)
leaked into the stored text.

`npm run eval:extraction` also rebuilds the consolidated workbook at
`eval/reports/lesson-studio-eval.xlsx` (Summary + all three tracker sheets,
generated fresh from the CSVs every run - the CSVs stay the source of truth,
the workbook is always a rebuild of them). Run `npm run eval:workbook` on
its own to just refresh the workbook without re-running extraction.

## Status

- **Layer 0** - covered by `src/lib/ai.test.ts` (schema-shape checks against
  the stub).
- **Layer 1** - 4 fixtures built and passing: t1-photosynthesis,
  t2-newtons-laws, t3-water-cycle, t4-digestive-system (see
  `tracker/fixtures-register.csv`). The other 4 topics from the original
  plan (freedom struggle / chemical reactions / triangles / climate change)
  are deferred - same pattern, add whenever.
- First real run caught a bug: the vision model's "no text found" sentinel
  was leaking into stored `[Figure]` descriptions for text-free images (see
  git history on `describeImageForContext` in `src/lib/ai.ts`). Fixed, and
  the runner now checks for that leak on every fixture automatically
  (`GLOBAL_FORBIDDEN` in `run-extraction.ts`), not just ones that happen to
  list it.
- **Layer 2 (grounding)** - built and running (`npm run eval:grounding`,
  real model calls, costs money). t1-photosynthesis has a canary fact
  (`fixtures/t1-photosynthesis/canary.json`): generates the same topic with
  and without the source attached and checks the canary only shows up when
  it should, plus a lightweight hallucination judge on the with-source run.
  First run: PASS both ways - the with-source generation named the specific
  greenhouse specimen/timing from the canary note inside a real activity
  description; the without-source generation was generic textbook content
  with no invented specifics. Only t1 has a canary so far; add
  `canary.json` to another fixture to extend.
- **Layer 3 (pedagogical rubric / LLM-judge)** - not built yet.
