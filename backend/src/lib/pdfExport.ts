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

function drawFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - PAGE_MARGIN + 14;
    doc.moveTo(PAGE_MARGIN, y - 8).lineTo(doc.page.width - PAGE_MARGIN, y - 8).strokeColor(BORDER).lineWidth(1).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(TEXT_MUTED).text("Generated with Eduwand", PAGE_MARGIN, y, { width: 200, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.width - PAGE_MARGIN - 150, y, { width: 150, align: "right", lineBreak: false });
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
