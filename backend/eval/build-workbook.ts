/**
 * Consolidates the tracker CSVs into one .xlsx workbook - the "final excel"
 * deliverable. Re-run any time (also runs automatically at the end of
 * run-extraction.ts) to pick up the latest CSV rows.
 *
 * Usage:  cd backend && npx tsx eval/build-workbook.ts
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const EVAL_DIR = __dirname;
const TRACKER_DIR = path.join(EVAL_DIR, "tracker");
const REPORTS_DIR = path.join(EVAL_DIR, "reports");
const OUT_PATH = path.join(REPORTS_DIR, "lesson-studio-eval.xlsx");

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2A44" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const PASS_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9F2D9" } };
const FAIL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9D6D6" } };

// Minimal CSV parser: handles quoted fields, escaped ("") quotes, and commas
// inside quotes. Our writers never emit embedded newlines inside a field.
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const fields: string[] = [];
      let i = 0;
      while (i <= line.length) {
        if (line[i] === '"') {
          let j = i + 1;
          let value = "";
          while (j < line.length) {
            if (line[j] === '"' && line[j + 1] === '"') {
              value += '"';
              j += 2;
            } else if (line[j] === '"') {
              break;
            } else {
              value += line[j];
              j += 1;
            }
          }
          fields.push(value);
          i = j + 2; // skip closing quote + comma
        } else {
          const next = line.indexOf(",", i);
          const end = next === -1 ? line.length : next;
          fields.push(line.slice(i, end));
          i = end + 1;
        }
        if (i > line.length) break;
      }
      return fields;
    });
}

function addCsvSheet(workbook: ExcelJS.Workbook, name: string, csvPath: string) {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf-8"));
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  if (rows.length === 0) return sheet;

  const [header, ...body] = rows;
  sheet.addRow(header);
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };

  const passFailCol = header.findIndex((h) => h === "pass_fail") + 1;
  for (const row of body) {
    const excelRow = sheet.addRow(row);
    if (passFailCol > 0) {
      const cell = excelRow.getCell(passFailCol);
      if (cell.value === "PASS") cell.fill = PASS_FILL;
      else if (cell.value === "FAIL") cell.fill = FAIL_FILL;
    }
  }

  header.forEach((h, idx) => {
    const maxLen = Math.max(h.length, ...body.map((r) => (r[idx] ?? "").length));
    sheet.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 2, 10), 60);
  });

  return sheet;
}

export async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lesson Studio eval harness";
  workbook.created = new Date();

  // Summary sheet first, filled in after we know the latest extraction results.
  const summary = workbook.addWorksheet("Summary");
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 50;

  addCsvSheet(workbook, "Fixtures Register", path.join(TRACKER_DIR, "fixtures-register.csv"));
  const extractionRows = parseCsv(fs.readFileSync(path.join(TRACKER_DIR, "extraction-results.csv"), "utf-8"));
  addCsvSheet(workbook, "Extraction Results (L1)", path.join(TRACKER_DIR, "extraction-results.csv"));
  addCsvSheet(workbook, "Generation Runs (L2-L3)", path.join(TRACKER_DIR, "generation-runs.csv"));

  // Latest row per fixture_id, for the summary.
  const [extHeader, ...extBody] = extractionRows;
  const fixtureIdx = extHeader.indexOf("fixture_id");
  const dateIdx = extHeader.indexOf("date");
  const statusIdx = extHeader.indexOf("pass_fail");
  const latestByFixture = new Map<string, string[]>();
  for (const row of extBody) {
    const id = row[fixtureIdx];
    const existing = latestByFixture.get(id);
    if (!existing || row[dateIdx] > existing[dateIdx]) latestByFixture.set(id, row);
  }
  const latestRows = [...latestByFixture.values()];
  const passCount = latestRows.filter((r) => r[statusIdx] === "PASS").length;

  summary.addRow(["Lesson Studio accuracy eval - summary"]).font = { bold: true, size: 14 };
  summary.addRow([]);
  summary.addRow(["Generated", new Date().toISOString()]);
  summary.addRow(["Layer 1 fixtures (latest run each)", latestRows.length]);
  summary.addRow(["Layer 1 passing", `${passCount} / ${latestRows.length}`]);
  const genRows = parseCsv(fs.readFileSync(path.join(TRACKER_DIR, "generation-runs.csv"), "utf-8"));
  const [genHeader, ...genBody] = genRows;
  const gFixtureIdx = genHeader.indexOf("fixture_id");
  const gCanaryIdx = genHeader.indexOf("canary_present");
  const gAvgIdx = genHeader.indexOf("avg_score");
  const gRubricStart = genHeader.indexOf("rubric_coverage");

  const groundingRows = genBody.filter((r) => r[gCanaryIdx] !== "");
  const rubricRows = genBody.filter((r) => r[gRubricStart] !== "");

  summary.addRow(["Layer 2 (grounding) runs logged", groundingRows.length]);
  summary.addRow(["Layer 3 (rubric) runs logged", rubricRows.length]);
  summary.addRow([]);
  summary.addRow(["Layer", "Status"]).font = { bold: true };
  summary.addRow(["0 - contract checks", "covered by src/lib/ai.test.ts (npm test)"]);
  summary.addRow(["1 - extraction accuracy", `${passCount}/${latestRows.length} fixtures passing - see 'Extraction Results (L1)'`]);
  summary.addRow([
    "2 - grounding (canary fact)",
    groundingRows.length > 0 ? `${groundingRows.length} run(s) logged - see 'Generation Runs (L2-L3)'` : "not started",
  ]);
  summary.addRow([
    "3 - pedagogical rubric / LLM judge",
    rubricRows.length > 0 ? `${rubricRows.length} run(s) logged - see rubric averages below` : "not started",
  ]);
  summary.addRow([]);

  if (rubricRows.length > 0) {
    summary.addRow(["Layer 3 - mean rubric score per fixture (1-5)", ""]).font = { bold: true };
    summary.addRow(["fixture_id", "runs", "mean avg_score", "min", "max"]).font = { bold: true };
    const byFixture = new Map<string, number[]>();
    for (const row of rubricRows) {
      const id = row[gFixtureIdx];
      const list = byFixture.get(id) ?? [];
      list.push(Number(row[gAvgIdx]));
      byFixture.set(id, list);
    }
    for (const [id, scores] of byFixture) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      summary.addRow([id, scores.length, mean.toFixed(2), Math.min(...scores).toFixed(2), Math.max(...scores).toFixed(2)]);
    }
    summary.addRow([]);
  }
  summary.addRow(["Latest result per fixture", ""]).font = { bold: true };
  summary.addRow(["fixture_id", "status"]);
  for (const row of latestRows) {
    summary.addRow([row[fixtureIdx], row[statusIdx]]).getCell(2).fill =
      row[statusIdx] === "PASS" ? PASS_FILL : FAIL_FILL;
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  await workbook.xlsx.writeFile(OUT_PATH);
  return OUT_PATH;
}

if (require.main === module) {
  buildWorkbook().then((outPath) => {
    console.log(`Workbook written: ${path.relative(process.cwd(), outPath)}`);
  });
}
