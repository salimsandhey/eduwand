import { readFileSync } from "fs";
import path from "path";
import { imageSize } from "image-size";
import PptxGenJS from "pptxgenjs";
import { PresentationContent, PresentationColorScheme, PresentationSlideLayout } from "./ai";
import { sniffImageMime, type MediaItem } from "./media";

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

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
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
  logo: LogoAsset | null;
  footerLabel: string | null;
  mediaAssets: Map<string, MediaAsset>;
  mediaItems: Map<string, MediaItem>;
}

function addChrome(slide: PptxGenJS.Slide, theme: DeckTheme, opts?: { skipFooter?: boolean }) {
  // Thin accent bar across the top edge, and a small logo/footer credit -
  // the consistent branding chrome every slide carries, mirroring the
  // reference deck's top bar + corner watermark.
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 0.12, fill: { color: theme.accent } });
  if (theme.logo) {
    slide.addImage({ data: theme.logo.data, x: SLIDE_W - 0.3 - theme.logo.w, y: 0.3, w: theme.logo.w, h: theme.logo.h });
  }
  if (theme.footerLabel && !opts?.skipFooter) {
    slide.addText(theme.footerLabel, { x: 0.4, y: SLIDE_H - 0.4, w: SLIDE_W - 0.8, h: 0.3, fontSize: 9, color: theme.accent, fontFace: BODY_FONT, align: "right" });
  }
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
function addBloomTag(slide: PptxGenJS.Slide, tag: string | null, x: number, y: number, accent: string): number {
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
  slide.background = { color: theme.background };
  // Legacy rows from before this layout set (including the old, now-removed
  // "image-left"/"image-right" photo layouts) fall back to plain bullets -
  // the photo itself is simply not rendered any more, new exports never
  // include stock images.
  const rawLayout = content.layout as string | undefined;
  const layout: PresentationSlideLayout = ((): PresentationSlideLayout => {
    if (rawLayout === "title" || rawLayout === "bullets" || rawLayout === "stat" || rawLayout === "quote" ||
        rawLayout === "divider" || rawLayout === "stat-grid" || rawLayout === "timeline" || rawLayout === "icon-grid" ||
        rawLayout === "image") {
      return rawLayout;
    }
    return "bullets";
  })();
  const { tag: titleTag, text: title } = stripBloomTag(content.title || "");
  const bullets = content.bullets ?? [];
  const items = content.items ?? [];

  if (content.notes) slide.addNotes(content.notes);

  switch (layout) {
    case "title": {
      const fontSize = scaledFontSize(title, 44, 30, 70, 26);
      slide.addText(title, { x: 1, y: SLIDE_H / 2 - 1, w: SLIDE_W - 2, h: 2, fontSize, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: HEADLINE_FONT });
      addChrome(slide, theme);
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
        slide.addText(title, { x: 0.7, y: 0.35, w: SLIDE_W - 1.4, h: 0.7, fontSize: scaledFontSize(title, 26, 40, 90, 16), bold: true, color: "FFFFFF", fontFace: HEADLINE_FONT });
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
        slide.addText("This image is no longer available.", { x: 0.7, y: top, w: boxW, h: boxH, fontSize: 18, color: "E3E3F0", align: "center", valign: "middle", fontFace: BODY_FONT });
      }
      let y = top + boxH + 0.1;
      if (bullets.length > 0) {
        slide.addText(bullets.slice(0, 2).join("  ·  "), { x: 0.7, y, w: boxW, h: 0.45, fontSize: 14, color: "E3E3F0", align: "center", fontFace: BODY_FONT });
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
      const fontSize = scaledFontSize(title, 36, 30, 70, 22);
      slide.addText(title, { x: 1, y: SLIDE_H / 2 - 0.75, w: SLIDE_W - 2, h: 1.5, fontSize, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: HEADLINE_FONT });
      addChrome(slide, theme, { skipFooter: true });
      break;
    }
    case "stat": {
      // A "stat" is meant to be a short number/statistic (per the prompt),
      // but the model doesn't always comply - scale hard for anything that
      // isn't actually short, so a full sentence here doesn't overflow its
      // box and overlap the caption below it.
      const fontSize = scaledFontSize(title, 72, 12, 60, 28);
      slide.addText(title, { x: 1, y: 1.6, w: SLIDE_W - 2, h: 2.4, fontSize, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: HEADLINE_FONT, fit: "shrink" });
      if (bullets[0]) {
        slide.addText(bullets[0], { x: 1.5, y: 4.3, w: SLIDE_W - 3, h: 1, fontSize: 18, color: "E3E3F0", align: "center", fontFace: BODY_FONT });
      }
      addChrome(slide, theme);
      break;
    }
    case "quote": {
      const fontSize = scaledFontSize(title, 30, 60, 160, 18);
      slide.addText(`"${title}"`, { x: 1.5, y: 1.6, w: SLIDE_W - 3, h: 2.8, fontSize, italic: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: HEADLINE_FONT, fit: "shrink" });
      if (bullets[0]) {
        slide.addText(`- ${bullets[0]}`, { x: 1.5, y: 4.7, w: SLIDE_W - 3, h: 0.6, fontSize: 16, color: "E3E3F0", align: "center", fontFace: BODY_FONT });
      }
      addChrome(slide, theme);
      break;
    }
    case "stat-grid": {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.35, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.35 + tagH, w: SLIDE_W - 1.4, h: 0.8, fontSize: 26, bold: true, color: "FFFFFF", fontFace: HEADLINE_FONT });
      const gridItems = items.slice(0, 5);
      const gap = 0.3;
      const boxW = (SLIDE_W - 1.4 - gap * (gridItems.length - 1)) / Math.max(gridItems.length, 1);
      const boxY = 1.6 + tagH;
      gridItems.forEach((item, i) => {
        const x = 0.7 + i * (boxW + gap);
        slide.addShape("roundRect", { x, y: boxY, w: boxW, h: 1.9, rectRadius: 0.1, fill: { color: "FFFFFF", transparency: 92 }, line: { color: theme.accent, width: 1 } });
        const valueFontSize = scaledFontSize(item.title, 32, 4, 12, 18);
        slide.addText(item.title, { x, y: boxY + 0.2, w: boxW, h: 0.9, fontSize: valueFontSize, bold: true, color: theme.accent, align: "center", fontFace: HEADLINE_FONT });
        if (item.description) {
          slide.addText(item.description, { x: x + 0.1, y: boxY + 1.15, w: boxW - 0.2, h: 0.65, fontSize: 11, color: "E3E3F0", align: "center", fontFace: BODY_FONT });
        }
      });
      if (bullets.length) {
        slide.addText(bullets.join(" "), { x: 0.7, y: boxY + 2.1, w: SLIDE_W - 1.4, h: SLIDE_H - (boxY + 2.1) - 0.5, fontSize: 13, color: "E3E3F0", fontFace: BODY_FONT, valign: "top" });
      }
      addChrome(slide, theme);
      break;
    }
    case "timeline": {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.3, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.3 + tagH, w: SLIDE_W - 1.4, h: 0.6, fontSize: 24, bold: true, color: "FFFFFF", fontFace: HEADLINE_FONT });
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
        slide.addText(String(i + 1), { x: cx, y: circleY, w: circleSize, h: circleSize, fontSize: 15, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: BODY_FONT });
        const cardY = circleY + circleSize + 0.25;
        slide.addShape("roundRect", { x, y: cardY, w: colW, h: cardH, rectRadius: 0.08, fill: { color: "FFFFFF", transparency: 92 }, line: { color: theme.accent, width: 1 } });
        let textY = cardY + 0.15;
        slide.addText(step.title, { x: x + 0.1, y: textY, w: colW - 0.2, h: 0.4, fontSize: 12, bold: true, color: "FFFFFF", fontFace: BODY_FONT });
        textY += 0.4;
        if (step.tag) {
          slide.addText(step.tag, { x: x + 0.1, y: textY, w: colW - 0.2, h: 0.28, fontSize: 9, color: theme.accent, fontFace: BODY_FONT });
          textY += 0.28;
        }
        if (step.description) {
          slide.addText(step.description, { x: x + 0.1, y: textY, w: colW - 0.2, h: cardY + cardH - textY - 0.1, fontSize: 9, color: "D8D8E8", fontFace: BODY_FONT, valign: "top" });
        }
      });
      addChrome(slide, theme);
      break;
    }
    case "icon-grid": {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.35, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.35 + tagH, w: SLIDE_W - 1.4, h: 0.6, fontSize: 24, bold: true, color: "FFFFFF", fontFace: HEADLINE_FONT });
      const cards = items.slice(0, 4);
      const cols = cards.length > 3 ? 4 : Math.max(cards.length, 1);
      const gap = 0.3;
      const cardW = (SLIDE_W - 1.4 - gap * (cols - 1)) / cols;
      const cardH = 4.3 - tagH;
      const y = 1.5 + tagH;
      cards.forEach((card, i) => {
        const x = 0.7 + i * (cardW + gap);
        slide.addShape("roundRect", { x, y, w: cardW, h: cardH, rectRadius: 0.1, fill: { color: "FFFFFF", transparency: 92 }, line: { color: theme.accent, width: 1 } });
        addIconBadge(slide, pickIconForText(card.title), x + cardW / 2 - 0.4, y + 0.35, 0.8, theme.accent);
        slide.addText(card.title, { x: x + 0.15, y: y + 1.35, w: cardW - 0.3, h: 0.7, fontSize: 14, bold: true, color: "FFFFFF", align: "center", fontFace: BODY_FONT });
        if (card.description) {
          slide.addText(card.description, { x: x + 0.15, y: y + 2.1, w: cardW - 0.3, h: cardH - 2.3, fontSize: 11, color: "D8D8E8", align: "center", fontFace: BODY_FONT, valign: "top" });
        }
      });
      addChrome(slide, theme);
      break;
    }
    case "bullets":
    default: {
      const tagH = addBloomTag(slide, titleTag, 0.7, 0.5, theme.accent);
      slide.addText(title, { x: 0.7, y: 0.5 + tagH, w: SLIDE_W - 1.4, h: 1, fontSize: 30, bold: true, color: "FFFFFF", fontFace: HEADLINE_FONT });
      slide.addText(
        bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.9, y: 1.7 + tagH, w: SLIDE_W - 1.8, h: SLIDE_H - 2.3 - tagH, fontSize: 18, color: "E3E3F0", fontFace: BODY_FONT }
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
  const theme: DeckTheme = {
    background: hexOf(content.primaryColor, preset.background),
    accent: hexOf(content.secondaryColor, preset.accent),
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
