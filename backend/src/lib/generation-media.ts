import type { ContextSource } from "@prisma/client";
import { prisma } from "./prisma";
import type { MediaCatalogEntry, PresentationContent } from "./ai";
import type { MediaAsset } from "./pptxExport";
import { MAX_MEDIA_ITEMS, imageDimensions, readSourceFile, renderPdfPages, type MediaItem } from "./media";

// "Use as-is": images and PDF pages a teacher picks are shown directly in the
// generated content instead of being re-created by the AI - cheaper, and it is
// the teacher's own material.

export const MAX_EMBED_PDF_PAGES = 20;

export interface EmbedSelection {
  contextSourceId: string;
  // PDFs only, 1-based and inclusive. Omitted = from page 1 up to the cap.
  pageFrom?: number;
  pageTo?: number;
}

// "1700000000000-Photosynthesis-in-action.jpg" -> "Photosynthesis in action"
function humanizeName(filename: string | null): string {
  if (!filename) return "Attached file";
  const name = filename
    .replace(/^\d{10,}-/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return name || "Attached file";
}

function short(text: string | null, max: number): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trim()}...` : flat;
}

export function buildMediaItems(
  sources: ContextSource[],
  selection: EmbedSelection[]
): { items: MediaItem[]; descriptions: Map<string, string> } | { error: string } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const items: MediaItem[] = [];
  const descriptions = new Map<string, string>();
  const seen = new Set<string>();

  const push = (item: Omit<MediaItem, "id">, description: string) => {
    const id = `m${items.length + 1}`;
    items.push({ id, ...item });
    descriptions.set(id, description);
  };

  for (const sel of selection) {
    if (seen.has(sel.contextSourceId)) return { error: "The same source can only be added once" };
    seen.add(sel.contextSourceId);

    const source = byId.get(sel.contextSourceId);
    if (!source) return { error: "One of the selected media sources doesn't belong to this topic" };
    if (!source.fileLocation || (source.sourceType !== "image" && source.sourceType !== "pdf")) {
      return { error: "Only uploaded images and PDFs can be used as-is" };
    }

    const name = humanizeName(source.originalFilename);
    const context = short(source.extractedText, 160);

    if (source.sourceType === "image") {
      // Single quotes only: descriptions are fed to the model, and a stray
      // double quote there tends to come back unescaped inside its JSON.
      push(
        { sourceId: source.id, kind: "image", caption: name, attribution: source.attribution },
        (context ? `image '${name}' - ${context}` : `image '${name}'`).replace(/"/g, "'")
      );
      continue;
    }

    const pageCount = source.pageCount ?? 1;
    const from = Math.max(1, sel.pageFrom ?? 1);
    const to = Math.min(pageCount, sel.pageTo ?? Math.min(pageCount, from + MAX_EMBED_PDF_PAGES - 1));
    if (from > to) return { error: `"${name}" has no page ${from}` };
    if (to - from + 1 > MAX_EMBED_PDF_PAGES) {
      return { error: `Choose at most ${MAX_EMBED_PDF_PAGES} pages from "${name}" to use as-is` };
    }
    for (let page = from; page <= to; page++) {
      push(
        { sourceId: source.id, kind: "pdf_page", page, caption: `${name} - page ${page}`, attribution: source.attribution },
        `page ${page} of the PDF '${name.replace(/"/g, "'")}'`
      );
    }
  }

  if (items.length > MAX_MEDIA_ITEMS) return { error: `Use at most ${MAX_MEDIA_ITEMS} images / pages as-is in one go` };
  return { items, descriptions };
}

export function catalogFor(items: MediaItem[], descriptions: Map<string, string>): MediaCatalogEntry[] {
  return items.map((item) => ({ id: item.id, description: descriptions.get(item.id) ?? item.caption }));
}

// Puts the chosen media into generated content.
// - Presentation: the model was asked to place each item on an "image" slide
//   via mediaId; anything it got wrong or skipped is repaired here, so every
//   chosen item always appears exactly as the teacher picked it.
// - Everything else: the items travel with the content as `media`, and the
//   viewer shows them as attached material.
export function applyMedia(contentJson: string, outputType: string, items: MediaItem[]): string {
  if (items.length === 0) return contentJson;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return contentJson;
  }

  if (outputType !== "presentation") {
    parsed.media = items;
    return JSON.stringify(parsed);
  }

  const known = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  const slides = (Array.isArray(parsed.slides) ? parsed.slides : []) as PresentationContent["slides"];

  const repaired: PresentationContent["slides"] = [];
  for (const slide of slides) {
    if (slide.layout === "image" || slide.mediaId) {
      const item = slide.mediaId ? known.get(slide.mediaId) : undefined;
      // A slide pointing at nothing real, or repeating one already shown, is dropped.
      if (!item || used.has(item.id)) continue;
      used.add(item.id);
      repaired.push({ ...slide, layout: "image", mediaId: item.id, bullets: Array.isArray(slide.bullets) ? slide.bullets.slice(0, 2) : [] });
      continue;
    }
    repaired.push(slide);
  }

  for (const item of items) {
    if (used.has(item.id)) continue;
    repaired.push({ layout: "image", title: item.caption, bullets: [], mediaId: item.id, notes: "" });
  }

  parsed.slides = repaired;
  parsed.media = items;
  return JSON.stringify(parsed);
}

// A deck built only from the teacher's chosen media - no AI call, so it costs
// nothing. A title slide, then one image slide per item in the order picked.
export function assemblePresentation(params: { topicName: string; subtitle: string; items: MediaItem[] }): string {
  const content: PresentationContent = {
    type: "presentation",
    template: "detailed",
    media: params.items,
    slides: [
      { layout: "title", title: params.topicName, bullets: [params.subtitle], notes: "" },
      ...params.items.map((item) => ({ layout: "image" as const, title: item.caption, bullets: [] as string[], mediaId: item.id, notes: "" })),
    ],
  };
  return JSON.stringify(content);
}

const EXPORT_PAGE_WIDTH = 1600;

// The actual pixels for every image slide in a deck, for export. A source that
// has since been deleted or can't be read is simply left out - that slide
// exports with a "no longer available" note rather than failing the export.
export async function loadMediaAssets(topicId: string, content: PresentationContent): Promise<Map<string, MediaAsset>> {
  const assets = new Map<string, MediaAsset>();
  const shown = new Set(content.slides.map((s) => s.mediaId).filter((id): id is string => !!id));
  const items = (content.media ?? []).filter((item) => shown.has(item.id));
  if (items.length === 0) return assets;

  const sources = await prisma.contextSource.findMany({ where: { id: { in: [...new Set(items.map((i) => i.sourceId))] }, topicId } });
  const byId = new Map(sources.map((s) => [s.id, s]));

  const pagesBySource = new Map<string, MediaItem[]>();
  for (const item of items) {
    const source = byId.get(item.sourceId);
    if (!source?.fileLocation) continue;
    if (item.kind === "image") {
      try {
        const data = await readSourceFile(source.fileLocation);
        const dims = imageDimensions(data);
        if (dims) assets.set(item.id, { data, width: dims.width, height: dims.height });
      } catch {
        // leave this slide without its image
      }
    } else {
      pagesBySource.set(item.sourceId, [...(pagesBySource.get(item.sourceId) ?? []), item]);
    }
  }

  for (const [sourceId, pageItems] of pagesBySource) {
    const source = byId.get(sourceId);
    if (!source?.fileLocation) continue;
    try {
      const pdf = await readSourceFile(source.fileLocation);
      const rendered = await renderPdfPages(sourceId, pdf, pageItems.map((i) => i.page ?? 1), EXPORT_PAGE_WIDTH);
      for (const item of pageItems) {
        const page = rendered.get(item.page ?? 1);
        if (page) assets.set(item.id, { data: page.data, width: page.width, height: page.height });
      }
    } catch {
      // leave these slides without their pages
    }
  }
  return assets;
}

// What a previous generation attached, so a retry can put the same items back.
export function mediaItemsFromContent(contentJson: string | null | undefined): MediaItem[] {
  if (!contentJson) return [];
  try {
    const parsed = JSON.parse(contentJson) as { media?: unknown };
    return Array.isArray(parsed.media) ? (parsed.media as MediaItem[]) : [];
  } catch {
    return [];
  }
}
