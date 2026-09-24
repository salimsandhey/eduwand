import PDFDocument from "pdfkit";
import { PresentationContent, PresentationColorScheme } from "./ai";

// Same 4 presets pptxExport.ts and PresentationView.tsx use, kept in sync
// manually - there's no shared package between the export libraries either.
const COLOR_SCHEME_PRESETS: Record<PresentationColorScheme, { background: string; accent: string }> = {
  indigo: { background: "#2A2B6A", accent: "#8C7CFF" },
  coral: { background: "#7A2E2E", accent: "#FF8A7A" },
  forest: { background: "#1F3D2E", accent: "#6FD79B" },
  slate: { background: "#2B2F36", accent: "#9FB4C7" },
};

// 16:9 at a comfortable point size - matches the app's/export's fixed aspect
// ratio (spec: "Aspect ratio - Always 16:9 - Not asked").
const PAGE_WIDTH = 960;
const PAGE_HEIGHT = 540;
const MARGIN = 48;

const BLOOM_TAG_RE = /^\[(Remember|Understand|Apply|Analyze|Evaluate|Create)\]\s*/i;
function stripBloomTag(text: string): string {
  return text.replace(BLOOM_TAG_RE, "");
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

function drawChrome(doc: PDFKit.PDFDocument, accent: string, footerLabel: string | null) {
  doc.rect(0, 0, PAGE_WIDTH, 6).fill(accent);
  if (footerLabel) {
    doc.fillColor(accent).fontSize(8).text(footerLabel, MARGIN, PAGE_HEIGHT - 24, { width: PAGE_WIDTH - MARGIN * 2, align: "right" });
  }
}

function drawBulletList(doc: PDFKit.PDFDocument, items: string[], x: number, y: number, w: number, color: string, fontSize = 16) {
  doc.fillColor(color).fontSize(fontSize);
  let cursorY = y;
  for (const item of items) {
    doc.circle(x + 4, cursorY + fontSize * 0.55, 2.5).fill(color);
    doc.fillColor(color).text(item, x + 16, cursorY, { width: w - 16 });
    cursorY = doc.y + 8;
  }
}

// One landscape page per slide, drawn with pdfkit primitives - a simpler
// rendering than the pptx export's shape library, but the same 14 layouts
// and the same "rendered from the in-app layout" content (spec step 10:
// "PDF - Rendered from the in-app layout").
function renderSlide(doc: PDFKit.PDFDocument, slide: PresentationContent["slides"][number], background: string, accent: string, footerLabel: string | null) {
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(background);
  const title = stripBloomTag(slide.title || "");
  const bullets = slide.bullets ?? [];
  const items = slide.items ?? [];
  const layout = slide.layout ?? "bullets";

  switch (layout) {
    case "title": {
      doc.fillColor("#FFFFFF").fontSize(40).text(title, MARGIN, PAGE_HEIGHT / 2 - 40, { width: PAGE_WIDTH - MARGIN * 2, align: "center" });
      break;
    }
    case "divider": {
      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(accent);
      doc.fillColor("#FFFFFF").fontSize(34).text(title, MARGIN, PAGE_HEIGHT / 2 - 30, { width: PAGE_WIDTH - MARGIN * 2, align: "center" });
      break;
    }
    case "big_statement":
    case "stat":
    case "quote": {
      doc.fillColor("#FFFFFF").fontSize(32).text(title, MARGIN * 2, PAGE_HEIGHT / 2 - 60, { width: PAGE_WIDTH - MARGIN * 4, align: "center" });
      if (bullets[0]) doc.fontSize(15).fillColor("#E3E3F0").text(bullets[0], MARGIN * 2, PAGE_HEIGHT / 2 + 40, { width: PAGE_WIDTH - MARGIN * 4, align: "center" });
      break;
    }
    case "definition": {
      doc.fillColor("#FFFFFF").fontSize(28).text(title, MARGIN, MARGIN + 20, { width: PAGE_WIDTH - MARGIN * 2 });
      doc.fillColor("#E3E3F0").fontSize(16).text(bullets.join(" "), MARGIN, MARGIN + 70, { width: PAGE_WIDTH - MARGIN * 2 });
      break;
    }
    case "compare_2col": {
      doc.fillColor("#FFFFFF").fontSize(22).text(title, MARGIN, MARGIN + 10, { width: PAGE_WIDTH - MARGIN * 2 });
      const cols = (slide.columns ?? []).slice(0, 2);
      const colW = (PAGE_WIDTH - MARGIN * 2 - 24) / Math.max(cols.length, 1);
      cols.forEach((col, i) => {
        const x = MARGIN + i * (colW + 24);
        doc.fillColor(accent).fontSize(14).text(col.heading, x, MARGIN + 60, { width: colW });
        drawBulletList(doc, col.rows, x, MARGIN + 90, colW, "#E3E3F0", 13);
      });
      break;
    }
    case "process_flow": {
      doc.fillColor("#FFFFFF").fontSize(22).text(title, MARGIN, MARGIN + 10, { width: PAGE_WIDTH - MARGIN * 2 });
      const steps = items.slice(0, 6);
      const gap = 12;
      const boxW = (PAGE_WIDTH - MARGIN * 2 - gap * (steps.length - 1)) / Math.max(steps.length, 1);
      const boxY = PAGE_HEIGHT / 2 - 30;
      steps.forEach((step, i) => {
        const x = MARGIN + i * (boxW + gap);
        doc.roundedRect(x, boxY, boxW, 60, 6).fill(accent);
        doc.fillColor("#111111").fontSize(11).text(step.title, x + 6, boxY + 22, { width: boxW - 12, align: "center" });
      });
      break;
    }
    case "step": {
      if (slide.stepIndex && slide.stepTotal) {
        doc.fillColor(accent).fontSize(12).text(`STEP ${slide.stepIndex} OF ${slide.stepTotal}`, MARGIN, MARGIN);
      }
      doc.fillColor(accent).fontSize(52).text(String(slide.stepIndex ?? ""), MARGIN, MARGIN + 30);
      doc.fillColor("#FFFFFF").fontSize(24).text(title, MARGIN + 120, MARGIN + 40, { width: PAGE_WIDTH - MARGIN * 2 - 120 });
      drawBulletList(doc, bullets, MARGIN + 120, MARGIN + 90, PAGE_WIDTH - MARGIN * 2 - 120, "#E3E3F0");
      break;
    }
    case "card_grid":
    case "icon-grid":
    case "stat-grid": {
      doc.fillColor("#FFFFFF").fontSize(22).text(title, MARGIN, MARGIN + 10, { width: PAGE_WIDTH - MARGIN * 2 });
      const cards = items.slice(0, 6);
      const cols = Math.min(cards.length, 3) || 1;
      const rowsN = Math.ceil(cards.length / cols);
      const gap = 14;
      const cardW = (PAGE_WIDTH - MARGIN * 2 - gap * (cols - 1)) / cols;
      const cardH = Math.min(120, (PAGE_HEIGHT - (MARGIN + 60) - MARGIN - gap * (rowsN - 1)) / rowsN);
      cards.forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = MARGIN + col * (cardW + gap);
        const y = MARGIN + 60 + row * (cardH + gap);
        doc.roundedRect(x, y, cardW, cardH, 6).fillOpacity(0.08).fill("#FFFFFF").fillOpacity(1);
        doc.fillColor(accent).fontSize(13).text(card.title, x + 10, y + 10, { width: cardW - 20 });
        if (card.description) doc.fillColor("#E3E3F0").fontSize(10).text(card.description, x + 10, y + 32, { width: cardW - 20 });
      });
      break;
    }
    case "table": {
      doc.fillColor("#FFFFFF").fontSize(22).text(title, MARGIN, MARGIN + 10, { width: PAGE_WIDTH - MARGIN * 2 });
      const t = slide.table;
      if (t) {
        const colW = (PAGE_WIDTH - MARGIN * 2) / Math.max(t.headers.length, 1);
        let y = MARGIN + 60;
        doc.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 26).fill(accent);
        t.headers.forEach((h, i) => doc.fillColor("#111111").fontSize(12).text(h, MARGIN + i * colW + 6, y + 7, { width: colW - 12 }));
        y += 26;
        for (const row of t.rows) {
          row.forEach((cell, i) => doc.fillColor("#E3E3F0").fontSize(11).text(cell, MARGIN + i * colW + 6, y + 6, { width: colW - 12 }));
          y += 24;
        }
      }
      break;
    }
    case "callout": {
      const badgeSize = 50;
      doc.roundedRect(MARGIN, MARGIN + 60, badgeSize, badgeSize, 10).fill(accent);
      doc.fillColor("#111111").fontSize(22).text(slide.calloutIcon ?? "!", MARGIN, MARGIN + 75, { width: badgeSize, align: "center" });
      doc.fillColor("#FFFFFF").fontSize(22).text(title, MARGIN + badgeSize + 16, MARGIN + 60, { width: PAGE_WIDTH - MARGIN * 2 - badgeSize - 16 });
      doc.fillColor("#E3E3F0").fontSize(15).text(slide.calloutBody ?? "", MARGIN + badgeSize + 16, MARGIN + 96, { width: PAGE_WIDTH - MARGIN * 2 - badgeSize - 16 });
      break;
    }
    case "timeline": {
      doc.fillColor("#FFFFFF").fontSize(22).text(title, MARGIN, MARGIN + 10, { width: PAGE_WIDTH - MARGIN * 2 });
      const steps = items.slice(0, 6);
      const gap = 12;
      const colW = (PAGE_WIDTH - MARGIN * 2 - gap * (steps.length - 1)) / Math.max(steps.length, 1);
      steps.forEach((step, i) => {
        const x = MARGIN + i * (colW + gap);
        doc.circle(x + 12, MARGIN + 80, 12).fill(accent);
        doc.fillColor("#FFFFFF").fontSize(10).text(String(i + 1), x + 8, MARGIN + 74, { width: 10 });
        doc.roundedRect(x, MARGIN + 100, colW, 100, 6).fillOpacity(0.08).fill("#FFFFFF").fillOpacity(1);
        doc.fillColor("#FFFFFF").fontSize(11).text(step.title, x + 6, MARGIN + 108, { width: colW - 12 });
        if (step.description) doc.fillColor("#D8D8E8").fontSize(9).text(step.description, x + 6, MARGIN + 128, { width: colW - 12 });
      });
      break;
    }
    case "recap_bridge":
    case "closing_recap":
    case "bullets":
    default: {
      doc.fillColor("#FFFFFF").fontSize(26).text(title, MARGIN, MARGIN + 10, { width: PAGE_WIDTH - MARGIN * 2 });
      drawBulletList(doc, bullets, MARGIN + 16, MARGIN + 70, PAGE_WIDTH - MARGIN * 2 - 16, "#E3E3F0");
      break;
    }
  }

  drawChrome(doc, accent, layout === "divider" ? null : footerLabel);
}

// Step 10's PDF export - one page per slide, matching the same 14-layout
// content as buildPresentationPptx (pptxExport.ts), rendered with pdfkit
// primitives instead of pptxgenjs shapes.
export async function buildPresentationPdf(content: PresentationContent): Promise<Buffer> {
  const preset = COLOR_SCHEME_PRESETS[content.colorScheme ?? "indigo"];
  const background = content.primaryColor ?? preset.background;
  const accent = content.secondaryColor ?? preset.accent;
  const footerLabel = content.footerLabel ?? null;

  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0, autoFirstPage: false });
  for (const slide of content.slides) {
    doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
    renderSlide(doc, slide, background, accent, footerLabel);
  }
  return docToBuffer(doc);
}
