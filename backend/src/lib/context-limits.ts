import { prisma } from "./prisma";

export type ContextSourceBucket = "document" | "image" | "link" | "youtube";

// pdf/docx/pptx share one "document" cap since they're all the same "upload
// a file" concept to the teacher; url and youtube are split because YouTube
// links get their own dedicated handling (see fetchYoutubeTitle below) and
// the client asked for a much tighter cap on them specifically.
export const CONTEXT_SOURCE_CAPS: Record<ContextSourceBucket, number> = {
  document: 5,
  image: 10,
  link: 10,
  youtube: 2,
};

const BUCKET_LABELS: Record<ContextSourceBucket, string> = {
  document: "documents (PDF/DOCX/PPTX)",
  image: "images",
  link: "links",
  youtube: "YouTube videos",
};

export function bucketForSourceType(sourceType: string): ContextSourceBucket | null {
  if (sourceType === "pdf" || sourceType === "docx" || sourceType === "pptx") return "document";
  if (sourceType === "image") return "image";
  if (sourceType === "url") return "link";
  if (sourceType === "youtube") return "youtube";
  return null; // idream_k12 - uncapped, never really integrated (see topics.ts)
}

export class ContextSourceCapError extends Error {
  code = "cap_exceeded";
}

/**
 * Throws ContextSourceCapError if adding `additionalCount` more sources of
 * `sourceType` would push that type's bucket over its cap for the topic.
 * Used by every context-source creation path: upload, import-from-another-
 * topic, and AI Research candidate approval.
 */
export async function assertContextSourceCapNotExceeded(
  topicId: string,
  sourceType: string,
  additionalCount = 1
): Promise<void> {
  const bucket = bucketForSourceType(sourceType);
  if (!bucket) return;
  return assertBucketCapNotExceeded(topicId, bucket, additionalCount);
}

// Bucket-level variant for callers that already know the bucket (e.g.
// importing/cloning several sources of a known type at once).
export async function assertBucketCapNotExceeded(
  topicId: string,
  bucket: ContextSourceBucket,
  additionalCount: number
): Promise<void> {
  if (additionalCount <= 0) return;
  const cap = CONTEXT_SOURCE_CAPS[bucket];
  const bucketSourceTypes = bucket === "document" ? ["pdf", "docx", "pptx"] : bucket === "link" ? ["url"] : [bucket];
  const existing = await prisma.contextSource.count({
    where: { topicId, sourceType: { in: bucketSourceTypes } },
  });

  if (existing + additionalCount > cap) {
    const remaining = Math.max(0, cap - existing);
    throw new ContextSourceCapError(
      `This topic already has ${existing} of ${cap} ${BUCKET_LABELS[bucket]} allowed` +
        (remaining > 0 ? ` (${remaining} more can be added).` : ".")
    );
  }
}

const YOUTUBE_URL_PATTERN = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|live\/)|youtu\.be\/)/i;

export function detectYoutubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERN.test(url.trim());
}

// Best-effort only - no API key needed (YouTube's public oEmbed endpoint),
// fixed trusted host so no SSRF concern. Swallows all errors: a YouTube
// source with no title is still a perfectly valid reference link.
export async function fetchYoutubeTitle(url: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(oembedUrl, { signal: controller.signal });
      if (!response.ok) return null;
      const data = (await response.json()) as { title?: string; author_name?: string };
      if (!data.title) return null;
      return data.author_name ? `${data.title} — ${data.author_name}` : data.title;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
