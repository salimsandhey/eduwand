import PDFDocument from "pdfkit";
import { PresentationContent, PresentationColorScheme } from "./ai";
import { SLIDE_W, SLIDE_H, MARGIN_X, CONTENT_TOP, CONTENT_BOTTOM, CONTENT_W, TYPE, buildPalette, bodySizeFor, type DeckPalette } from "./presentationDesign";

// Same 4 presets pptxExport.ts and PresentationView.tsx use, kept in sync
// manually - there's no shared package between the export libraries either.
const COLOR_SCHEME_PRESETS: Record<PresentationColorScheme, { background: string; accent: string }> = {
  indigo: { background: "2A2B6A", accent: "8C7CFF" },
  coral: { background: "7A2E2E", accent: "FF8A7A" },
  forest: { background: "1F3D2E", accent: "6FD79B" },
  slate: { background: "2B2F36", accent: "9FB4C7" },
};

// The layout is expressed in inches on the same 13.33 x 7.5 slide as the PPTX
// export (see presentationDesign.ts) and converted here, so both exports share
// one design. 1 inch = 72pt, so the page is 960 x 540pt.
const PT = 72;
const inch = (v: number) => v * PT;
const HEADLINE = "Times-Bold";
const BODY = "Helvetica";
const BODY_BOLD = "Helvetica-Bold";

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

const hex = (c: string) => `#${c}`;

interface TextOpts {
  size: number;
  color: string;
  font?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle";
  lineGap?: number;
}

// Draws text inside a box (inches), optionally vertically centred. Shrinks the
// size until it fits the box height so nothing overflows into what's below.
function textBox(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number, h: number, o: TextOpts) {
  let size = o.size;
  const font = o.font ?? BODY;
  const measure = (s: number) => {
    doc.font(font).fontSize(s);
    return doc.heightOfString(text, { width: inch(w), lineGap: o.lineGap ?? s * 0.2 });
  };
  while (size > 10 && measure(size) > inch(h)) size -= 1;
  const textH = measure(size);
  const top = o.valign === "middle" ? inch(y) + Math.max(0, (inch(h) - textH) / 2) : inch(y);
  doc.font(font).fontSize(size).fillColor(hex(o.color)).text(text, inch(x), top, { width: inch(w), align: o.align ?? "left", lineGap: o.lineGap ?? size * 0.2 });
  return size;
}

function panel(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string, radius = 0.15, stroke?: { color: string; width: number }) {
  doc.roundedRect(inch(x), inch(y), inch(w), inch(h), inch(radius)).fill(hex(color));
  if (stroke) doc.roundedRect(inch(x), inch(y), inch(w), inch(h), inch(radius)).lineWidth(stroke.width).stroke(hex(stroke.color));
}

function circle(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, color: string, opacity = 1) {
  doc.save().fillOpacity(opacity).circle(inch(cx), inch(cy), inch(r)).fill(hex(color)).restore();
}

function badge(doc: PDFKit.PDFDocument, label: string, cx: number, cy: number, r: number, P: DeckPalette, size: number) {
  circle(doc, cx, cy, r, P.accent);
  textBox(doc, label, cx - r, cy - r, r * 2, r * 2, { size, color: P.onAccent, font: BODY_BOLD, align: "center", valign: "middle" });
}

function bulletList(doc: PDFKit.PDFDocument, lines: string[], x: number, y: number, w: number, h: number, size: number, P: DeckPalette, valign: "top" | "middle" = "middle") {
  const gap = size * 0.7;
  const measure = (s: number) => {
    doc.font(BODY).fontSize(s);
    return lines.reduce((n, l) => n + doc.heightOfString(l, { width: inch(w) - s * 1.4, lineGap: s * 0.2 }) + gap, -gap);
  };
  let s = size;
  while (s > 10 && measure(s) > inch(h)) s -= 1;
  const total = measure(s);
  let cursor = inch(y) + (valign === "middle" ? Math.max(0, (inch(h) - total) / 2) : 0);
  for (const line of lines) {
    doc.circle(inch(x) + s * 0.3, cursor + s * 0.6, s * 0.16).fill(hex(P.accent));
    doc.font(BODY).fontSize(s).fillColor(hex(P.text)).text(line, inch(x) + s * 1.4, cursor, { width: inch(w) - s * 1.4, lineGap: s * 0.2 });
    cursor = doc.y + s * 0.7;
  }
}

function titleBlock(doc: PDFKit.PDFDocument, title: string, P: DeckPalette): number {
  textBox(doc, title, MARGIN_X, 0.45, CONTENT_W - 1.5, 1.0, { size: TYPE.title, color: P.text, font: HEADLINE, valign: "middle" });
  doc.rect(inch(MARGIN_X), inch(1.5), inch(1.1), inch(0.07)).fill(hex(P.accent));
  return CONTENT_TOP;
}

function chrome(doc: PDFKit.PDFDocument, P: DeckPalette, footerLabel: string | null, index: number, skipFooter: boolean) {
  doc.rect(0, 0, inch(SLIDE_W), inch(0.14)).fill(hex(P.accent));
  if (skipFooter) return;
  doc.moveTo(inch(MARGIN_X), inch(SLIDE_H - 0.55)).lineTo(inch(SLIDE_W - MARGIN_X), inch(SLIDE_H - 0.55)).lineWidth(1).stroke(hex(P.panelAlt));
  if (footerLabel) textBox(doc, footerLabel, MARGIN_X, SLIDE_H - 0.5, CONTENT_W - 1, 0.35, { size: TYPE.footer, color: P.muted, valign: "middle" });
  textBox(doc, String(index + 1), SLIDE_W - MARGIN_X - 1, SLIDE_H - 0.5, 1, 0.35, { size: TYPE.footer, color: P.muted, align: "right", valign: "middle" });
}

function renderSlide(doc: PDFKit.PDFDocument, slide: PresentationContent["slides"][number], P: DeckPalette, footerLabel: string | null, index: number) {
  const title = stripBloomTag(slide.title || "");
  const bullets = slide.bullets ?? [];
  const items = slide.items ?? [];
  const layout = slide.layout ?? "bullets";
  const bg = layout === "divider" ? P.accent : P.background;
  doc.rect(0, 0, inch(SLIDE_W), inch(SLIDE_H)).fill(hex(bg));
  let skipFooter = false;

  switch (layout) {
    case "title": {
      circle(doc, SLIDE_W - 2.2, SLIDE_H - 0.6, 4, P.panelAlt);
      circle(doc, SLIDE_W - 1.9, SLIDE_H - 0.9, 2.5, P.accent, 0.45);
      doc.rect(inch(MARGIN_X + 0.2), inch(2.35), inch(1.4), inch(0.09)).fill(hex(P.accent));
      textBox(doc, title, MARGIN_X + 0.2, 2.6, 8.2, 2.6, { size: TYPE.display, color: P.text, font: HEADLINE });
      if (bullets[0]) textBox(doc, bullets[0], MARGIN_X + 0.2, 5.3, 8.2, 0.9, { size: TYPE.bodySmall, color: P.muted });
      break;
    }
    case "divider": {
      skipFooter = true;
      circle(doc, SLIDE_W - 1.5, 1.5, 3.5, P.onAccent, 0.1);
      doc.rect(inch(MARGIN_X), inch(SLIDE_H / 2 - 1.25), inch(1.2), inch(0.09)).fill(hex(P.onAccent));
      textBox(doc, title, MARGIN_X, SLIDE_H / 2 - 0.85, SLIDE_W - MARGIN_X * 2 - 1, 2.3, { size: TYPE.display - 4, color: P.onAccent, font: HEADLINE });
      break;
    }
    case "big_statement":
    case "stat":
    case "quote": {
      textBox(doc, "“", MARGIN_X, 0.7, 2, 1.8, { size: 130, color: P.accent, font: HEADLINE });
      textBox(doc, title, MARGIN_X + 0.4, 1.9, CONTENT_W - 0.8, 3.0, { size: TYPE.display - 6, color: P.text, font: HEADLINE, valign: "middle" });
      if (bullets[0]) {
        doc.rect(inch(MARGIN_X + 0.4), inch(5.15), inch(1.0), inch(0.06)).fill(hex(P.accent));
        textBox(doc, bullets[0], MARGIN_X + 0.4, 5.35, CONTENT_W - 0.8, 1.0, { size: TYPE.bodySmall, color: P.muted });
      }
      break;
    }
    case "definition": {
      const top = titleBlock(doc, title, P);
      panel(doc, MARGIN_X, top, CONTENT_W, CONTENT_BOTTOM - top, P.panel);
      doc.rect(inch(MARGIN_X), inch(top + 0.35), inch(0.12), inch(CONTENT_BOTTOM - top - 0.7)).fill(hex(P.accent));
      const text = bullets.join(" ");
      textBox(doc, text, MARGIN_X + 0.6, top + 0.3, CONTENT_W - 1.2, CONTENT_BOTTOM - top - 0.6, { size: bodySizeFor([text], 380) + 2, color: P.text, valign: "middle" });
      break;
    }
    case "compare_2col": {
      const top = titleBlock(doc, title, P);
      const cols = (slide.columns ?? []).slice(0, 2);
      const gap = 0.4;
      const colW = (CONTENT_W - gap * (cols.length - 1)) / Math.max(cols.length, 1);
      const h = CONTENT_BOTTOM - top;
      cols.forEach((col, i) => {
        const x = MARGIN_X + i * (colW + gap);
        panel(doc, x, top, colW, h, P.panel);
        panel(doc, x, top, colW, 0.75, P.accent);
        textBox(doc, col.heading, x + 0.3, top, colW - 0.6, 0.75, { size: TYPE.bodySmall, color: P.onAccent, font: BODY_BOLD, valign: "middle" });
        bulletList(doc, col.rows, x + 0.3, top + 0.95, colW - 0.6, h - 1.15, bodySizeFor(col.rows, 520) - 4, P, "top");
      });
      break;
    }
    case "process_flow":
    case "timeline": {
      const top = titleBlock(doc, title, P);
      const steps = items.slice(0, 6);
      const arrowW = 0.5;
      const boxW = (CONTENT_W - arrowW * Math.max(steps.length - 1, 0)) / Math.max(steps.length, 1);
      const boxH = Math.min(steps.some((s) => s.description) ? 3.4 : 2.4, CONTENT_BOTTOM - top);
      const boxY = top + (CONTENT_BOTTOM - top - boxH) / 2;
      steps.forEach((step, i) => {
        const x = MARGIN_X + i * (boxW + arrowW);
        panel(doc, x, boxY, boxW, boxH, P.panel, 0.15, { color: P.accent, width: 1.5 });
        badge(doc, String(i + 1), x + boxW / 2, boxY + 0.55, 0.3, P, 18);
        textBox(doc, step.title, x + 0.15, boxY + 1.0, boxW - 0.3, step.description ? 0.9 : boxH - 1.2, { size: steps.length > 4 ? 15 : 19, color: P.text, font: BODY_BOLD, align: "center" });
        if (step.description) textBox(doc, step.description, x + 0.15, boxY + 1.9, boxW - 0.3, boxH - 2.05, { size: 13, color: P.muted, align: "center" });
        if (i < steps.length - 1) {
          const ax = inch(x + boxW + arrowW / 2);
          const ay = inch(boxY + boxH / 2);
          doc.polygon([ax - 6, ay - 10], [ax + 6, ay], [ax - 6, ay + 10]).fill(hex(P.accent));
        }
      });
      break;
    }
    case "step": {
      const total = slide.stepTotal ?? 1;
      const idx = slide.stepIndex ?? 1;
      panel(doc, MARGIN_X, 0.6, 1.9, 0.5, P.accent, 0.25);
      textBox(doc, `STEP ${idx} OF ${total}`, MARGIN_X, 0.6, 1.9, 0.5, { size: 13, color: P.onAccent, font: BODY_BOLD, align: "center", valign: "middle" });
      panel(doc, MARGIN_X + 2.2, 0.8, CONTENT_W - 2.2, 0.1, P.panelAlt, 0.05);
      panel(doc, MARGIN_X + 2.2, 0.8, Math.max(0.2, ((CONTENT_W - 2.2) * idx) / total), 0.1, P.accent, 0.05);
      textBox(doc, String(idx), MARGIN_X, 1.5, 2.2, 2.4, { size: 130, color: P.accent, font: HEADLINE, valign: "middle" });
      textBox(doc, title, MARGIN_X + 2.5, 1.6, CONTENT_W - 2.5, 1.2, { size: TYPE.title, color: P.text, font: HEADLINE, valign: "middle" });
      panel(doc, MARGIN_X, 4.1, CONTENT_W, CONTENT_BOTTOM - 4.1, P.panel);
      bulletList(doc, bullets, MARGIN_X + 0.4, 4.25, CONTENT_W - 0.8, CONTENT_BOTTOM - 4.4, bodySizeFor(bullets, 300) - 4, P);
      break;
    }
    case "card_grid":
    case "icon-grid":
    case "stat-grid": {
      const top = titleBlock(doc, title, P);
      const cards = items.slice(0, 6);
      const cols = cards.length <= 2 ? cards.length || 1 : cards.length === 4 ? 2 : 3;
      const rows = Math.ceil(cards.length / cols);
      const gap = 0.3;
      const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
      const cardH = Math.min(3.4, (CONTENT_BOTTOM - top - gap * (rows - 1)) / rows);
      const startY = top + (CONTENT_BOTTOM - top - (cardH * rows + gap * (rows - 1))) / 2;
      cards.forEach((card, i) => {
        const x = MARGIN_X + (i % cols) * (cardW + gap);
        const y = startY + Math.floor(i / cols) * (cardH + gap);
        panel(doc, x, y, cardW, cardH, P.panel);
        doc.rect(inch(x + 0.3), inch(y + 0.3), inch(0.7), inch(0.07)).fill(hex(P.accent));
        textBox(doc, card.title, x + 0.3, y + 0.45, cardW - 0.6, 0.8, { size: rows > 1 ? 20 : 24, color: P.text, font: HEADLINE, valign: "middle" });
        if (card.description) textBox(doc, card.description, x + 0.3, y + 1.25, cardW - 0.6, cardH - 1.45, { size: rows > 1 ? 15 : 18, color: P.muted });
      });
      break;
    }
    case "table": {
      const top = titleBlock(doc, title, P);
      const t = slide.table;
      if (t) {
        const rowsN = t.rows.length + 1;
        const rowH = Math.min(rowsN <= 5 ? 1.0 : 0.85, (CONTENT_BOTTOM - top) / rowsN);
        const colW = CONTENT_W / Math.max(t.headers.length, 1);
        const size = rowsN > 7 ? 15 : rowsN > 5 ? 18 : 22;
        [t.headers, ...t.rows].forEach((row, ri) => {
          const y = top + ri * rowH;
          const fill = ri === 0 ? P.accent : ri % 2 === 0 ? P.panelAlt : P.panel;
          doc.rect(inch(MARGIN_X), inch(y), inch(CONTENT_W), inch(rowH)).fill(hex(fill));
          row.forEach((cell, ci) => {
            textBox(doc, cell, MARGIN_X + ci * colW + 0.15, y, colW - 0.3, rowH, {
              size, color: ri === 0 ? P.onAccent : P.text, font: ri === 0 ? BODY_BOLD : BODY, valign: "middle",
            });
          });
        });
      }
      break;
    }
    case "callout": {
      const cy = 1.5;
      const ch = 4.3;
      panel(doc, MARGIN_X, cy, CONTENT_W, ch, P.panel, 0.2, { color: P.accent, width: 3 });
      badge(doc, slide.calloutIcon ?? "!", MARGIN_X + 1.35, cy + 1.35, 0.75, P, 60);
      textBox(doc, title.toUpperCase(), MARGIN_X + 2.5, cy + 0.5, CONTENT_W - 3.1, 0.9, { size: TYPE.title, color: P.accent, font: HEADLINE, valign: "middle" });
      const body = slide.calloutBody ?? "";
      textBox(doc, body, MARGIN_X + 2.5, cy + 1.5, CONTENT_W - 3.1, ch - 1.9, { size: bodySizeFor([body], 300), color: P.text });
      break;
    }
    case "recap_bridge":
    case "closing_recap": {
      const top = titleBlock(doc, title, P);
      const points = bullets.slice(0, 5);
      const gap = 0.25;
      const rowH = Math.min(1.35, (CONTENT_BOTTOM - top - gap * (points.length - 1)) / Math.max(points.length, 1));
      points.forEach((b, i) => {
        const y = top + i * (rowH + gap);
        panel(doc, MARGIN_X, y, CONTENT_W, rowH, P.panel);
        badge(doc, String(i + 1), MARGIN_X + 0.65, y + rowH / 2, 0.35, P, 22);
        textBox(doc, b, MARGIN_X + 1.3, y, CONTENT_W - 1.6, rowH, { size: Math.max(bodySizeFor(points, 500) - 2, 18), color: P.text, valign: "middle" });
      });
      break;
    }
    case "bullets":
    default: {
      const top = titleBlock(doc, title, P);
      panel(doc, MARGIN_X, top, CONTENT_W, CONTENT_BOTTOM - top, P.panel);
      bulletList(doc, bullets, MARGIN_X + 0.5, top + 0.2, CONTENT_W - 1.0, CONTENT_BOTTOM - top - 0.4, bodySizeFor(bullets), P);
      break;
    }
  }

  chrome(doc, P, footerLabel, index, skipFooter);
}

// Step 10's PDF export - one page per slide, the same 14-layout design as
// buildPresentationPptx (pptxExport.ts), drawn with pdfkit primitives.
export async function buildPresentationPdf(content: PresentationContent): Promise<Buffer> {
  const preset = COLOR_SCHEME_PRESETS[content.colorScheme ?? "indigo"];
  const background = (content.primaryColor ?? preset.background).replace("#", "");
  const accent = (content.secondaryColor ?? preset.accent).replace("#", "");
  const P = buildPalette(background, accent);
  const footerLabel = content.footerLabel ?? null;

  const size: [number, number] = [inch(SLIDE_W), inch(SLIDE_H)];
  const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false });
  content.slides.forEach((slide, i) => {
    doc.addPage({ size, margin: 0 });
    renderSlide(doc, slide, P, footerLabel, i);
  });
  return docToBuffer(doc);
}
