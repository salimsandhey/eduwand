import { readFileSync } from "fs";
import path from "path";
import { imageSize } from "image-size";
import PptxGenJS from "pptxgenjs";
import { PresentationContent, PresentationColorScheme, PresentationSlideLayout } from "./ai";
import { sniffImageMime, type MediaItem } from "./media";
import { SLIDE_W, SLIDE_H, MARGIN_X, CONTENT_TOP, CONTENT_BOTTOM, CONTENT_W, TYPE, buildPalette, bodySizeFor, type DeckPalette } from "./presentationDesign";

// The pixels behind an "image" slide's mediaId - an uploaded image, or one
// rendered page of a PDF - resolved by the caller (this module has no DB or
// storage access of its own).
export interface MediaAsset {
  data: Buffer;
  width: number;
  height: number;
}

// Same 4 presets PresentationView.tsx uses on mobile, kept in sync manually -
// there's no shared package between backend/unified-app to source this from.
const COLOR_SCHEME_PRESETS: Record<PresentationColorScheme, { background: string; accent: string }> = {
  indigo: { background: "2A2B6A", accent: "8C7CFF" },
  coral: { background: "7A2E2E", accent: "FF8A7A" },
  forest: { background: "1F3D2E", accent: "6FD79B" },
  slate: { background: "2B2F36", accent: "9FB4C7" },
};

const HEADLINE_FONT = "Georgia";
const BODY_FONT = "Calibri";

function hexOf(color: string | null | undefined, fallback: string): string {
  return (color ?? fallback).replace("#", "");
}

// The model was still instructed elsewhere to tag objectives with a leading
// "[Bloom level]" (see ai.ts) - presentations are excluded from that now,
// but existing already-generated decks still have it saved, and the model
// isn't 100% obedient anyway. Strip it from anywhere it shows up as
// rendered text rather than trusting it's gone.
const BLOOM_TAG_RE = /^\[(Remember|Understand|Apply|Analyze|Evaluate|Create)\]\s*/i;
function stripBloomTag(text: string): { tag: string | null; text: string } {
  const match = text.match(BLOOM_TAG_RE);
  if (!match) return { tag: null, text };
  return { tag: match[1], text: text.slice(match[0].length) };
}

// Sniffs the real format from magic bytes rather than trusting a URL's
// extension or a hardcoded guess - a mismatched declared type (e.g. calling
// PNG bytes "image/jpeg") produces a data URI PowerPoint/Google Slides can
// silently fail to render, which is exactly why school logos weren't
// showing up in exports. PNG is checked first since it's what most logos
// are saved as (only PNG supports the transparent background a logo needs).
function sniffImageMimeType(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF87a") return "image/gif";
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}

interface LogoAsset {
  data: string;
  w: number;
  h: number;
}

// pptxgenjs's `sizing: { type: "contain" }` does NOT actually read the
// image's real pixel dimensions (that code path is dead in the library
// internals) - it silently assumes the image already matches the box, which
// is exactly why a non-square logo came out stretched. We compute the
// correct aspect-preserving box ourselves instead of relying on it.
const LOGO_MAX_W = 1.3;
const LOGO_MAX_H = 0.7;
async function fetchLogoAsset(url: string | null | undefined): Promise<LogoAsset | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = sniffImageMimeType(buffer);
    const { width, height } = imageSize(buffer);
    if (!width || !height) return null;
    const scale = Math.min(LOGO_MAX_W / width, LOGO_MAX_H / height, 1);
    return {
      data: `data:${mimeType};base64,${buffer.toString("base64")}`,
      w: width * scale,
      h: height * scale,
    };
  } catch (err) {
    console.error("[pptxExport] logo fetch failed:", err);
    return null;
  }
}

// Curated icon set - keep this list in sync with
// scripts/generate-icon-assets.ts and unified-app/PresentationView.tsx's
// ICON_KEYWORDS (same "duplicated small table, kept in sync manually"
// pattern already used for COLOR_SCHEME_PRESETS).
const ICON_KEYWORDS: [string, string][] = [
  ["science", "flask-outline"],
  ["experiment", "flask-outline"],
  ["chemistry", "flask-outline"],
  ["math", "calculator-outline"],
  ["calculat", "calculator-outline"],
  ["number", "calculator-outline"],
  ["history", "time-outline"],
  ["time", "time-outline"],
  ["past", "time-outline"],
  ["geography", "globe-outline"],
  ["world", "globe-outline"],
  ["earth", "globe-outline"],
  ["global", "globe-outline"],
  ["idea", "bulb-outline"],
  ["concept", "bulb-outline"],
  ["think", "bulb-outline"],
  ["achieve", "trophy-outline"],
  ["goal", "trophy-outline"],
  ["success", "trophy-outline"],
  ["win", "trophy-outline"],
  ["question", "help-circle-outline"],
  ["quiz", "help-circle-outline"],
  ["why", "help-circle-outline"],
  ["correct", "checkmark-circle-outline"],
  ["check", "checkmark-circle-outline"],
  ["complete", "checkmark-circle-outline"],
  ["star", "star-outline"],
  ["important", "star-outline"],
  ["key", "star-outline"],
  ["nature", "leaf-outline"],
  ["plant", "leaf-outline"],
  ["biology", "leaf-outline"],
  ["environment", "leaf-outline"],
  ["space", "planet-outline"],
  ["planet", "planet-outline"],
  ["solar", "planet-outline"],
  ["astronomy", "planet-outline"],
  ["school", "school-outline"],
  ["class", "school-outline"],
  ["learn", "school-outline"],
];
const DEFAULT_ICON = "book-outline";

function pickIconForText(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, icon] of ICON_KEYWORDS) {
    if (lower.includes(keyword)) return icon;
  }
  return DEFAULT_ICON;
}

const ICONS_DIR = path.resolve(__dirname, "../assets/icons");
const iconDataCache = new Map<string, string>();
function iconData(iconName: string): string {
  const cached = iconDataCache.get(iconName);
  if (cached) return cached;
  const buffer = readFileSync(path.join(ICONS_DIR, `${iconName}.png`));
  const data = `data:image/png;base64,${buffer.toString("base64")}`;
  iconDataCache.set(iconName, data);
  return data;
}

interface DeckTheme {
  background: string;
  accent: string;
  palette: DeckPalette;
  logo: LogoAsset | null;
  footerLabel: string | null;
  mediaAssets: Map<string, MediaAsset>;
  mediaItems: Map<string, MediaItem>;
}

function addChrome(slide: PptxGenJS.Slide, theme: DeckTheme, opts?: { skipFooter?: boolean }) {
  // Accent bar across the top edge, a logo, and a footer credit + slide number
  // - the branding chrome every slide carries.
  const P = theme.palette;
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 0.14, fill: { color: theme.accent } });
  if (theme.logo) {
    slide.addImage({ data: theme.logo.data, x: SLIDE_W - 0.4 - theme.logo.w, y: 0.35, w: theme.logo.w, h: theme.logo.h });
  }
  if (!opts?.skipFooter) {
    slide.addShape("line", { x: MARGIN_X, y: SLIDE_H - 0.55, w: CONTENT_W, h: 0, line: { color: P.panelAlt, width: 1 } });
    if (theme.footerLabel) {
      slide.addText(theme.footerLabel, { x: MARGIN_X, y: SLIDE_H - 0.5, w: CONTENT_W - 1, h: 0.35, fontSize: TYPE.footer, color: P.muted, fontFace: BODY_FONT, align: "left", valign: "middle" });
    }
    slide.slideNumber = { x: SLIDE_W - MARGIN_X - 1, y: SLIDE_H - 0.5, w: 1, h: 0.35, fontSize: TYPE.footer, color: P.muted, fontFace: BODY_FONT, align: "right" };
  }
}

// Title in a serif headline with a short accent rule under it - the standard
// header for every content slide. Returns the y where content should start.
function addTitleBlock(slide: PptxGenJS.Slide, title: string, tag: string | null, theme: DeckTheme): number {
  const P = theme.palette;
  const tagH = addBloomTag(slide, tag, MARGIN_X, 0.5, theme.accent, P.onAccent);
  slide.addText(title, { x: MARGIN_X, y: 0.45 + tagH, w: CONTENT_W - 1.5, h: 1.0, fontSize: scaledFontSize(title, TYPE.title, 32, 80, 26), bold: true, color: P.text, valign: "middle", fontFace: HEADLINE_FONT });
  slide.addShape("rect", { x: MARGIN_X, y: 1.5 + tagH, w: 1.1, h: 0.07, fill: { color: theme.accent } });
  return Math.max(CONTENT_TOP, 1.85 + tagH);
}

function addIconBadge(slide: PptxGenJS.Slide, iconName: string, x: number, y: number, size: number, accent: string) {
  slide.addShape("ellipse", { x, y, w: size, h: size, fill: { color: accent } });
  const inset = size * 0.22;
  slide.addImage({ data: iconData(iconName), x: x + inset, y: y + inset, w: size - inset * 2, h: size - inset * 2 });
}

// A small colored pill above the title, in place of an inline "[Level]"
// prefix - same visual language as the "STEP N" badge already used
// elsewhere. Returns the extra vertical space it took up, so callers can
// shift the title/content below it down accordingly.
function addBloomTag(slide: PptxGenJS.Slide, tag: string | null, x: number, y: number, accent: string, onAccent = "111111"): number {
  if (!tag) return 0;
  const w = 0.15 + tag.length * 0.075;
  slide.addShape("roundRect", { x, y, w, h: 0.3, rectRadius: 0.06, fill: { color: accent } });
  slide.addText(tag.toUpperCase(), { x, y, w, h: 0.3, fontSize: 9, bold: true, color: "111111", align: "center", valign: "middle", fontFace: BODY_FONT });
  return 0.42;
}

// Scales a headline down as its text gets longer, since pptxgenjs's `fit:
// "shrink"` is explicitly a no-op when generated programmatically (the
// library only applies it on manual PowerPoint edits) - long text at a fixed
// large fontSize is what overflowed its box and overlapped the text below it.
function scaledFontSize(text: string, base: number, minChars: number, maxChars: number, min: number): number {
  if (text.length <= minChars) return base;
  if (text.length >= maxChars) return min;
  const t = (text.length - minChars) / (maxChars - minChars);
  return Math.round(base - t * (base - min));
}

async function renderSlide(pptx: PptxGenJS, content: PresentationContent["slides"][number], theme: DeckTheme) {
  const slide = pptx.addSlide();
  const P = theme.palette;
  slide.background = { color: theme.background };
  // Legacy rows from before this layout set (including the old, now-removed
  // "image-left"/"image-right" photo layouts) fall back to plain bullets -
  // the photo itself is simply not rendered any more, new exports never
  // include stock images.
  const rawLayout = content.layout as string | undefined;
  const KNOWN_LAYOUTS = new Set<string>([
    "title", "bullets", "stat", "quote", "divider", "stat-grid", "timeline", "icon-grid", "image",
    "big_statement", "definition", "compare_2col", "process_flow", "step", "card_grid", "table", "callout",
    "recap_bridge", "closing_recap",
  ]);
  const layout: PresentationSlideLayout = (rawLayout && KNOWN_LAYOUTS.has(rawLayout) ? rawLayout : "bullets") as PresentationSlideLayout;
  const { tag: titleTag, text: title } = stripBloomTag(content.title || "");
  const bullets = content.bullets ?? [];
  const items = content.items ?? [];
  const columns = content.columns ?? [];
  const table = content.table;
  const stepIndex = content.stepIndex;
  const stepTotal = content.stepTotal;
  const calloutIcon = content.calloutIcon ?? "!";
  const calloutBody = content.calloutBody ?? "";

  if (content.notes) slide.addNotes(content.notes);

  switch (layout) {
    case "title": {
      // Large left-aligned title with an accent rule, and a big soft circle
      // for weight - instead of one small centred line on a flat colour.
      slide.addShape("ellipse", { x: SLIDE_W - 6.2, y: SLIDE_H - 4.6, w: 8, h: 8, fill: { color: P.panelAlt } });
      slide.addShape("ellipse", { x: SLIDE_W - 4.4, y: SLIDE_H - 3.4, w: 5, h: 5, fill: { color: theme.accent, transparency: 55 } });
      slide.addShape("rect", { x: MARGIN_X + 0.2, y: 2.35, w: 1.4, h: 0.09, fill: { color: theme.accent } });
      slide.addText(title, { x: MARGIN_X + 0.2, y: 2.6, w: 8.2, h: 2.6, fontSize: scaledFontSize(title, TYPE.display, 24, 60, 34), bold: true, color: P.text, valign: "top", fontFace: HEADLINE_FONT });
      if (bullets[0]) {
        slide.addText(bullets[0], { x: MARGIN_X + 0.2, y: 5.3, w: 8.2, h: 0.9, fontSize: TYPE.bodySmall, color: P.muted, valign: "top", fontFace: BODY_FONT });
      }
      addChrome(slide, theme, { skipFooter: false });
      break;
    }
    case "image": {
      // The teacher's own image / PDF page, shown as-is: a caption on top, the
      // picture scaled to fit (never cropped or stretched) in the middle, and
      // the credit line under it for anything found by AI research.
      const asset = content.mediaId ? theme.mediaAssets.get(content.mediaId) : undefined;
      const item = content.mediaId ? theme.mediaItems.get(content.mediaId) : undefined;
      const hasCaption = title.trim().length > 0;
      if (hasCaption) {
        slide.addText(title, { x: 0.7, y: 0.35, w: SLIDE_W - 1.4, h: 0.7, fontSize: scaledFontSize(title, 26, 40, 90, 16), bold: true, color: P.text, fontFace: HEADLINE_FONT });
      }
      const top = hasCaption ? 1.2 : 0.5;
      const creditH = item?.attribution ? 0.35 : 0;
      const supportH = bullets.length > 0 ? 0.55 : 0;
      const boxW = SLIDE_W - 1.4;
      const boxH = SLIDE_H - top - 0.55 - creditH - supportH;
      if (asset) {
        const scale = Math.min(boxW / asset.width, boxH / asset.height);
        const w = asset.width * scale;
        const h = asset.height * scale;
        const mime = sniffImageMime(asset.data) ?? "image/png";
        slide.addImage({ data: `data:${mime};base64,${asset.data.toString("base64")}`, x: 0.7 + (boxW - w) / 2, y: top + (boxH - h) / 2, w, h });
      } else {
        slide.addText("This image is no longer available.", { x: 0.7, y: top, w: boxW, h: boxH, fontSize: 18, color: P.muted, align: "center", valign: "middle", fontFace: BODY_FONT });
      }
      let y = top + boxH + 0.1;
      if (bullets.length > 0) {
        slide.addText(bullets.slice(0, 2).join("  ·  "), { x: 0.7, y, w: boxW, h: 0.45, fontSize: 14, color: P.muted, align: "center", fontFace: BODY_FONT });
        y += 0.5;
      }
      if (item?.attribution) {
        slide.addText(item.attribution, { x: 0.7, y, w: boxW, h: 0.3, fontSize: 9, italic: true, color: theme.accent, align: "center", fontFace: BODY_FONT });
      }
      addChrome(slide, theme);
      break;
    }
    case "divider": {
      slide.background = { color: theme.accent };
      slide.addShape("ellipse", { x: SLIDE_W - 5, y: -2, w: 7, h: 7, fill: { color: P.onAccent, transparency: 90 } });
      slide.addShape("rect", { x: MARGIN_X, y: SLIDE_H / 2 - 1.25, w: 1.2, h: 0.09, fill: { color: P.onAccent } });
      slide.addText(title, { x: MARGIN_X, y: SLIDE_H / 2 - 0.85, w: SLIDE_W - MARGIN_X * 2 - 1, h: 2.3, fontSize: scaledFontSize(title, TYPE.display - 4, 24, 70, 32), bold: true, color: P.onAccent, valign: "top", fontFace: HEADLINE_FONT });
      break;
    }
    case "stat": {
      // A "stat" is meant to be a short number/statistic (per the prompt),
      // but the model doesn't always comply - scale hard for anything that
      // isn't actually short, so a full sentence here doesn't overflow its
      // box and overlap the caption below it.
      const fontSize = scaledFontSize(title, 72, 12, 60, 28);
      slide.addText(title, { x: 1, y: 1.6, w: SLIDE_W - 2, h: 2.4, fontSize, bold: true, color: P.text, align: "center", valign: "middle", fontFace: HEADLINE_FONT, fit: "shrink" });
      if (bullets[0]) {
        slide.addText(bullets[0], { x: 1.5, y: 4.3, w: SLIDE_W - 3, h: 1, fontSize: 18, color: P.muted, align: "center", fontFace: BODY_FONT });
      }
      addChrome(slide, theme);
      break;
    }
    case "quote": {
      const fontSize = scaledFontSize(title, 30, 60, 160, 18);
      slide.addText(`"${title}"`, { x: 1.5, y: 1.6, w: SLIDE_W - 3, h: 2.8, fontSize, italic: true, color: P.text, align: "center", valign: "middle", fontFace: HEADLINE_FONT, fit: "shrink" });
      if (bullets[0]) {
        slide.addText(`- ${bullets[0]}`, { x: 1.5, y: 4.7, w: SLIDE_W - 3, h: 0.6, fontSize: 16, color: P.muted, align: "center", fontFace: BODY_FONT });
      }
      addChrome(slide, theme);
      break;
    }
    case "stat-grid": {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.35, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.35 + tagH, w: SLIDE_W - 1.4, h: 0.8, fontSize: 26, bold: true, color: P.text, fontFace: HEADLINE_FONT });
      const gridItems = items.slice(0, 5);
      const gap = 0.3;
      const boxW = (SLIDE_W - 1.4 - gap * (gridItems.length - 1)) / Math.max(gridItems.length, 1);
      const boxY = 1.6 + tagH;
      gridItems.forEach((item, i) => {
        const x = 0.7 + i * (boxW + gap);
        slide.addShape("roundRect", { x, y: boxY, w: boxW, h: 1.9, rectRadius: 0.1, fill: { color: P.panel }, line: { color: theme.accent, width: 1 } });
        const valueFontSize = scaledFontSize(item.title, 32, 4, 12, 18);
        slide.addText(item.title, { x, y: boxY + 0.2, w: boxW, h: 0.9, fontSize: valueFontSize, bold: true, color: theme.accent, align: "center", fontFace: HEADLINE_FONT });
        if (item.description) {
          slide.addText(item.description, { x: x + 0.1, y: boxY + 1.15, w: boxW - 0.2, h: 0.65, fontSize: 11, color: P.muted, align: "center", fontFace: BODY_FONT });
        }
      });
      if (bullets.length) {
        slide.addText(bullets.join(" "), { x: 0.7, y: boxY + 2.1, w: SLIDE_W - 1.4, h: SLIDE_H - (boxY + 2.1) - 0.5, fontSize: 13, color: P.muted, fontFace: BODY_FONT, valign: "top" });
      }
      addChrome(slide, theme);
      break;
    }
    case "timeline": {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.3, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.3 + tagH, w: SLIDE_W - 1.4, h: 0.6, fontSize: 24, bold: true, color: P.text, fontFace: HEADLINE_FONT });
      const steps = items.slice(0, 6);
      const gap = 0.25;
      const colW = (SLIDE_W - 1.4 - gap * (steps.length - 1)) / Math.max(steps.length, 1);
      const circleY = 1.3 + tagH;
      const circleSize = 0.5;
      // Fixed, content-appropriate card height (not stretched to fill the
      // rest of the slide) - a short step description doesn't need a card
      // that spans nearly the whole slide height with mostly empty space.
      const cardH = 2.6;
      steps.forEach((step, i) => {
        const x = 0.7 + i * (colW + gap);
        const cx = x + colW / 2 - circleSize / 2;
        if (i < steps.length - 1) {
          slide.addShape("line", { x: cx + circleSize, y: circleY + circleSize / 2, w: colW + gap - circleSize, h: 0, line: { color: theme.accent, width: 2 } });
        }
        slide.addShape("ellipse", { x: cx, y: circleY, w: circleSize, h: circleSize, fill: { color: theme.accent } });
        slide.addText(String(i + 1), { x: cx, y: circleY, w: circleSize, h: circleSize, fontSize: 15, bold: true, color: P.text, align: "center", valign: "middle", fontFace: BODY_FONT });
        const cardY = circleY + circleSize + 0.25;
        slide.addShape("roundRect", { x, y: cardY, w: colW, h: cardH, rectRadius: 0.08, fill: { color: P.panel }, line: { color: theme.accent, width: 1 } });
        let textY = cardY + 0.15;
        slide.addText(step.title, { x: x + 0.1, y: textY, w: colW - 0.2, h: 0.4, fontSize: 12, bold: true, color: P.text, fontFace: BODY_FONT });
        textY += 0.4;
        if (step.tag) {
          slide.addText(step.tag, { x: x + 0.1, y: textY, w: colW - 0.2, h: 0.28, fontSize: 9, color: theme.accent, fontFace: BODY_FONT });
          textY += 0.28;
        }
        if (step.description) {
          slide.addText(step.description, { x: x + 0.1, y: textY, w: colW - 0.2, h: cardY + cardH - textY - 0.1, fontSize: 9, color: P.muted, fontFace: BODY_FONT, valign: "top" });
        }
      });
      addChrome(slide, theme);
      break;
    }
    case "icon-grid": {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.35, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.35 + tagH, w: SLIDE_W - 1.4, h: 0.6, fontSize: 24, bold: true, color: P.text, fontFace: HEADLINE_FONT });
      const cards = items.slice(0, 4);
      const cols = cards.length > 3 ? 4 : Math.max(cards.length, 1);
      const gap = 0.3;
      const cardW = (SLIDE_W - 1.4 - gap * (cols - 1)) / cols;
      const cardH = 4.3 - tagH;
      const y = 1.5 + tagH;
      cards.forEach((card, i) => {
        const x = 0.7 + i * (cardW + gap);
        slide.addShape("roundRect", { x, y, w: cardW, h: cardH, rectRadius: 0.1, fill: { color: P.panel }, line: { color: theme.accent, width: 1 } });
        addIconBadge(slide, pickIconForText(card.title), x + cardW / 2 - 0.4, y + 0.35, 0.8, theme.accent);
        slide.addText(card.title, { x: x + 0.15, y: y + 1.35, w: cardW - 0.3, h: 0.7, fontSize: 14, bold: true, color: P.text, align: "center", fontFace: BODY_FONT });
        if (card.description) {
          slide.addText(card.description, { x: x + 0.15, y: y + 2.1, w: cardW - 0.3, h: cardH - 2.3, fontSize: 11, color: P.muted, align: "center", fontFace: BODY_FONT, valign: "top" });
        }
      });
      addChrome(slide, theme);
      break;
    }
    case "big_statement": {
      // The "hook"/"aim" roles - one question or framing sentence, given the
      // whole slide, with a large accent quote mark for weight.
      slide.addText("“", { x: MARGIN_X, y: 0.7, w: 2, h: 1.8, fontSize: 130, bold: true, color: P.accent, fontFace: HEADLINE_FONT });
      const fontSize = scaledFontSize(title, TYPE.display - 6, 24, 110, 28);
      slide.addText(title, { x: MARGIN_X + 0.4, y: 1.9, w: CONTENT_W - 0.8, h: 3.0, fontSize, bold: true, color: P.text, valign: "middle", fontFace: HEADLINE_FONT });
      if (bullets[0]) {
        slide.addShape("rect", { x: MARGIN_X + 0.4, y: 5.15, w: 1.0, h: 0.06, fill: { color: P.accent } });
        slide.addText(bullets[0], { x: MARGIN_X + 0.4, y: 5.35, w: CONTENT_W - 0.8, h: 1.0, fontSize: TYPE.bodySmall, color: P.muted, valign: "top", fontFace: BODY_FONT });
      }
      addChrome(slide, theme);
      break;
    }
    case "definition": {
      const top = addTitleBlock(slide, title, titleTag, theme);
      const text = bullets.join(" ");
      slide.addShape("roundRect", { x: MARGIN_X, y: top, w: CONTENT_W, h: CONTENT_BOTTOM - top, rectRadius: 0.15, fill: { color: P.panel } });
      slide.addShape("rect", { x: MARGIN_X, y: top + 0.35, w: 0.12, h: CONTENT_BOTTOM - top - 0.7, fill: { color: P.accent } });
      slide.addText(text, { x: MARGIN_X + 0.6, y: top + 0.3, w: CONTENT_W - 1.2, h: CONTENT_BOTTOM - top - 0.6, fontSize: bodySizeFor([text], 380) + 2, color: P.text, valign: "middle", fontFace: BODY_FONT, lineSpacingMultiple: 1.15 });
      addChrome(slide, theme);
      break;
    }
    case "compare_2col": {
      const top = addTitleBlock(slide, title, titleTag, theme);
      const cols = columns.slice(0, 2);
      const gap = 0.4;
      const colW = (CONTENT_W - gap * (cols.length - 1)) / Math.max(cols.length, 1);
      const h = CONTENT_BOTTOM - top;
      const size = bodySizeFor(cols.flatMap((c) => c.rows), 520) - 4;
      cols.forEach((col, i) => {
        const x = MARGIN_X + i * (colW + gap);
        slide.addShape("roundRect", { x, y: top, w: colW, h, rectRadius: 0.15, fill: { color: P.panel } });
        slide.addShape("roundRect", { x, y: top, w: colW, h: 0.75, rectRadius: 0.15, fill: { color: P.accent } });
        slide.addText(col.heading, { x: x + 0.3, y: top, w: colW - 0.6, h: 0.75, fontSize: TYPE.bodySmall, bold: true, color: P.onAccent, valign: "middle", fontFace: BODY_FONT });
        slide.addText(
          col.rows.map((r) => ({ text: r, options: { bullet: { indent: 22 }, breakLine: true, paraSpaceAfter: 12 } })),
          { x: x + 0.3, y: top + 0.95, w: colW - 0.6, h: h - 1.15, fontSize: Math.max(size, 18), color: P.text, valign: "top", fontFace: BODY_FONT }
        );
      });
      addChrome(slide, theme);
      break;
    }
    case "process_flow": {
      const top = addTitleBlock(slide, title, titleTag, theme);
      const steps = items.slice(0, 6);
      const arrowW = 0.5;
      const boxW = (CONTENT_W - arrowW * Math.max(steps.length - 1, 0)) / Math.max(steps.length, 1);
      const boxH = Math.min(2.4, CONTENT_BOTTOM - top);
      const boxY = top + (CONTENT_BOTTOM - top - boxH) / 2;
      steps.forEach((step, i) => {
        const x = MARGIN_X + i * (boxW + arrowW);
        slide.addShape("roundRect", { x, y: boxY, w: boxW, h: boxH, rectRadius: 0.15, fill: { color: P.panel }, line: { color: P.accent, width: 1.5 } });
        slide.addShape("ellipse", { x: x + boxW / 2 - 0.3, y: boxY + 0.25, w: 0.6, h: 0.6, fill: { color: P.accent } });
        slide.addText(String(i + 1), { x: x + boxW / 2 - 0.3, y: boxY + 0.25, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: P.onAccent, align: "center", valign: "middle", fontFace: BODY_FONT });
        slide.addText(step.title, { x: x + 0.15, y: boxY + 1.0, w: boxW - 0.3, h: boxH - 1.2, fontSize: steps.length > 4 ? 15 : 19, bold: true, color: P.text, align: "center", valign: "top", fontFace: BODY_FONT });
        if (i < steps.length - 1) {
          slide.addText("→", { x: x + boxW, y: boxY, w: arrowW, h: boxH, fontSize: 26, bold: true, color: P.accent, align: "center", valign: "middle", fontFace: BODY_FONT });
        }
      });
      addChrome(slide, theme);
      break;
    }
    case "step": {
      // One action per slide, with a large step number and a progress bar.
      const total = stepTotal ?? 1;
      const idx = stepIndex ?? 1;
      slide.addShape("roundRect", { x: MARGIN_X, y: 0.6, w: 1.9, h: 0.5, rectRadius: 0.25, fill: { color: P.accent } });
      slide.addText(`STEP ${idx} OF ${total}`, { x: MARGIN_X, y: 0.6, w: 1.9, h: 0.5, fontSize: 13, bold: true, color: P.onAccent, align: "center", valign: "middle", fontFace: BODY_FONT });
      slide.addShape("roundRect", { x: MARGIN_X + 2.2, y: 0.8, w: CONTENT_W - 2.2, h: 0.1, rectRadius: 0.05, fill: { color: P.panelAlt } });
      slide.addShape("roundRect", { x: MARGIN_X + 2.2, y: 0.8, w: Math.max(0.2, ((CONTENT_W - 2.2) * idx) / total), h: 0.1, rectRadius: 0.05, fill: { color: P.accent } });
      slide.addText(String(idx), { x: MARGIN_X, y: 1.5, w: 2.2, h: 2.4, fontSize: 130, bold: true, color: P.accent, valign: "middle", fontFace: HEADLINE_FONT });
      slide.addText(title, { x: MARGIN_X + 2.5, y: 1.6, w: CONTENT_W - 2.5, h: 1.2, fontSize: scaledFontSize(title, TYPE.title, 30, 80, 24), bold: true, color: P.text, valign: "middle", fontFace: HEADLINE_FONT });
      slide.addShape("roundRect", { x: MARGIN_X, y: 4.1, w: CONTENT_W, h: CONTENT_BOTTOM - 4.1, rectRadius: 0.15, fill: { color: P.panel } });
      slide.addText(
        bullets.map((b) => ({ text: b, options: { bullet: { indent: 22 }, breakLine: true, paraSpaceAfter: 10 } })),
        { x: MARGIN_X + 0.4, y: 4.25, w: CONTENT_W - 0.8, h: CONTENT_BOTTOM - 4.4, fontSize: bodySizeFor(bullets, 300) - 4, color: P.text, valign: "middle", fontFace: BODY_FONT }
      );
      addChrome(slide, theme);
      break;
    }
    case "card_grid": {
      const top = addTitleBlock(slide, title, titleTag, theme);
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
        slide.addShape("roundRect", { x, y, w: cardW, h: cardH, rectRadius: 0.15, fill: { color: P.panel } });
        slide.addShape("rect", { x: x + 0.3, y: y + 0.3, w: 0.7, h: 0.07, fill: { color: P.accent } });
        slide.addText(card.title, { x: x + 0.3, y: y + 0.45, w: cardW - 0.6, h: 0.8, fontSize: rows > 1 ? 20 : 24, bold: true, color: P.text, valign: "middle", fontFace: HEADLINE_FONT });
        if (card.description) {
          slide.addText(card.description, { x: x + 0.3, y: y + 1.25, w: cardW - 0.6, h: cardH - 1.45, fontSize: rows > 1 ? 15 : 18, color: P.muted, valign: "top", fontFace: BODY_FONT });
        }
      });
      addChrome(slide, theme);
      break;
    }
    case "table": {
      const top = addTitleBlock(slide, title, titleTag, theme);
      if (table) {
        const rowsN = table.rows.length + 1;
        const rowH = Math.min(rowsN <= 5 ? 1.0 : 0.85, (CONTENT_BOTTOM - top) / rowsN);
        const fontSize = rowsN > 7 ? 15 : rowsN > 5 ? 18 : 22;
        const cell = (text: string, header: boolean, zebra: boolean): PptxGenJS.TableCell => ({
          text,
          options: {
            bold: header,
            fontSize,
            fontFace: BODY_FONT,
            color: header ? P.onAccent : P.text,
            fill: { color: header ? P.accent : zebra ? P.panelAlt : P.panel },
            valign: "middle",
            margin: [0.05, 0.15, 0.05, 0.15],
          },
        });
        const rows: PptxGenJS.TableRow[] = [
          table.headers.map((h) => cell(h, true, false)),
          ...table.rows.map((r, ri) => r.map((c) => cell(c, false, ri % 2 === 1))),
        ];
        slide.addTable(rows, { x: MARGIN_X, y: top, w: CONTENT_W, rowH, border: { type: "solid", color: P.background, pt: 1.5 } });
      }
      addChrome(slide, theme);
      break;
    }
    case "callout": {
      // The "safety" role's slide - a flagged warning, never removed by density.
      const cy = 1.5;
      const ch = 4.3;
      slide.addShape("roundRect", { x: MARGIN_X, y: cy, w: CONTENT_W, h: ch, rectRadius: 0.2, fill: { color: P.panel }, line: { color: P.accent, width: 3 } });
      slide.addShape("ellipse", { x: MARGIN_X + 0.6, y: cy + 0.6, w: 1.5, h: 1.5, fill: { color: P.accent } });
      slide.addText(calloutIcon, { x: MARGIN_X + 0.6, y: cy + 0.6, w: 1.5, h: 1.5, fontSize: 60, bold: true, color: P.onAccent, align: "center", valign: "middle", fontFace: BODY_FONT });
      slide.addText(title.toUpperCase(), { x: MARGIN_X + 2.5, y: cy + 0.5, w: CONTENT_W - 3.1, h: 0.9, fontSize: TYPE.title, bold: true, color: P.accent, valign: "middle", fontFace: HEADLINE_FONT });
      slide.addText(calloutBody, { x: MARGIN_X + 2.5, y: cy + 1.5, w: CONTENT_W - 3.1, h: ch - 1.9, fontSize: bodySizeFor([calloutBody], 300), color: P.text, valign: "top", fontFace: BODY_FONT, lineSpacingMultiple: 1.15 });
      addChrome(slide, theme);
      break;
    }
    case "recap_bridge":
    case "closing_recap": {
      // The end-of-deck recap and the multi-class bridge - numbered takeaways
      // on their own cards rather than a bare list.
      const top = addTitleBlock(slide, title, titleTag, theme);
      const points = bullets.slice(0, 5);
      const gap = 0.25;
      const rowH = Math.min(1.35, (CONTENT_BOTTOM - top - gap * (points.length - 1)) / Math.max(points.length, 1));
      const size = bodySizeFor(points, 500) - 2;
      points.forEach((b, i) => {
        const y = top + i * (rowH + gap);
        slide.addShape("roundRect", { x: MARGIN_X, y, w: CONTENT_W, h: rowH, rectRadius: 0.15, fill: { color: P.panel } });
        slide.addShape("ellipse", { x: MARGIN_X + 0.3, y: y + rowH / 2 - 0.35, w: 0.7, h: 0.7, fill: { color: P.accent } });
        slide.addText(String(i + 1), { x: MARGIN_X + 0.3, y: y + rowH / 2 - 0.35, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: P.onAccent, align: "center", valign: "middle", fontFace: HEADLINE_FONT });
        slide.addText(b, { x: MARGIN_X + 1.3, y, w: CONTENT_W - 1.6, h: rowH, fontSize: Math.max(size, 18), color: P.text, valign: "middle", fontFace: BODY_FONT });
      });
      addChrome(slide, theme);
      break;
    }
    case "bullets":
    default: {
      const top = addTitleBlock(slide, title, titleTag, theme);
      const size = bodySizeFor(bullets);
      slide.addShape("roundRect", { x: MARGIN_X, y: top, w: CONTENT_W, h: CONTENT_BOTTOM - top, rectRadius: 0.15, fill: { color: P.panel } });
      slide.addText(
        bullets.map((b) => ({ text: b, options: { bullet: { indent: 26 }, breakLine: true, paraSpaceAfter: 14 } })),
        { x: MARGIN_X + 0.5, y: top + 0.2, w: CONTENT_W - 1.0, h: CONTENT_BOTTOM - top - 0.4, fontSize: size, color: P.text, valign: "middle", fontFace: BODY_FONT, lineSpacingMultiple: 1.1 }
      );
      addChrome(slide, theme);
      break;
    }
  }

  return slide;
}

export async function buildPresentationPptx(
  content: PresentationContent,
  topicName: string,
  mediaAssets: Map<string, MediaAsset> = new Map()
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "WIDE";
  pptx.title = topicName;
  pptx.author = "EduWand";

  const preset = COLOR_SCHEME_PRESETS[content.colorScheme ?? "indigo"];
  const bg = hexOf(content.primaryColor, preset.background);
  const ac = hexOf(content.secondaryColor, preset.accent);
  const theme: DeckTheme = {
    background: bg,
    accent: ac,
    palette: buildPalette(bg, ac),
    logo: await fetchLogoAsset(content.logoUrl),
    footerLabel: content.footerLabel ?? null,
    mediaAssets,
    mediaItems: new Map((content.media ?? []).map((item) => [item.id, item])),
  };

  for (const slide of content.slides) {
    await renderSlide(pptx, slide, theme);
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return buffer as Buffer;
}
