import { PDFParse } from "pdf-parse";
import { imageSize } from "image-size";
import { storage } from "./storage";

// Media = images and PDF pages a teacher picked to use as-is in generated
// content, instead of (or alongside) AI-written material.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
// Guard rails on one generation - every embedded PDF page is a render.
export const MAX_MEDIA_ITEMS = 30;
export const DEFAULT_PAGE_WIDTH = 1280;
const MAX_PAGE_WIDTH = 2000;

export interface MediaItem {
  id: string;
  sourceId: string;
  kind: "image" | "pdf_page";
  // 1-based, pdf_page only.
  page?: number;
  caption: string;
  // Credit line for sources found by AI research; null for teacher uploads.
  attribution: string | null;
  // Pixel size of what will be shown (a rendered page, or the image itself).
  width?: number;
  height?: number;
}

export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function looksLikePdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-";
}

export function imageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    const { width, height } = imageSize(buffer);
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

// Small in-memory cache of rendered pages: a viewer asks for the same page
// again on every scroll/re-open, and a render is ~150ms of CPU. Bounded by
// entry count so it can't grow without limit.
const PAGE_CACHE_LIMIT = 60;
const pageCache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const hit = pageCache.get(key);
  if (hit) {
    pageCache.delete(key);
    pageCache.set(key, hit);
  }
  return hit;
}

function cachePut(key: string, value: Buffer) {
  pageCache.set(key, value);
  while (pageCache.size > PAGE_CACHE_LIMIT) {
    const oldest = pageCache.keys().next().value;
    if (oldest === undefined) break;
    pageCache.delete(oldest);
  }
}

// Lets a route serve a page without first downloading the whole PDF again.
export function getCachedPage(sourceId: string, page: number, width: number): Buffer | undefined {
  return cacheGet(`${sourceId}:${page}:${width}`);
}

export function clampPageWidth(width: number | undefined): number {
  if (!width || !Number.isFinite(width)) return DEFAULT_PAGE_WIDTH;
  return Math.max(200, Math.min(MAX_PAGE_WIDTH, Math.round(width)));
}

// Renders the given 1-based pages of a PDF to PNG in one pass (one parser
// instance, so an export of many pages downloads and opens the PDF once).
export async function renderPdfPages(
  sourceId: string,
  pdfBuffer: Buffer,
  pages: number[],
  width = DEFAULT_PAGE_WIDTH
): Promise<Map<number, { data: Buffer; width: number; height: number }>> {
  const result = new Map<number, { data: Buffer; width: number; height: number }>();
  const missing: number[] = [];
  for (const page of pages) {
    const cached = cacheGet(`${sourceId}:${page}:${width}`);
    if (cached) {
      const dims = imageDimensions(cached);
      result.set(page, { data: cached, width: dims?.width ?? width, height: dims?.height ?? width });
    } else {
      missing.push(page);
    }
  }
  if (missing.length === 0) return result;

  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const shot = await parser.getScreenshot({ partial: missing, imageBuffer: true, imageDataUrl: false, desiredWidth: width });
    for (const page of shot.pages) {
      const data = Buffer.from(page.data);
      cachePut(`${sourceId}:${page.pageNumber}:${width}`, data);
      result.set(page.pageNumber, { data, width: page.width, height: page.height });
    }
  } finally {
    await parser.destroy();
  }
  return result;
}

export async function readSourceFile(fileLocation: string): Promise<Buffer> {
  return storage.readBuffer(fileLocation);
}
