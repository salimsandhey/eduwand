import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import type { TopicAttainmentReport, SubjectAttainmentReport } from "../routes/attainment-reports";

// This report is Eduwand's own document, not the school's - unlike
// presentations (which carry the school's saved logo/colors by design), the
// attainment report PDF always uses Eduwand's own brand identity regardless
// of what school branding is set. Assets copied from unified-app/assets/brand
// (kept in sync manually, same "duplicated small asset" pattern already used
// for the flashcard/presentation icon PNGs - see backend/src/assets/icons).
const LOGO_WHITE = fs.readFileSync(path.join(__dirname, "../assets/brand/eduwand-logo-white.png"));

// unified-app/src/theme/tokens.ts's brandPalette - the actual Eduwand brand
// colors, not a guessed default.
const PLUM = "#7C005A";
const AMBER = "#FBAA0A";
const IVORY = "#F4F1E8";
const BAND_COLORS = ["#18A957", "#7C3AED", "#F97316"];
const TEXT_PRIMARY = "#1F1F1F";
const TEXT_MUTED = "#756C72";
const BORDER = "#E8E2D9";

const PAGE_MARGIN = 50;
const BANNER_HEIGHT = 96;
const CONT_HEADER_HEIGHT = 34;

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

function displayScore(score: number | null): string {
  return score === null ? "-" : `${Math.round(score)}%`;
}

function drawContinuationHeader(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, doc.page.width, CONT_HEADER_HEIGHT).fill(PLUM);
  try {
    doc.image(LOGO_WHITE, PAGE_MARGIN, 9, { fit: [90, 16] });
  } catch {
    // Skip the mark rather than fail the export.
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#FFFFFF")
    .text("Attainment Report", 0, 13, { width: doc.page.width - PAGE_MARGIN, align: "right" });
  doc.x = PAGE_MARGIN;
  doc.y = CONT_HEADER_HEIGHT + 24;
  doc.fillColor(TEXT_PRIMARY);
}

function drawBanner(doc: PDFKit.PDFDocument, title: string, subtitle: string, meta: string) {
  doc.rect(0, 0, doc.page.width, BANNER_HEIGHT).fill(PLUM);
  try {
    doc.image(LOGO_WHITE, PAGE_MARGIN, 20, { fit: [130, 24] });
  } catch {
    // Skip the mark rather than fail the export.
  }
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF").text(title, PAGE_MARGIN, 54, { width: contentWidth(doc) });
  doc.font("Helvetica").fontSize(10).fillColor(IVORY).text(`${subtitle}  |  ${meta}`, PAGE_MARGIN, 76, { width: contentWidth(doc) });
  doc.x = PAGE_MARGIN;
  doc.y = BANNER_HEIGHT + 24;
  doc.fillColor(TEXT_PRIMARY);
}

// Every text call below always passes an explicit x/width instead of relying
// on pdfkit's ambient cursor position - the earlier version left doc.x
// wherever a manually-positioned draw (metrics row, score circle, bar chart)
// had last set it, which made later flowing sections (e.g. "What was done")
// start from that stale x and render as a narrow, misplaced column.
function sectionTitle(doc: PDFKit.PDFDocument, text: string, accent: string) {
  if (doc.y + 40 > doc.page.height - PAGE_MARGIN) doc.addPage();
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(doc.page.width - PAGE_MARGIN, doc.y).strokeColor(BORDER).lineWidth(1).stroke();
  doc.y += 16;
  doc.rect(PAGE_MARGIN, doc.y + 2, 8, 8).fill(accent);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(TEXT_PRIMARY).text(text, PAGE_MARGIN + 14, doc.y, { width: contentWidth(doc) - 14 });
  doc.x = PAGE_MARGIN;
  doc.y += 10;
}

function bodyText(doc: PDFKit.PDFDocument, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED).text(text, PAGE_MARGIN, doc.y, { width: contentWidth(doc), lineGap: 3 });
  doc.x = PAGE_MARGIN;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - PAGE_MARGIN) doc.addPage();
}

function drawMetrics(doc: PDFKit.PDFDocument, metrics: { label: string; value: string }[]) {
  ensureSpace(doc, 78);
  const gap = 12;
  const boxW = (contentWidth(doc) - gap * (metrics.length - 1)) / metrics.length;
  const boxH = 64;
  const y = doc.y;
  metrics.forEach((metric, index) => {
    const x = PAGE_MARGIN + index * (boxW + gap);
    doc.roundedRect(x, y, boxW, boxH, 8).fillColor(IVORY).fill();
    doc.font("Helvetica-Bold").fontSize(18).fillColor(PLUM).text(metric.value, x + 12, y + 14, { width: boxW - 24 });
    doc.font("Helvetica").fontSize(8.5).fillColor(TEXT_MUTED).text(metric.label, x + 12, y + 40, { width: boxW - 24 });
  });
  doc.x = PAGE_MARGIN;
  doc.y = y + boxH + 20;
}

function drawScoreOverview(doc: PDFKit.PDFDocument, averageScore: number | null, bands: { above80: number; between60And80: number; below60: number }) {
  ensureSpace(doc, 110);
  const boxY = doc.y;
  const boxH = 96;
  doc.roundedRect(PAGE_MARGIN, boxY, contentWidth(doc), boxH, 10).fillColor(IVORY).fill();

  const circleR = 32;
  const circleX = PAGE_MARGIN + 30 + circleR;
  const circleY = boxY + boxH / 2;
  doc.circle(circleX, circleY, circleR).lineWidth(5).strokeColor(averageScore === null ? BORDER : PLUM).stroke();
  doc.font("Helvetica-Bold").fontSize(14).fillColor(TEXT_PRIMARY).text(displayScore(averageScore), circleX - circleR, circleY - 7, { width: circleR * 2, align: "center" });

  const bandX = PAGE_MARGIN + 30 + circleR * 2 + 36;
  let bandY = boxY + 18;
  const rows: [string, string, number][] = [
    ["Above 80%", BAND_COLORS[0], bands.above80],
    ["60% - 80%", BAND_COLORS[1], bands.between60And80],
    ["Below 60%", BAND_COLORS[2], bands.below60],
  ];
  rows.forEach(([label, color, value]) => {
    doc.circle(bandX + 4, bandY + 5, 4).fillColor(color).fill();
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(TEXT_PRIMARY)
      .text(`${label}  -  ${value} ${value === 1 ? "student" : "students"}`, bandX + 16, bandY, { width: contentWidth(doc) - (bandX - PAGE_MARGIN) - 16 });
    bandY += 20;
  });

  doc.x = PAGE_MARGIN;
  doc.y = boxY + boxH + 20;
}

function drawBarRows(doc: PDFKit.PDFDocument, rows: { label: string; value: number | null }[], emptyText: string) {
  if (rows.length === 0) {
    bodyText(doc, emptyText);
    doc.y += 8;
    return;
  }
  const labelW = 170;
  const scoreW = 40;
  const barW = contentWidth(doc) - labelW - scoreW - 10;
  const trackX = PAGE_MARGIN + labelW;
  rows.forEach((row) => {
    ensureSpace(doc, 22);
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY).text(row.label, PAGE_MARGIN, y, { width: labelW - 10, height: 14, ellipsis: true });
    doc.roundedRect(trackX, y + 2, barW, 8, 4).fillColor(IVORY).fill();
    const pct = Math.max(0, Math.min(100, row.value ?? 0));
    if (pct > 0) doc.roundedRect(trackX, y + 2, (barW * pct) / 100, 8, 4).fillColor(PLUM).fill();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_PRIMARY).text(displayScore(row.value), trackX + barW + 10, y, { width: scoreW });
    doc.x = PAGE_MARGIN;
    doc.y = y + 20;
  });
  doc.y += 6;
}

// One row per student: name, submission count, average score - used by the
// class Performance PDF's "share all students' data" table. Sorted the same
// way ai-analytics.ts already returns them (weakest-first), so a teacher
// scanning top-to-bottom sees who needs attention first.
function drawStudentTable(doc: PDFKit.PDFDocument, students: { fullName: string; averageScore: number; submissionCount: number }[]) {
  if (students.length === 0) {
    bodyText(doc, "No graded submissions yet for this class.");
    doc.y += 8;
    return;
  }
  const scoreW = 60;
  const countW = 110;
  const nameW = contentWidth(doc) - scoreW - countW;
  students.forEach((s) => {
    ensureSpace(doc, 22);
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY).text(s.fullName, PAGE_MARGIN, y, { width: nameW - 10, height: 14, ellipsis: true });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(TEXT_MUTED)
      .text(`${s.submissionCount} submission${s.submissionCount === 1 ? "" : "s"}`, PAGE_MARGIN + nameW, y, { width: countW });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_PRIMARY).text(displayScore(s.averageScore), PAGE_MARGIN + nameW + countW, y, { width: scoreW, align: "right" });
    doc.x = PAGE_MARGIN;
    doc.y = y + 20;
  });
  doc.y += 6;
}

// One row per assignment: title, submitted date, score - used by the
// per-student Performance PDF's submission history.
function drawHistoryTable(doc: PDFKit.PDFDocument, history: { assignmentTitle: string; score: number | null; submittedAt: string }[]) {
  if (history.length === 0) {
    bodyText(doc, "No graded submissions yet.");
    doc.y += 8;
    return;
  }
  const scoreW = 60;
  const dateW = 90;
  const titleW = contentWidth(doc) - scoreW - dateW;
  history.forEach((h) => {
    ensureSpace(doc, 22);
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY).text(h.assignmentTitle, PAGE_MARGIN, y, { width: titleW - 10, height: 14, ellipsis: true });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(TEXT_MUTED)
      .text(new Date(h.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), PAGE_MARGIN + titleW, y, { width: dateW });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT_PRIMARY).text(displayScore(h.score), PAGE_MARGIN + titleW + dateW, y, { width: scoreW, align: "right" });
    doc.x = PAGE_MARGIN;
    doc.y = y + 20;
  });
  doc.y += 6;
}

export interface ClassPerformancePdfInput {
  className: string;
  sectionName: string;
  // "All subjects", a subject name, or a topic name - whatever scope the
  // Analytics tab's picker was set to when this was exported.
  scopeLabel: string;
  classAverage: number | null;
  submissionCount: number;
  scoreBands: { above80: number; between60And80: number; below60: number };
  struggleAreas: { assignmentId: string; title: string; averageScore: number }[];
  weeklyTrend: { label: string; score: number | null }[];
  students: { fullName: string; averageScore: number; submissionCount: number }[];
}

export async function buildClassPerformancePdf(input: ClassPerformancePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", bufferPages: true });
  doc.on("pageAdded", () => drawContinuationHeader(doc));

  drawBanner(doc, "Performance Report", `${input.className} - ${input.sectionName}`, input.scopeLabel);

  drawMetrics(doc, [
    { label: "Students graded", value: String(input.students.length) },
    { label: "Average attainment", value: displayScore(input.classAverage) },
    { label: "Graded work", value: String(input.submissionCount) },
  ]);

  sectionTitle(doc, "Overall attainment", AMBER);
  drawScoreOverview(doc, input.classAverage, input.scoreBands);

  sectionTitle(doc, "Attainment by assignment", AMBER);
  drawBarRows(
    doc,
    input.struggleAreas.map((a) => ({ label: a.title, value: a.averageScore })),
    "No graded assignments yet."
  );

  sectionTitle(doc, "Learning momentum (last 7 days)", AMBER);
  drawBarRows(
    doc,
    input.weeklyTrend.map((d) => ({ label: d.label, value: d.score })),
    "No graded work in the last 7 days."
  );

  sectionTitle(doc, "Students", AMBER);
  drawStudentTable(doc, input.students);

  drawFooters(doc);
  return docToBuffer(doc);
}

export interface StudentPerformancePdfInput {
  fullName: string;
  className: string;
  sectionName: string;
  scopeLabel: string;
  averageScore: number | null;
  history: { assignmentTitle: string; score: number | null; submittedAt: string }[];
  insights: {
    byObjective: { text: string; averagePercent: number; questionCount: number }[];
    byDifficulty: { difficulty: string; averagePercent: number; questionCount: number }[];
    byTopic: { topicName: string; averagePercent: number; questionCount: number }[];
    strongest: { label: string; averagePercent: number }[];
    weakest: { label: string; averagePercent: number }[];
    aiSummary: string;
    aiNextStep: string;
  };
}

export async function buildStudentPerformancePdf(input: StudentPerformancePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", bufferPages: true });
  doc.on("pageAdded", () => drawContinuationHeader(doc));

  drawBanner(doc, input.fullName, `${input.className} - ${input.sectionName}`, input.scopeLabel);

  doc.font("Helvetica-Oblique").fontSize(8).fillColor(TEXT_MUTED).text("Confidential - contains individual student performance data.", PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
  doc.x = PAGE_MARGIN;
  doc.y += 12;

  drawMetrics(doc, [
    { label: "Average score", value: displayScore(input.averageScore) },
    { label: "Graded submissions", value: String(input.history.length) },
  ]);

  sectionTitle(doc, "Insights", AMBER);
  bodyText(doc, input.insights.aiSummary);
  doc.y += 8;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(PLUM).text("Suggested next step: ", PAGE_MARGIN, doc.y, { continued: true });
  doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY).text(input.insights.aiNextStep);
  doc.x = PAGE_MARGIN;
  doc.y += 14;

  if (input.insights.strongest.length > 0 || input.insights.weakest.length > 0) {
    for (const s of input.insights.strongest) {
      ensureSpace(doc, 16);
      doc.font("Helvetica").fontSize(10).fillColor("#18A957").text(`+ Strong on: ${s.label} (${Math.round(s.averagePercent)}%)`, PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
      doc.x = PAGE_MARGIN;
      doc.y += 4;
    }
    for (const w of input.insights.weakest) {
      ensureSpace(doc, 16);
      doc.font("Helvetica").fontSize(10).fillColor("#C0392B").text(`- Needs work on: ${w.label} (${Math.round(w.averagePercent)}%)`, PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
      doc.x = PAGE_MARGIN;
      doc.y += 4;
    }
    doc.y += 10;
  }

  if (input.insights.byObjective.length > 0) {
    sectionTitle(doc, "By learning objective", AMBER);
    drawBarRows(
      doc,
      input.insights.byObjective.map((o) => ({ label: o.text, value: o.averagePercent })),
      "Not enough graded, tagged questions yet."
    );
  }

  if (input.insights.byDifficulty.length > 0) {
    sectionTitle(doc, "By difficulty", AMBER);
    drawBarRows(
      doc,
      input.insights.byDifficulty.map((d) => ({ label: d.difficulty.charAt(0).toUpperCase() + d.difficulty.slice(1), value: d.averagePercent })),
      "Not enough graded questions yet."
    );
  }

  if (input.insights.byTopic.length > 0) {
    sectionTitle(doc, "By topic", AMBER);
    drawBarRows(
      doc,
      input.insights.byTopic.map((t) => ({ label: t.topicName, value: t.averagePercent })),
      "Not enough graded questions yet."
    );
  }

  sectionTitle(doc, "Submission history", AMBER);
  drawHistoryTable(doc, input.history);

  drawFooters(doc);
  return docToBuffer(doc);
}

function drawFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - PAGE_MARGIN + 14;
    // y sits deliberately inside the bottom margin whitespace (below the
    // content boundary) - PDFKit's .text() auto-paginates whenever y exceeds
    // page.height - margins.bottom, so left at its real value this silently
    // appended a whole new blank page per line of footer text instead of
    // drawing here. Zeroing the bottom margin just for these two draws lifts
    // that check without affecting anything else on the page.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(PAGE_MARGIN, y - 8).lineTo(doc.page.width - PAGE_MARGIN, y - 8).strokeColor(BORDER).lineWidth(1).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(TEXT_MUTED).text("Generated with Eduwand", PAGE_MARGIN, y, { width: 200, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.width - PAGE_MARGIN - 150, y, { width: 150, align: "right", lineBreak: false });
    doc.page.margins.bottom = originalBottomMargin;
  }
}

export async function buildTopicAttainmentReportPdf(report: TopicAttainmentReport): Promise<Buffer> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", bufferPages: true });
  doc.on("pageAdded", () => drawContinuationHeader(doc));

  drawBanner(doc, report.topicName, `${report.className} - ${report.sectionName}`, report.subject);

  drawMetrics(doc, [
    { label: "Students", value: String(report.studentCount) },
    { label: "Average attainment", value: displayScore(report.averageScore) },
    { label: "Graded submissions", value: String(report.gradedSubmissionCount) },
  ]);

  sectionTitle(doc, "Overall attainment", AMBER);
  drawScoreOverview(doc, report.averageScore, report.scoreBands);

  sectionTitle(doc, "Attainment by assignment", AMBER);
  drawBarRows(
    doc,
    report.assignmentAttainment.map((a) => ({ label: a.title, value: a.averageScore })),
    "No graded assignments for this topic yet."
  );

  sectionTitle(doc, "What was done", AMBER);
  if (report.generationSummaries.length === 0) {
    bodyText(doc, "No generations recorded for this topic yet.");
    doc.y += 8;
  } else {
    report.generationSummaries.forEach((item, index) => {
      ensureSpace(doc, 34);
      if (index > 0) doc.y += 10;
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(PLUM).text(item.label, PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
      doc.x = PAGE_MARGIN;
      doc.font("Helvetica").fontSize(10).fillColor(TEXT_MUTED).text(item.summary, PAGE_MARGIN, doc.y + 2, { width: contentWidth(doc), lineGap: 2 });
      doc.x = PAGE_MARGIN;
    });
    doc.y += 8;
  }

  sectionTitle(doc, "Outcomes", AMBER);
  bodyText(doc, report.outcomes ?? "Not recorded yet.");
  doc.y += 8;

  sectionTitle(doc, "Class notes", AMBER);
  if (report.observations.length === 0) {
    bodyText(doc, "No notes recorded for this topic yet.");
  } else {
    for (let i = 0; i < report.observations.length; i++) {
      const note = report.observations[i];
      ensureSpace(doc, 40);
      if (i > 0) doc.y += 12;
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(TEXT_MUTED)
        .text(new Date(note.recordedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
      doc.x = PAGE_MARGIN;
      doc.font("Helvetica").fontSize(10).fillColor(TEXT_PRIMARY).text(note.body, PAGE_MARGIN, doc.y + 2, { width: contentWidth(doc), lineGap: 2 });
      doc.x = PAGE_MARGIN;
      if (note.photoUrl) {
        const photoBuffer = await fetchImageBuffer(note.photoUrl);
        if (photoBuffer) {
          ensureSpace(doc, 160);
          try {
            doc.image(photoBuffer, PAGE_MARGIN, doc.y + 6, { fit: [220, 150] });
            doc.y += 156;
          } catch {
            // Unsupported image format - skip this note's photo, keep its text.
          }
          doc.x = PAGE_MARGIN;
        }
      }
    }
  }

  drawFooters(doc);
  return docToBuffer(doc);
}

export async function buildSubjectAttainmentReportPdf(report: SubjectAttainmentReport): Promise<Buffer> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", bufferPages: true });
  doc.on("pageAdded", () => drawContinuationHeader(doc));

  drawBanner(doc, report.subject, `${report.className} - ${report.sectionName}`, `${report.topicCount} topic${report.topicCount === 1 ? "" : "s"}`);

  drawMetrics(doc, [
    { label: "Students", value: String(report.studentCount) },
    { label: "Average attainment", value: displayScore(report.averageScore) },
    { label: "Graded submissions", value: String(report.gradedSubmissionCount) },
  ]);

  sectionTitle(doc, "Overall attainment", AMBER);
  drawScoreOverview(doc, report.averageScore, report.scoreBands);

  sectionTitle(doc, "Attainment by topic", AMBER);
  drawBarRows(
    doc,
    report.perTopicAttainment.filter((t) => t.averageScore !== null).map((t) => ({ label: t.topicName, value: t.averageScore })),
    "No graded topics for this subject yet."
  );

  drawFooters(doc);
  return docToBuffer(doc);
}
