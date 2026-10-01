import { prisma } from "./prisma";
import { aiProvider, logAiUsage, MODEL_GEMINI_FLASH, ResearchCandidateType } from "./ai";
import { resolveReachableUrlDetailed } from "./extraction";
import { getSchoolBoard } from "./boards";
import { searchImages, filterImagesUsableForTopic, ImageHit } from "./image-search";
import { searchYoutubeVideos, VideoHit } from "./youtube-search";

export interface ResearchCandidate {
  id: string;
  title: string;
  url: string;
  type: ResearchCandidateType;
  snippet: string;
  status: "pending" | "approved" | "dismissed";
  contextSourceId?: string;
  // Image candidates only: a preview to show in the review list, the credit
  // line to store with the image, and the page it was found on.
  thumbnailUrl?: string;
  attribution?: string;
  sourcePageUrl?: string;
  // Video candidates only - reference videos for the teacher to watch, never
  // fed to the AI as context. videoId drives the in-app embedded player.
  videoId?: string;
  channelTitle?: string;
  duration?: string;
}

const IMAGE_CANDIDATE_LIMIT = 8;
const VIDEO_CANDIDATE_LIMIT = 8;

// Two searches (the plain topic, and "diagram") give a better mix than one:
// a topic name alone tends to return photos, a diagram is usually what a
// teacher actually wants on a slide. Both are subject-qualified for the same
// reason findVideoCandidates below already is - a bare topic name is often
// ambiguous ("Cells", "Waves", "Force") and pulls same-word-different-sense
// results from a plain keyword image search.
async function findImageCandidates(topicName: string, subject: string, classLabel: string): Promise<ImageHit[]> {
  const settled = await Promise.allSettled([searchImages(`${topicName} ${subject}`, 5), searchImages(`${topicName} ${subject} diagram`, 5)]);
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
  // Deduped across both query variants BEFORE vision-checking - the two
  // queries often surface the same image, and checking per-query (like
  // before) meant vision-checking that same image twice.
  const capped = merged.slice(0, IMAGE_CANDIDATE_LIMIT);
  return filterImagesUsableForTopic(capped, topicName, subject, classLabel);
}

// A subject-and-grade-qualified query ("Photosynthesis Science Class 7") does
// better than the bare topic name, which can be ambiguous, pull in unrelated
// results, or return material pitched at the wrong grade entirely.
async function findVideoCandidates(topicName: string, subject: string, classLabel: string): Promise<VideoHit[]> {
  try {
    return await searchYoutubeVideos(`${topicName} ${subject} ${classLabel}`, VIDEO_CANDIDATE_LIMIT);
  } catch (err) {
    console.error("[context-research] YouTube search failed:", err);
    return [];
  }
}

/**
 * Runs AI Research mode for a Context Research job: asks the AI provider to
 * search the web for candidate sources (pages, PDFs, presentations) and
 * searches for images, then marks the job completed with the results. Called
 * unawaited right after the job row is created, so it runs in the background
 * of the same API process (no queue in this repo - see backend/src/worker.ts
 * for the only other async infra, a separate process not otherwise involved
 * in Context module features).
 */
export async function runContextResearch(jobId: string, charge?: { schoolId: string; teacherUserId: string }): Promise<void> {
  try {
    const job = await prisma.contextResearchJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { topic: { include: { classSection: true } } },
    });
    const classLabel = `${job.topic.classSection.className} ${job.topic.classSection.sectionName}`;

    await prisma.contextResearchJob.update({ where: { id: jobId }, data: { stage: "searching" } });

    // Web research and image search are independent: if one is down the
    // teacher should still get the other's results. The job only fails when
    // neither produced anything.
    const [webResult, imageResult, videoResult] = await Promise.allSettled([
      aiProvider.researchContextSources({
        topicName: job.topic.name,
        subject: job.topic.subject,
        board: await getSchoolBoard(job.topic.schoolId),
        classLabel,
      }),
      findImageCandidates(job.topic.name, job.topic.subject, classLabel),
      findVideoCandidates(job.topic.name, job.topic.subject, classLabel),
    ]);
    if (webResult.status === "rejected" && imageResult.status === "rejected" && videoResult.status === "rejected") throw webResult.reason;
    if (webResult.status === "rejected") console.error(`[context-research] job ${jobId} web search failed:`, webResult.reason);

    const drafts = webResult.status === "fulfilled" ? webResult.value.candidates : [];
    const images = imageResult.status === "fulfilled" ? imageResult.value : [];
    const videos = videoResult.status === "fulfilled" ? videoResult.value : [];

    await prisma.contextResearchJob.update({ where: { id: jobId }, data: { stage: "reviewing" } });

    // A candidate URL can be real (search actually found it) and still be
    // dead - removed since it was indexed, or a soft-404 - so verify every
    // one is actually reachable before a teacher ever sees it. This also
    // resolves Gemini's grounding redirect URLs
    // (vertexaisearch.cloud.google.com/grounding-api-redirect/...) to the
    // real destination, so the teacher sees and stores the actual site.
    const resolved = await Promise.all(drafts.map((draft) => resolveReachableUrlDetailed(draft.url)));
    const webCandidates: ResearchCandidate[] = drafts
      .map((draft, i) => (resolved[i] ? { ...draft, url: resolved[i]!.finalUrl, contentType: resolved[i]!.contentType } : null))
      .filter((draft): draft is typeof drafts[number] & { contentType: string } => draft !== null)
      .map((draft) => ({
        id: crypto.randomUUID(),
        title: draft.title,
        url: draft.url,
        // The model labels a result "pdf"/"article" from its title and snippet,
        // not from actually checking the file - a "CBSE Notes PDF" page is very
        // often just an HTML notes page with "PDF" in its title, and a genuine
        // PDF file sometimes gets called "article" the other way round. Trust
        // the real, just-fetched content-type over the model's guess in both
        // directions, so "pdf" (and the download-and-store "Add PDF" flow it
        // implies) always means an actual PDF file, never a web page about one.
        type:
          draft.type === "pdf" && draft.contentType !== "application/pdf"
            ? "article"
            : draft.type !== "pdf" && draft.type !== "video" && draft.contentType === "application/pdf"
            ? "pdf"
            : draft.type,
        snippet: draft.snippet,
        status: "pending" as const,
      }));

    const imageCandidates: ResearchCandidate[] = images.map((hit) => ({
      id: crypto.randomUUID(),
      title: hit.title,
      url: hit.url,
      type: "image" as const,
      snippet: hit.attribution,
      status: "pending" as const,
      thumbnailUrl: hit.thumbnailUrl,
      attribution: hit.attribution,
      sourcePageUrl: hit.pageUrl,
    }));

    const videoCandidates: ResearchCandidate[] = videos.map((hit) => ({
      id: crypto.randomUUID(),
      title: hit.title,
      url: `https://www.youtube.com/watch?v=${hit.videoId}`,
      type: "video" as const,
      snippet: hit.channelTitle,
      status: "pending" as const,
      thumbnailUrl: hit.thumbnailUrl,
      videoId: hit.videoId,
      channelTitle: hit.channelTitle,
      duration: hit.duration,
    }));

    // The web search is a paid AI call - charged when it worked, like every
    // other AI feature (the search itself was refused up front if the teacher
    // could not afford it).
    if (charge && webResult.status === "fulfilled" && webResult.value.live) {
      await logAiUsage({ schoolId: charge.schoolId, teacherUserId: charge.teacherUserId, feature: "context_research", model: MODEL_GEMINI_FLASH });
    }

    await prisma.contextResearchJob.update({
      where: { id: jobId },
      data: { status: "completed", stage: "done", candidates: [...webCandidates, ...imageCandidates, ...videoCandidates] as unknown as object },
    });
  } catch (err) {
    console.error(`[context-research] job ${jobId} failed:`, err);
    await prisma.contextResearchJob.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage: err instanceof Error ? err.message : "Research failed" },
    }).catch(() => {});
  }
}
