/**
 * Layer 3 accuracy runner: pedagogical quality rubric, scored by an LLM
 * judge. Not pass/fail - a dashboard. Generates a lesson plan for each
 * fixture (grounded in its real extracted source text, same as production),
 * runs it N times to see spread rather than trusting one sample, and has a
 * judge model score six dimensions 1-5 each.
 *
 * Usage:  cd backend && npx tsx eval/run-rubric.ts [runsPerFixture]
 * Requires GEMINI_API_KEY (real model calls, judge calls too - costs money).
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
const MAX_CONTEXT_CHARS_FOR_PROMPT = 12000; // mirrors src/routes/generations.ts

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const RUBRIC_DIMENSIONS = [
  "coverage",
  "correctness",
  "age_fit",
  "activity_practicality",
  "assessment_alignment",
  "board_fit",
] as const;
type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];
type RubricScores = Record<RubricDimension, number> & { notes: string };

function csvField(value: string): string {
  return `"${value.replace(/\r?\n/g, " ").trim().replace(/"/g, '""')}"`;
}

async function judgeRubric(params: {
  topicName: string;
  subject: string;
  board: string;
  classLabel: string;
  sourceText: string | null;
  output: string;
}): Promise<RubricScores> {
  const prompt =
    "You are an experienced curriculum reviewer scoring an AI-generated lesson plan for a teacher.\n\n" +
    `Topic: ${params.topicName}\nSubject: ${params.subject}\nBoard: ${params.board}\nClass: ${params.classLabel}\n\n` +
    (params.sourceText
      ? `SOURCE MATERIAL the plan should be grounded in:\n"""\n${params.sourceText.slice(0, MAX_CONTEXT_CHARS_FOR_PROMPT)}\n"""\n\n`
      : "No source material was provided - the plan relies on general curriculum knowledge.\n\n") +
    `GENERATED LESSON PLAN (JSON):\n"""\n${params.output}\n"""\n\n` +
    "Score the lesson plan on these six dimensions, each 1-5 (1 = poor, 3 = acceptable, 5 = excellent):\n" +
    "- coverage: does it cover the topic's key concepts adequately for this class level?\n" +
    "- correctness: is everything stated factually accurate for this subject?\n" +
    "- age_fit: is the language, depth and activity design appropriate for this class/age?\n" +
    "- activity_practicality: could a real teacher run these activities in a normal classroom with normal materials?\n" +
    "- assessment_alignment: does the assessment actually check the stated objectives?\n" +
    "- board_fit: does it read as appropriate for the named board's curriculum style?\n\n" +
    "Respond with ONLY a JSON object of this exact shape, no markdown fences, no prose outside it:\n" +
    '{"coverage": number, "correctness": number, "age_fit": number, "activity_practicality": number, ' +
    '"assessment_alignment": number, "board_fit": number, "notes": string (2-3 sentences on the biggest strength and biggest weakness)}';

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) {
    throw new Error(`Judge call failed (${response.status})`);
  }
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced ? fenced[1] : raw);

  const scores = {} as RubricScores;
  for (const dim of RUBRIC_DIMENSIONS) {
    const value = Number(parsed[dim]);
    scores[dim] = Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 3;
  }
  scores.notes = typeof parsed.notes === "string" ? parsed.notes : "";
  return scores;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY not set - Layer 3 needs real model + judge calls. Aborting.");
    return;
  }
  const runsPerFixture = Number(process.argv[2] ?? 2);
  const runDate = new Date().toISOString();
  const csvRows: string[] = [];
  const reportLines: string[] = [`# Rubric (Layer 3) run - ${runDate} - ${runsPerFixture} run(s)/fixture`, ""];
  const fixtureAverages: { fixtureId: string; avgScores: number[] }[] = [];

  for (const fixtureId of Object.keys(FIXTURE_META)) {
    const dir = path.join(FIXTURES_DIR, fixtureId);
    const extractedPath = path.join(dir, "actual-extracted.txt");
    if (!fs.existsSync(extractedPath)) {
      console.log(`[skip] ${fixtureId}: run eval:extraction first (no actual-extracted.txt)`);
      continue;
    }
    const sourceText = fs.readFileSync(extractedPath, "utf-8");
    const meta = FIXTURE_META[fixtureId];
    console.log(`\n=== ${fixtureId} (${runsPerFixture} run(s)) ===`);

    const runAverages: number[] = [];
    for (let run = 1; run <= runsPerFixture; run++) {
      const { content, model } = await aiProvider.generateContent({
        ...meta,
        outputType: "lesson_plan",
        contextText: sourceText,
      });
      fs.writeFileSync(path.join(dir, `rubric-run-${run}.json`), content);

      const scores = await judgeRubric({
        topicName: meta.topicName,
        subject: meta.subject,
        board: meta.board,
        classLabel: meta.classLabel ?? "",
        sourceText,
        output: content,
      });

      const dimValues = RUBRIC_DIMENSIONS.map((d) => scores[d]);
      const avg = dimValues.reduce((a, b) => a + b, 0) / dimValues.length;
      runAverages.push(avg);

      console.log(
        `  run ${run}: ${RUBRIC_DIMENSIONS.map((d) => `${d}=${scores[d]}`).join(" ")}  avg=${avg.toFixed(1)}`
      );

      reportLines.push(
        `## ${fixtureId} - run ${run}`,
        "",
        ...RUBRIC_DIMENSIONS.map((d) => `- ${d}: ${scores[d]}/5`),
        `- **average: ${avg.toFixed(2)}/5**`,
        `- judge notes: ${scores.notes}`,
        `- model: ${model}`,
        ""
      );

      csvRows.push(
        [
          runDate,
          fixtureId,
          "lesson_plan",
          "Y",
          "",
          "",
          String(scores.coverage),
          String(scores.correctness),
          String(scores.age_fit),
          String(scores.activity_practicality),
          String(scores.assessment_alignment),
          String(scores.board_fit),
          avg.toFixed(2),
          csvField(scores.notes),
          model,
          "n/a (direct provider call, not persisted)",
          "eval:run-rubric (automated)",
        ].join(",")
      );
    }

    const fixtureAvg = runAverages.reduce((a, b) => a + b, 0) / runAverages.length;
    const spread = Math.max(...runAverages) - Math.min(...runAverages);
    fixtureAverages.push({ fixtureId, avgScores: runAverages });
    console.log(`  -> ${fixtureId} mean=${fixtureAvg.toFixed(2)}/5  spread=${spread.toFixed(2)}`);
  }

  fs.appendFileSync(TRACKER_CSV, csvRows.map((r) => r + "\n").join(""));

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `rubric-${runDate.replace(/[:.]/g, "-")}.md`);
  fs.writeFileSync(reportPath, reportLines.join("\n"));

  console.log("\n=== Summary ===");
  for (const { fixtureId, avgScores } of fixtureAverages) {
    const mean = avgScores.reduce((a, b) => a + b, 0) / avgScores.length;
    console.log(`${fixtureId}: mean ${mean.toFixed(2)}/5 over ${avgScores.length} run(s) [${avgScores.map((s) => s.toFixed(1)).join(", ")}]`);
  }
  console.log(`\nReport: ${path.relative(process.cwd(), reportPath)}`);
  console.log(`Tracker updated: ${path.relative(process.cwd(), TRACKER_CSV)}`);

  const workbookPath = await buildWorkbook();
  console.log(`Workbook updated: ${path.relative(process.cwd(), workbookPath)}`);
}

main();
