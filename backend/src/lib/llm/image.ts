import sharp, { type Metadata } from "sharp";
import type { ConverseContentBlock } from "./bedrock";

// Bedrock rejects images over 3.75 MB or 8000 px on a side, and phone photos
// routinely exceed both - anything large is downscaled to a JPEG first.
const MAX_BYTES = 3_500_000;
const MAX_SIDE = 2400;
const RESIZE_SIDE = 2000;

const FORMATS: Record<string, "png" | "jpeg" | "gif" | "webp"> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  gif: "gif",
  webp: "webp",
};

export async function imageBlockForClaude(buffer: Buffer, ext: string): Promise<ConverseContentBlock> {
  const format = FORMATS[ext.toLowerCase()] ?? "jpeg";

  let meta: Metadata | null = null;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // Unreadable metadata - send as-is and let the model call decide.
  }

  const tooBig = buffer.length > MAX_BYTES || (meta && Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_SIDE);
  if (!tooBig) return { image: { format, source: { bytes: buffer.toString("base64") } } };

  const resized = await sharp(buffer)
    .rotate() // honour EXIF orientation before the metadata is dropped
    .resize({ width: RESIZE_SIDE, height: RESIZE_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { image: { format: "jpeg", source: { bytes: resized.toString("base64") } } };
}
