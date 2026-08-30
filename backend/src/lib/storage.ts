import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

export interface Storage {
  save(key: string, content: string | Buffer): Promise<{ location: string }>;
  read(location: string): Promise<string>;
  readBuffer(location: string): Promise<Buffer>;
  remove(location: string): Promise<void>;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "heic"]);

type CloudinaryResourceType = "image" | "raw" | "video";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!process.env.CLOUDINARY_URL) {
    throw new Error("CLOUDINARY_URL is not set - file storage is unavailable");
  }
  // The SDK reads credentials from CLOUDINARY_URL automatically.
  cloudinary.config({ secure: true });
  configured = true;
}

function resourceTypeForKey(key: string): CloudinaryResourceType {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext) ? "image" : "raw";
}

/**
 * key -> Cloudinary public_id. Folder structure in the key is preserved.
 * For `raw` the extension stays part of the id (Cloudinary serves it
 * verbatim); for `image` it's dropped because Cloudinary appends the
 * detected format to the delivery URL.
 */
function publicIdForKey(key: string, resourceType: CloudinaryResourceType): string {
  const clean = key.replace(/^\/+/, "");
  return resourceType === "raw" ? clean : clean.replace(/\.[^./]+$/, "");
}

/**
 * Recover { publicId, resourceType } from a Cloudinary delivery URL so the
 * asset can be destroyed. Returns null for anything that isn't one (e.g. a
 * legacy local path) so callers can no-op instead of throwing.
 */
export function parseCloudinaryUrl(
  url: string
): { publicId: string; resourceType: CloudinaryResourceType } | null {
  const match = url.match(/\/(image|raw|video)\/upload\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  const resourceType = match[1] as CloudinaryResourceType;
  let publicId = match[2];
  if (resourceType !== "raw") publicId = publicId.replace(/\.[^./]+$/, "");
  return { publicId, resourceType };
}

class CloudinaryStorage implements Storage {
  async save(key: string, content: string | Buffer): Promise<{ location: string }> {
    ensureConfigured();
    const resourceType = resourceTypeForKey(key);
    const publicId = publicIdForKey(key, resourceType);
    const buffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: resourceType, overwrite: true, invalidate: true },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error("Cloudinary upload returned no result"));
            return;
          }
          resolve(response);
        }
      );
      stream.end(buffer);
    });

    return { location: result.secure_url };
  }

  async readBuffer(location: string): Promise<Buffer> {
    ensureConfigured();
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(`Failed to read from storage (${response.status}): ${location}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async read(location: string): Promise<string> {
    return (await this.readBuffer(location)).toString("utf-8");
  }

  async remove(location: string): Promise<void> {
    ensureConfigured();
    const parsed = parseCloudinaryUrl(location);
    if (!parsed) return;
    try {
      await cloudinary.uploader.destroy(parsed.publicId, {
        resource_type: parsed.resourceType,
        invalidate: true,
      });
    } catch (err) {
      // Best-effort: profile-photo replace and GDPR erase should not fail hard
      // because a stale asset could not be deleted.
      console.error("[storage] failed to delete asset", location, err);
    }
  }
}

export const storage: Storage = new CloudinaryStorage();
