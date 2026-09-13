// "More Visual" presentation template - sources real photos from Unsplash
// instead of AI image generation. Only the Access Key is needed (Unsplash's
// public search endpoint authenticates via a Client-ID header); the Secret
// Key/App ID are only for OAuth-on-a-user's-behalf flows we don't use here.

const UNSPLASH_SEARCH_ENDPOINT = "https://api.unsplash.com/search/photos";

export interface UnsplashPhoto {
  url: string;
  photographerName: string;
}

/**
 * Best-effort - returns null on no results, missing config, or any error
 * rather than throwing, so one bad image lookup never fails a whole
 * presentation generation.
 */
export async function searchUnsplashPhoto(query: string): Promise<UnsplashPhoto | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey || !query.trim()) return null;

  try {
    const url = `${UNSPLASH_SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Client-ID ${accessKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: { urls?: { regular?: string }; user?: { name?: string } }[];
    };
    const first = data.results?.[0];
    if (!first?.urls?.regular) return null;

    return { url: first.urls.regular, photographerName: first.user?.name ?? "Unsplash" };
  } catch (err) {
    console.error("[unsplash] search failed:", err);
    return null;
  }
}

/**
 * Downloads a found photo and returns its bytes, ready for
 * storage.save() - re-hosting through our own storage instead of hotlinking
 * the Unsplash URL, so a generated deck doesn't depend on an external URL
 * staying alive.
 */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
