// Image search for AI research. Two providers, results merged:
//  - Google Programmable Search (image mode) - any web image. Only used when
//    GOOGLE_CSE_KEY and GOOGLE_CSE_CX are set (both come from the Google Cloud
//    console; without them this provider is skipped, not an error).
//  - Wikimedia Commons - always on, needs no key, and gives real author /
//    licence metadata for the credit line.
// Gemini's web-search tool returns pages, not images, so it can't do this.
//
// Neither provider does any relevance ranking of its own - it's a plain
// keyword search against the open web/Commons, so a short or ambiguous
// topic name reliably pulls same-word-different-meaning results. Every
// merged candidate is checked with ai.ts's isImageUsableForTopic (one vision
// call covering both content safety - Commons is deliberately uncensored, so
// an innocuous-looking query like "human body system" can surface a real
// anatomical/nude image - and topic relevance) before being returned.

import { isImageUsableForTopic } from "./ai";

export interface ImageHit {
  url: string;
  thumbnailUrl: string;
  title: string;
  attribution: string;
  pageUrl: string;
}

const USER_AGENT = "EduWandBot/1.0 (+https://eduwand.com; Lesson Studio image research)";
const REQUEST_TIMEOUT_MS = 8_000;
const MIN_WIDTH = 400;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function stripHtml(value: unknown): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Image search failed (${response.status})`);
  return response.json();
}

async function searchCommons(query: string, limit: number): Promise<ImageHit[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: String(limit * 2),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "1280",
    format: "json",
  });
  const data = (await getJson(`https://commons.wikimedia.org/w/api.php?${params}`)) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          index?: number;
          imageinfo?: {
            url: string;
            thumburl?: string;
            descriptionurl?: string;
            mime: string;
            width: number;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    };
  };

  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const hits: ImageHit[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || info.width < MIN_WIDTH) continue;
    const isSvg = info.mime === "image/svg+xml";
    if (!isSvg && !ALLOWED_MIME.has(info.mime)) continue;
    // Commons renders a scaled PNG/JPEG on demand at `thumburl`; for an SVG
    // that is the only raster we can embed, and for large photos it keeps the
    // download small.
    const url = info.thumburl ?? info.url;
    if (!url) continue;
    const meta = info.extmetadata ?? {};
    const author = stripHtml(meta.Artist?.value) || "Unknown author";
    const licence = stripHtml(meta.LicenseShortName?.value) || "see source";
    hits.push({
      url,
      thumbnailUrl: url,
      title: page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "),
      attribution: `${author} · ${licence} · Wikimedia Commons`,
      pageUrl: info.descriptionurl ?? url,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

async function searchGoogle(query: string, limit: number): Promise<ImageHit[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  const params = new URLSearchParams({ key, cx, q: query, searchType: "image", num: String(Math.min(limit, 10)), safe: "active" });
  const data = (await getJson(`https://www.googleapis.com/customsearch/v1?${params}`)) as {
    items?: { link: string; title?: string; displayLink?: string; mime?: string; image?: { thumbnailLink?: string; contextLink?: string; width?: number } }[];
  };
  const hits: ImageHit[] = [];
  for (const item of data.items ?? []) {
    if (item.mime && !ALLOWED_MIME.has(item.mime)) continue;
    if ((item.image?.width ?? MIN_WIDTH) < MIN_WIDTH) continue;
    hits.push({
      url: item.link,
      thumbnailUrl: item.image?.thumbnailLink ?? item.link,
      title: stripHtml(item.title) || "Image",
      attribution: `Image from ${item.displayLink ?? "the web"}`,
      pageUrl: item.image?.contextLink ?? item.link,
    });
  }
  return hits;
}

// Pure search, no vision check - a caller combining several query variants
// (see context-research.ts's findImageCandidates) should merge/dedupe across
// ALL of them first, then run filterImagesUsableForTopic once on the unique
// result. Checking here (per query) would vision-check the same image twice
// whenever two query variants both surface it.
export async function searchImages(query: string, limit: number): Promise<ImageHit[]> {
  const perProvider = process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX ? Math.ceil(limit / 2) : limit;
  // One provider failing (rate limit, outage) must not sink the others.
  const settled = await Promise.allSettled([searchGoogle(query, perProvider), searchCommons(query, perProvider)]);
  const seen = new Set<string>();
  const merged: ImageHit[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const hit of result.value) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      merged.push(hit);
    }
  }
  return merged.slice(0, limit);
}

// topicName/subject/classLabel drive the relevance+grade-fit half of
// isImageUsableForTopic. Call this once, after merging/deduping every query
// variant's searchImages() results, not per-query.
export async function filterImagesUsableForTopic(candidates: ImageHit[], topicName: string, subject: string, classLabel: string): Promise<ImageHit[]> {
  // A check failure excludes that one image rather than the whole search -
  // one flaky call shouldn't cost the teacher every result.
  const checks = await Promise.allSettled(candidates.map((hit) => isImageUsableForTopic(hit.thumbnailUrl, topicName, subject, classLabel)));
  return candidates.filter((_, i) => {
    const check = checks[i];
    return check.status === "fulfilled" && check.value;
  });
}
