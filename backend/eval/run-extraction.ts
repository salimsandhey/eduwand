/**
 * Layer 1 accuracy runner: feeds every fixture in eval/fixtures/ through the
 * real runContextExtraction() pipeline (the same function the upload route
 * uses) and scores the result against that fixture's expected.json.
 *
 * Usage:  cd backend && npx tsx eval/run-extraction.ts
 *
 * Writes:
 *  - one line to stdout per fixture + a summary
 *  - eval/fixtures/<id>/actual-extracted.txt   (full extracted text, for review)
 *  - eval/reports/extraction-<timestamp>.md    (full report incl. figure facts)
 *  - appends rows to eval/tracker/extraction-results.csv
 */
import fs from "fs";
import path from "path";
import { runContextExtraction } from "../src/lib/context-extraction";
import { buildWorkbook } from "./build-workbook";

const EVAL_DIR = __dirname;
const FIXTURES_DIR = path.join(EVAL_DIR, "fixtures");
const REPORTS_DIR = path.join(EVAL_DIR, "reports");
const TRACKER_CSV = path.join(EVAL_DIR, "tracker", "extraction-results.csv");

const EXT_TO_SOURCE_TYPE: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
};

interface ExpectedJson {
  sourceType: string;
  expectedStatus: string;
  mustContain: string[];
  mustNotContain?: string[];
  figureFacts: string[];
  notes?: string;
}

// Invariants checked on every fixture regardless of expected.json: things
// that should never leak into stored content no matter what the source is.
const GLOBAL_FORBIDDEN = ["NO_TEXT_FOUND"];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function csvField(value: string): string {
  const cleaned = value.replace(/\r?\n/g, " ").trim();
  return `"${cleaned.replace(/"/g, '""')}"`;
}

async function main() {
  const fixtureIds = fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (fixtureIds.length === 0) {
    console.log("No fixtures found under eval/fixtures/");
    return;
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const runDate = new Date().toISOString();
  const reportLines: string[] = [`# Extraction accuracy run - ${runDate}`, ""];
  const csvRows: string[] = [];
  let passCount = 0;

  for (const fixtureId of fixtureIds) {
    const dir = path.join(FIXTURES_DIR, fixtureId);
    const expectedPath = path.join(dir, "expected.json");
    if (!fs.existsSync(expectedPath)) {
      console.log(`[skip] ${fixtureId}: no expected.json yet`);
      continue;
    }
    const expected: ExpectedJson = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));

    const sourceFile = fs.readdirSync(dir).find((f) => f.startsWith("source."));
    if (!sourceFile) {
      console.log(`[skip] ${fixtureId}: no source.* file`);
      continue;
    }
    const sourcePath = path.join(dir, sourceFile);
    const ext = sourceFile.split(".").pop()!.toLowerCase();
    const sourceType = EXT_TO_SOURCE_TYPE[ext] ?? "image";
    const buffer = fs.readFileSync(sourcePath);

    const result = await runContextExtraction({
      sourceType,
      fileLocation: sourcePath,
      buffer,
    });

    const extractedText = result.extractedText ?? "";
    fs.writeFileSync(path.join(dir, "actual-extracted.txt"), extractedText);

    const normalized = normalize(extractedText);
    const matched: string[] = [];
    const missing: string[] = [];
    for (const phrase of expected.mustContain) {
      if (normalized.includes(normalize(phrase))) matched.push(phrase);
      else missing.push(phrase);
    }
    const total = expected.mustContain.length;
    const recallPct = total === 0 ? null : Math.round((matched.length / total) * 100);

    const forbidden = [...GLOBAL_FORBIDDEN, ...(expected.mustNotContain ?? [])];
    const leaked = forbidden.filter((phrase) => normalized.includes(normalize(phrase)));

    const hasVisionKey = Boolean(process.env.GEMINI_API_KEY);
    const statusOk =
      result.extractionStatus === expected.expectedStatus ||
      (sourceType === "image" && !hasVisionKey && result.extractionStatus === "pending");

    const recallOk = total === 0 || (recallPct ?? 0) >= 70; // 70% recall bar for Layer 1
    const pass = statusOk && recallOk && leaked.length === 0;
    if (pass) passCount++;

    console.log(
      `[${pass ? "PASS" : "FAIL"}] ${fixtureId}  status=${result.extractionStatus}` +
        (total > 0 ? `  recall=${recallPct}% (${matched.length}/${total})` : "  recall=n/a") +
        (leaked.length > 0 ? `  LEAKED=${JSON.stringify(leaked)}` : "") +
        (result.extractionError ? `  error="${result.extractionError}"` : "")
    );

    reportLines.push(
      `## ${fixtureId}`,
      "",
      `- source type: \`${sourceType}\` (${sourceFile})`,
      `- expected status: \`${expected.expectedStatus}\` / actual: \`${result.extractionStatus}\`${statusOk ? "" : "  **MISMATCH**"}`,
      total > 0 ? `- key-point recall: ${recallPct}% (${matched.length}/${total})` : "- key-point recall: n/a (no text expected on this source)",
      matched.length > 0 ? `- matched: ${matched.map((m) => `"${m}"`).join(", ")}` : "",
      missing.length > 0 ? `- **missing:** ${missing.map((m) => `"${m}"`).join(", ")}` : "",
      leaked.length > 0 ? `- **LEAKED forbidden content:** ${leaked.map((m) => `"${m}"`).join(", ")}` : "",
      result.extractionError ? `- extraction error: ${result.extractionError}` : "",
      "",
      "**Expected figure facts (for manual review against actual output below):**",
      expected.figureFacts.length > 0 ? expected.figureFacts.map((f) => `- ${f}`).join("\n") : "_none_",
      "",
      "**Actual extracted text:**",
      "```",
      extractedText || "(empty)",
      "```",
      ""
    );

    csvRows.push(
      [
        runDate,
        fixtureId,
        result.extractionStatus,
        csvField(extractedText.slice(0, 200)),
        String(matched.length),
        String(total),
        recallPct === null ? "" : String(recallPct),
        csvField([missing.length > 0 ? `missing: ${missing.join("; ")}` : "", leaked.length > 0 ? `LEAKED: ${leaked.join("; ")}` : ""].filter(Boolean).join(" | ")),
        pass ? "PASS" : "FAIL",
        "eval:run-extraction (automated)",
      ].join(",")
    );
  }

  fs.appendFileSync(TRACKER_CSV, csvRows.map((r) => r + "\n").join(""));

  const reportPath = path.join(REPORTS_DIR, `extraction-${runDate.replace(/[:.]/g, "-")}.md`);
  fs.writeFileSync(reportPath, reportLines.join("\n"));

  console.log("");
  console.log(`${passCount}/${fixtureIds.length} fixtures passed.`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  console.log(`Tracker updated: ${path.relative(process.cwd(), TRACKER_CSV)}`);

  const workbookPath = await buildWorkbook();
  console.log(`Workbook updated: ${path.relative(process.cwd(), workbookPath)}`);
}

main();
