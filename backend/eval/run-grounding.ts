/**
 * Layer 2 accuracy runner: grounding / faithfulness.
 *
 * For each fixture with a canary.json, generates a lesson plan twice through
 * the real aiProvider.generateContent() - once WITH the fixture's source
 * text (+ the canary fact appended, exactly like a second context source
 * would be joined in generations.ts's buildContextText), once with NO
 * context at all. The canary fact should show up only in the first.
 *
 * Also runs a lightweight LLM-judge pass (with-source run only) asking
 * whether the output contradicts/fabricates anything relative to the source.
 *
 * Usage:  cd backend && npx tsx eval/run-grounding.ts
 * Requires GEMINI_API_KEY (real model calls - this layer costs money).
 */
import fs from "fs";
import path from "path";
import { aiProvider } from "../src/lib/ai";
import { buildWorkbook } from "./build-workbook";
import { FIXTURE_META } from "./fixture-meta";

const EVAL_DIR = __dirname;
const FIXTURES_DIR = path.join(EVAL_DIR, "fixtures");
const REPORTS_DIR = path.join(EVAL_DIR, "reports");
const TRACKER_CSV = path.join(EVAL_DIR, "tracker", "generation-runs.csv");

// Mirrors MAX_CONTEXT_CHARS_FOR_PROMPT in src/routes/generations.ts - kept in
// sync manually since this script calls the provider directly, not the route.
const MAX_CONTEXT_CHARS_FOR_PROMPT = 12000;

interface CanaryJson {
  canaryFactText: string;
  checkTokens: string[];
  notes?: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function csvField(value: string): string {
  return `"${value.replace(/\r?\n/g, " ").trim().replace(/"/g, '""')}"`;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function judgeGrounding(sourceText: string, outputText: string): Promise<{ flagged: boolean; notes: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { flagged: false, notes: "no GEMINI_API_KEY - judge skipped" };
  }
  const prompt =
    "You are reviewing an AI-generated lesson plan against the source material a teacher provided.\n\n" +
    `SOURCE:\n"""\n${sourceText.slice(0, MAX_CONTEXT_CHARS_FOR_PROMPT)}\n"""\n\n` +
    `GENERATED OUTPUT:\n"""\n${outputText}\n"""\n\n` +
    "Does the generated output state anything that contradicts the source, or fabricates a specific " +
    "fact (a number, name, or claim) that is not supported by the source and is not well-established " +
    "general curriculum knowledge? Minor rephrasing or reasonable elaboration is NOT a contradiction. " +
    "Reply in exactly two lines:\nLine 1: YES or NO\nLine 2: one sentence reason.";

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) {
    return { flagged: false, notes: `judge call failed (${response.status})` };
  }
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  const [firstLine, ...rest] = text.split(/\r?\n/);
  return { flagged: /^YES/i.test(firstLine ?? ""), notes: rest.join(" ").trim() || text.slice(0, 300) };
}

async function main() {
  const runDate = new Date().toISOString();
  const csvRows: string[] = [];
  const reportLines: string[] = [`# Grounding (Layer 2) run - ${runDate}`, ""];

  const fixtureIds = Object.keys(FIXTURE_META).filter((id) =>
    fs.existsSync(path.join(FIXTURES_DIR, id, "canary.json"))
  );
  if (fixtureIds.length === 0) {
    console.log("No fixtures with canary.json found.");
    return;
  }

  for (const fixtureId of fixtureIds) {
    const dir = path.join(FIXTURES_DIR, fixtureId);
    const canary: CanaryJson = JSON.parse(fs.readFileSync(path.join(dir, "canary.json"), "utf-8"));
    const extractedPath = path.join(dir, "actual-extracted.txt");
    if (!fs.existsSync(extractedPath)) {
      console.log(`[skip] ${fixtureId}: run eval:extraction first (no actual-extracted.txt)`);
      continue;
    }
    const baseText = fs.readFileSync(extractedPath, "utf-8");
    const contextWithCanary = [baseText, canary.canaryFactText].join("\n\n---\n\n").slice(0, MAX_CONTEXT_CHARS_FOR_PROMPT);
    const meta = FIXTURE_META[fixtureId];

    console.log(`\n=== ${fixtureId} ===`);

    for (const variant of ["with_source", "without_source"] as const) {
      const contextText = variant === "with_source" ? contextWithCanary : null;
      const { content, model } = await aiProvider.generateContent({
        ...meta,
        outputType: "lesson_plan",
        contextText,
      });

      const outFile = path.join(dir, `generation-${variant}.json`);
      fs.writeFileSync(outFile, content);

      const normalized = normalize(content);
      const foundTokens = canary.checkTokens.filter((t) => normalized.includes(normalize(t)));
      const canaryPresent = foundTokens.length === canary.checkTokens.length;
      const canaryPartial = foundTokens.length > 0 && !canaryPresent;

      let hallucinationFlag = false;
      let judgeNotes = "not run for this variant";
      if (variant === "with_source") {
        const judged = await judgeGrounding(contextWithCanary, content);
        hallucinationFlag = judged.flagged;
        judgeNotes = judged.notes;
      }

      const expectedPresent = variant === "with_source";
      const pass = canaryPresent === expectedPresent && !hallucinationFlag;

      console.log(
        `[${pass ? "PASS" : "FAIL"}] ${variant.padEnd(14)} canary=${foundTokens.length}/${canary.checkTokens.length}` +
          (canaryPartial ? " (partial!)" : "") +
          (variant === "with_source" ? `  hallucination_flag=${hallucinationFlag}` : "")
      );

      reportLines.push(
        `## ${fixtureId} - ${variant}`,
        "",
        `- context given to the model: ${contextText ? "source text + canary fact" : "none"}`,
        `- canary tokens found: ${foundTokens.length}/${canary.checkTokens.length} ${foundTokens.length ? `(${foundTokens.join(", ")})` : ""}`,
        `- expected canary present: ${expectedPresent} / actual: ${canaryPresent}${canaryPartial ? " (PARTIAL MATCH - review manually)" : ""}`,
        variant === "with_source" ? `- hallucination judge: ${hallucinationFlag ? "FLAGGED" : "clear"} - ${judgeNotes}` : "",
        `- model: ${model}`,
        `- output saved to: ${path.relative(EVAL_DIR, outFile)}`,
        ""
      );

      csvRows.push(
        [
          runDate,
          fixtureId,
          "lesson_plan",
          variant === "with_source" ? "Y" : "N",
          canaryPresent ? "Y" : canaryPartial ? "PARTIAL" : "N",
          hallucinationFlag ? "Y" : "N",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          csvField(judgeNotes),
          model,
          "n/a (direct provider call, not persisted)",
          "eval:run-grounding (automated)",
        ].join(",")
      );
    }
  }

  fs.appendFileSync(TRACKER_CSV, csvRows.map((r) => r + "\n").join(""));

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `grounding-${runDate.replace(/[:.]/g, "-")}.md`);
  fs.writeFileSync(reportPath, reportLines.join("\n"));
  console.log(`\nReport: ${path.relative(process.cwd(), reportPath)}`);
  console.log(`Tracker updated: ${path.relative(process.cwd(), TRACKER_CSV)}`);

  const workbookPath = await buildWorkbook();
  console.log(`Workbook updated: ${path.relative(process.cwd(), workbookPath)}`);
}

main();
