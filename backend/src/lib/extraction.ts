import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import { isIP } from "node:net";

// Per-source cap so a huge textbook chapter can't blow up the DB column or,
// later, the generation prompt built from it. Exported so backend/src/lib/ai.ts's
// image OCR path applies the same cap instead of duplicating the number.
export const MAX_EXTRACTED_CHARS = 20000;

async function extractPptxText(buffer: Buffer): Promise<string> {
  // A .pptx is a zip of per-slide XML - no dedicated pptx-parsing dependency
  // needed, just read the slide XML and pull out <a:t> text runs.
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
    const runs = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]);
    if (runs.length > 0) slideTexts.push(runs.join(" "));
  }
  return slideTexts.join("\n\n");
}

// SSRF guard: reject loopback/private/link-local addresses so a teacher-
// supplied URL can't be used to reach internal services (e.g. localhost, or
// a cloud metadata endpoint like 169.254.169.254). Covers both IPv4 and IPv6.
// Residual risk: redirects are still followed without re-checking each hop's
// resolved IP - a full defense would walk redirects manually and re-validate
// every one, real added complexity deferred for this first pass.
function isPrivateOrLoopbackAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, incl. cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
    if (lower.startsWith("::ffff:")) return isPrivateOrLoopbackAddress(lower.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // couldn't parse - refuse rather than risk it
}

const URL_FETCH_TIMEOUT_MS = 10_000;
const URL_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const URL_MIN_USEFUL_TEXT_CHARS = 200;
const URL_USER_AGENT = "EduWandBot/1.0 (+https://eduwand.com; Lesson Studio context fetch)";

// Fetches a teacher-supplied URL and strips it to readable text. No JS
// execution (cheerio just parses the initial HTML), so JS-rendered pages
// will mostly come back empty - caught by the too-short heuristic below,
// same as a paywalled page showing only boilerplate. Neither is reliably
// detectable, this is a practical approximation, not a perfect one.
export async function extractUrlText(rawUrl: string): Promise<{ text: string } | null> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  const lookup = await dns.lookup(url.hostname);
  if (isPrivateOrLoopbackAddress(lookup.address)) {
    throw new Error("URL resolves to a private or loopback address - not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": URL_USER_AGENT },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`URL fetch failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return null; // not a page we can extract readable text from
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
    return null; // likely JS-rendered, paywalled, or otherwise not real content
  }

  return { text: raw.slice(0, MAX_EXTRACTED_CHARS) };
}

// Returns null for source types this doesn't handle (image, idream_k12) -
// image OCR goes through backend/src/lib/ai.ts's extractTextFromPhoto instead
// (a real AI call, not local library extraction), and idream_k12 doesn't need
// extraction (marked "extracted" at creation with no text, per
// backend/src/routes/topics.ts - no vendor integration exists).
export async function extractText(buffer: Buffer, sourceType: string): Promise<{ text: string } | null> {
  let raw: string;
  switch (sourceType) {
    case "pdf": {
      const parser = new PDFParse({ data: buffer });
      try {
        raw = (await parser.getText()).text;
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

  // Strip Private Use Area characters (U+E000-U+F8FF) before anything else -
  // a known pdf-parse/pdfjs artifact where decorative symbol-fonts (bullets,
  // page-number glyphs) can't be mapped to real Unicode, so the font's raw
  // glyph ID leaks into the text instead. Confirmed against real extracted
  // PDF text: renders as "?" tofu on Android since no app font has these
  // glyphs. Only strips these specific codepoints - genuine "?" characters
  // in real question text are untouched.
  const PRIVATE_USE_AREA_START = 0xe000;
  const PRIVATE_USE_AREA_END = 0xf8ff;
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < PRIVATE_USE_AREA_START || code > PRIVATE_USE_AREA_END;
    })
    .join("")
    .replace(/[ 	]{2,}/g, " ");
  const text = cleaned.trim().slice(0, MAX_EXTRACTED_CHARS);
  return { text };
}
