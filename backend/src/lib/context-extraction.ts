import { aiProvider } from "./ai";
import { storage } from "./storage";
import { extractText, extractUrlText, MAX_EXTRACTED_CHARS } from "./extraction";
import { fetchYoutubeTitle } from "./context-limits";

export type ExtractionStatus = "pending" | "extracted" | "failed_no_text";

/**
 * Pure decision for the extraction_status a context source should carry, given
 * the outcome of trying to pull text (and figure descriptions) out of it.
 * Mirrors the rules the upload route applied inline before this was extracted.
 */
export function extractionStatusFor(params: {
  sourceType: string;
  hasVisionKey: boolean;
  extractedText: string | null;
}): ExtractionStatus {
  if (params.sourceType === "idream_k12" || params.sourceType === "youtube") return "extracted";
  if (params.extractedText && params.extractedText.trim().length > 0) return "extracted";
  if (params.sourceType === "image" && !params.hasVisionKey) return "pending";
  return "failed_no_text";
}

export interface ContextExtractionResult {
  extractedText: string | null;
  extractionError: string | null;
  extractionStatus: ExtractionStatus;
  pageCount?: number;
}

/**
 * Run extraction for one context source.
 *
 * Images are transcribed AND figure-described by the vision model here, at
 * upload time, and the resulting text is stored on the source. Content
 * generation then only ever reads that stored text, so an image is sent to the
 * model exactly once no matter how many times the teacher generates or retries.
 *
 * Documents use local text extraction; URLs are fetched and stripped.
 */
export async function runContextExtraction(params: {
  sourceType: string;
  fileLocation?: string | null;
  sourceUrl?: string | null;
  buffer?: Buffer | null;
}): Promise<ContextExtractionResult> {
  const hasVisionKey = Boolean(process.env.GEMINI_API_KEY);
  let extractedText: string | null = null;
  let extractionError: string | null = null;
  let pageCount: number | undefined;

  try {
    if (params.sourceType === "image") {
      if (hasVisionKey && params.fileLocation) {
        const result = await aiProvider.describeImageForContext({ fileLocation: params.fileLocation });
        if (result.text.length > 0) extractedText = result.text;
      }
    } else if (params.sourceType === "url") {
      if (params.sourceUrl) {
        const result = await extractUrlText(params.sourceUrl);
        if (result && result.text.length > 0) extractedText = result.text;
      }
    } else if (params.sourceType === "youtube") {
      // No transcript extraction - just a best-effort title as light context,
      // via fetchYoutubeTitle's public oEmbed lookup (no API key needed).
      if (params.sourceUrl) {
        const title = await fetchYoutubeTitle(params.sourceUrl);
        if (title) extractedText = `YouTube video: ${title}`;
      }
    } else if (params.sourceType === "idream_k12") {
      // No local extraction path yet - treated as ready by extractionStatusFor.
    } else {
      const buffer =
        params.buffer ?? (params.fileLocation ? await storage.readBuffer(params.fileLocation) : null);
      if (buffer) {
        const result = await extractText(buffer, params.sourceType);
        if (result && result.text.length > 0) extractedText = result.text;
        pageCount = result?.pageCount;
      }
    }
  } catch (err) {
    extractionError = err instanceof Error ? err.message : "Extraction failed";
  }

  if (extractedText) extractedText = extractedText.slice(0, MAX_EXTRACTED_CHARS);

  return {
    extractedText,
    extractionError,
    extractionStatus: extractionStatusFor({
      sourceType: params.sourceType,
      hasVisionKey,
      extractedText,
    }),
    pageCount,
  };
}
