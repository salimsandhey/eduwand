import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_EXTRACTED_CHARS = 20000;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });

  const slideTexts: string[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async("text");
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    if (runs.length > 0) slideTexts.push(runs.join(" "));
  }
  return slideTexts.join("\n\n");
}

export function isPrivateOrLoopbackAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateOrLoopbackAddress(lower.slice(7));
    return false;
  }
  return true;
}

const URL_FETCH_TIMEOUT_MS = 10_000;
const URL_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const URL_MIN_USEFUL_TEXT_CHARS = 200;
const URL_USER_AGENT = "EduWandBot/1.0 (+https://eduwand.com; Lesson Studio context fetch)";
const URL_MAX_REDIRECTS = 5;

// Fetches with redirects handled manually - each hop's hostname is resolved
// and re-checked against private/loopback ranges before being followed, so a
// public URL can't redirect the fetch to an internal address (fetch's
// built-in redirect following does not re-validate hosts).
async function fetchValidated(rawUrl: string): Promise<Response> {
  let currentUrl = new URL(rawUrl);

  for (let hop = 0; hop <= URL_MAX_REDIRECTS; hop++) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new Error(`Unsupported URL protocol: ${currentUrl.protocol}`);
    }

    const lookup = await dns.lookup(currentUrl.hostname);
    if (isPrivateOrLoopbackAddress(lookup.address)) {
      throw new Error("URL resolves to a private or loopback address - not allowed");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: { "User-Agent": URL_USER_AGENT },
        redirect: "manual",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect (${response.status}) with no Location header`);
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return response;
  }

  throw new Error("Too many redirects");
}

export async function extractUrlText(rawUrl: string): Promise<{ text: string } | null> {
  const response = await fetchValidated(rawUrl);

  if (!response.ok) {
    throw new Error(`URL fetch failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return null;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > URL_MAX_RESPONSE_BYTES) {
    throw new Error("URL response too large");
  }

  const html = await response.text();
  if (Buffer.byteLength(html, "utf8") > URL_MAX_RESPONSE_BYTES) {
    throw new Error("URL response too large");
  }

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, iframe, noscript, form").remove();
  const raw = $("body").text().replace(/\s+/g, " ").trim();

  if (raw.length < URL_MIN_USEFUL_TEXT_CHARS) {
    return null;
  }

  return { text: raw.slice(0, MAX_EXTRACTED_CHARS) };
}

const NOT_FOUND_PHRASES = [
  "page doesn't exist",
  "page does not exist",
  "page not found",
  "404 not found",
  "404 error",
  "couldn't find that page",
  "could not be found",
  "content not found",
  "this page is unavailable",
];

/**
 * Used by AI Research mode to filter out dead/removed links before showing
 * them to a teacher, AND to resolve the real destination URL. Gemini's
 * grounding chunks hand back a Google redirect URL
 * (vertexaisearch.cloud.google.com/grounding-api-redirect/...), not the
 * actual page - `fetchValidated` already follows redirects hop by hop
 * (re-validating each host), so its final response's `.url` is the real
 * destination. Returns that resolved URL when the page is genuinely live, or
 * null if it errors, 404s, or is a soft-404 (HTTP 200 with a "not found"
 * page - common enough that status code alone isn't reliable for HTML).
 * Non-HTML responses (a PDF, say) are trusted on status code alone since
 * there's no page text to sniff for "not found" phrasing.
 */
export async function resolveReachableUrl(rawUrl: string): Promise<string | null> {
  try {
    const response = await fetchValidated(rawUrl);
    if (!response.ok) return null;
    const finalUrl = response.url || rawUrl;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return finalUrl;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > URL_MAX_RESPONSE_BYTES) return finalUrl;

    const html = await response.text();
    const sample = html.slice(0, 5000).toLowerCase();
    return NOT_FOUND_PHRASES.some((phrase) => sample.includes(phrase)) ? null : finalUrl;
  } catch {
    return null;
  }
}

function cleanExtractedText(raw: string): string {
  const PRIVATE_USE_AREA_START = 0xe000;
  const PRIVATE_USE_AREA_END = 0xf8ff;
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < PRIVATE_USE_AREA_START || code > PRIVATE_USE_AREA_END;
    })
    .join("")
    .replace(/[ 	]{2,}/g, " ");
  return cleaned.trim().slice(0, MAX_EXTRACTED_CHARS);
}

export async function extractText(buffer: Buffer, sourceType: string): Promise<{ text: string; pageCount?: number } | null> {
  let raw: string;
  let pageCount: number | undefined;
  switch (sourceType) {
    case "pdf": {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        raw = result.text;
        pageCount = result.total;
      } finally {
        await parser.destroy();
      }
      break;
    }
    case "docx":
      raw = (await mammoth.extractRawText({ buffer })).value;
      break;
    case "pptx":
      raw = await extractPptxText(buffer);
      break;
    default:
      return null;
  }

  return { text: cleanExtractedText(raw), pageCount };
}

// Used only at generation time, when the teacher has narrowed a long PDF to
// a specific page range instead of the whole document (see
// backend/src/routes/generations.ts resolveSelectedContextText).
export async function extractPdfPageRangeText(buffer: Buffer, first: number, last: number): Promise<{ text: string } | null> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first, last });
    if (!result.text) return null;
    return { text: cleanExtractedText(result.text) };
  } finally {
    await parser.destroy();
  }
}
