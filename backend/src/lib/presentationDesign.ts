// Shared design tokens for the presentation exports (pptxExport.ts and
// presentationPdfExport.ts) - one place for the type scale, contrast and panel
// colours so the two renderers stop drifting apart. Coordinates in both are
// expressed on the same 13.33 x 7.5 inch slide (the PDF page is that x 72pt).

export const SLIDE_W = 13.33;
export const SLIDE_H = 7.5;
export const MARGIN_X = 0.8;
export const CONTENT_TOP = 1.95;
export const CONTENT_BOTTOM = SLIDE_H - 0.75;
export const CONTENT_W = SLIDE_W - MARGIN_X * 2;

// Points. Sized for a projected classroom deck, not a printed page.
export const TYPE = {
  display: 54,
  title: 36,
  heading: 30,
  body: 26,
  bodySmall: 22,
  table: 20,
  caption: 15,
  footer: 11,
};

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Blend `hex` toward `target` by `amount` (0..1).
export function mix(hex: string, target: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(target);
  return toHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
}

export interface DeckPalette {
  background: string;
  accent: string;
  // Text colours guaranteed readable on `background` (school colours can be
  // light or mid-tone, so white-on-anything is not safe).
  text: string;
  muted: string;
  // Raised surface for panels/cards/table rows, and its own readable text.
  panel: string;
  panelAlt: string;
  onPanel: string;
  // Text/shape colour that reads on top of the accent colour.
  onAccent: string;
}

export function buildPalette(background: string, accent: string): DeckPalette {
  const dark = luminance(background) < 0.4;
  const text = dark ? "FFFFFF" : "111827";
  const panel = mix(background, dark ? "FFFFFF" : "000000", dark ? 0.1 : 0.06);
  const panelAlt = mix(background, dark ? "FFFFFF" : "000000", dark ? 0.16 : 0.1);
  return {
    background,
    accent,
    text,
    muted: mix(text, background, 0.25),
    panel,
    panelAlt,
    onPanel: text,
    onAccent: luminance(accent) < 0.4 ? "FFFFFF" : "111827",
  };
}

// Picks a body font size that fills the space without overflowing: few short
// lines get large type, long lists step down.
export function bodySizeFor(lines: string[], maxChars = 700): number {
  const chars = lines.reduce((n, l) => n + l.length, 0);
  if (lines.length > 6 || chars > maxChars) return 18;
  if (lines.length > 4 || chars > maxChars * 0.65) return 22;
  if (chars > maxChars * 0.35) return 26;
  return 30;
}
