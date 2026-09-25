import crypto from "crypto";

// Shared upload safety. Two rules:
//  1. Never trust what the client says a file is - images are identified by
//     their actual bytes, and only raster formats are accepted (SVG can carry
//     script and is served back from our own origin).
//  2. Never put a client-chosen filename in a storage key. Keys are random, so
//     they can't be guessed or forged, and can't smuggle path segments.

export const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

// Magic-byte detection. Returns null for anything that isn't an accepted raster image.
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(buffer.subarray(8, 12).toString("ascii"))) {
    return "image/heic";
  }
  return null;
}

// Extensions that a browser or OS might execute or render as active content.
const BLOCKED_EXTENSIONS = new Set([
  "html", "htm", "xhtml", "svg", "xml", "js", "mjs", "cjs", "php", "exe", "bat", "cmd", "com", "sh", "ps1", "jar", "msi", "dll", "scr", "vbs", "hta", "swf",
]);

function cleanExtension(filename: string | undefined, fallback: string): string {
  const raw = (filename?.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  if (!raw || BLOCKED_EXTENSIONS.has(raw)) return fallback;
  return raw;
}

// e.g. uploadKey("staff-photos/<id>", "me.png") -> "staff-photos/<id>/3f9c….png".
// The extension is kept (storage picks image vs raw handling from it) but is
// sanitised, and dangerous ones are replaced with "bin".
export function uploadKey(prefix: string, filename: string | undefined, fallbackExtension = "bin"): string {
  return `${prefix.replace(/\/+$/, "")}/${crypto.randomUUID()}.${cleanExtension(filename, fallbackExtension)}`;
}

// Key for a file already confirmed to be an image: the extension comes from the
// detected type, not from anything the client sent.
export function imageKey(prefix: string, mime: string): string {
  return `${prefix.replace(/\/+$/, "")}/${crypto.randomUUID()}.${IMAGE_EXTENSION_BY_MIME[mime] ?? "jpg"}`;
}

export const IMAGE_ONLY_ERROR = {
  data: null,
  error: { code: "validation_error", message: "Please upload a JPEG, PNG, WebP or GIF image." },
};
