// Finds reference videos for a topic via the official YouTube Data API v3 -
// these are for a teacher to watch/show in class, not context fed to the AI
// (see Docs decision: video transcripts are too unreliable/costly to extract,
// so YouTube results are a pure "here are good videos" reference list).
//
// Needs YOUTUBE_API_KEY (a free Google Cloud API key, no OAuth required for
// public search/video reads). Without it this silently returns no results,
// the same "optional provider" pattern as image-search.ts's Google CSE.

export interface VideoHit {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  /** "12:34" or "1:02:03". */
  duration: string;
  publishedAt: string;
}

const USER_AGENT = "EduWandBot/1.0 (+https://eduwand.com; Lesson Studio video research)";
const REQUEST_TIMEOUT_MS = 8_000;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`YouTube API request failed (${response.status})`);
  return response.json();
}

// "PT1H2M3S" -> "1:02:03", "PT9M5S" -> "9:05", "PT45S" -> "0:45"
function formatIsoDuration(iso: string): string {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return "";
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export async function searchYoutubeVideos(query: string, limit = 8): Promise<VideoHit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const searchParams = new URLSearchParams({
    key,
    q: query,
    part: "snippet",
    type: "video",
    maxResults: String(Math.min(limit, 25)),
    safeSearch: "strict",
    relevanceLanguage: "en",
    videoEmbeddable: "true",
  });
  const searchData = (await getJson(`https://www.googleapis.com/youtube/v3/search?${searchParams}`)) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> } }[];
  };
  interface VideoDraft {
    videoId: string;
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl: string;
  }
  const drafts = (searchData.items ?? [])
    .map((item) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
      publishedAt: item.snippet?.publishedAt,
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
    }))
    .filter((d): d is VideoDraft => !!(d.videoId && d.title && d.channelTitle && d.thumbnailUrl && d.publishedAt));
  if (drafts.length === 0) return [];

  // A second call for real duration - search.list never returns it. Cheap
  // (1 quota unit) next to search.list's 100, and one batched call for every
  // result from this search rather than one per video.
  const detailParams = new URLSearchParams({ key, id: drafts.map((d) => d.videoId).join(","), part: "contentDetails" });
  const durationById = new Map<string, string>();
  try {
    const detailData = (await getJson(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`)) as {
      items?: { id?: string; contentDetails?: { duration?: string } }[];
    };
    for (const item of detailData.items ?? []) {
      if (item.id && item.contentDetails?.duration) durationById.set(item.id, formatIsoDuration(item.contentDetails.duration));
    }
  } catch {
    // Duration is a nice-to-have; missing it doesn't invalidate the search results.
  }

  return drafts.map((d) => ({
    videoId: d.videoId,
    title: d.title,
    channelTitle: d.channelTitle,
    thumbnailUrl: d.thumbnailUrl,
    duration: durationById.get(d.videoId) ?? "",
    publishedAt: d.publishedAt,
  }));
}
