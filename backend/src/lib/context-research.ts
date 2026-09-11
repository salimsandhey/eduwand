import { prisma } from "./prisma";
import { aiProvider, ResearchCandidateType } from "./ai";

export interface ResearchCandidate {
  id: string;
  title: string;
  url: string;
  type: ResearchCandidateType;
  snippet: string;
  status: "pending" | "approved" | "dismissed";
  contextSourceId?: string;
}

/**
 * Runs AI Research mode for a Context Research job: asks the AI provider to
 * search the web for candidate sources, then marks the job completed with
 * the results. Called unawaited right after the job row is created, so it
 * runs in the background of the same API process (no queue in this repo -
 * see backend/src/worker.ts for the only other async infra, a separate
 * process not otherwise involved in Context module features).
 */
export async function runContextResearch(jobId: string): Promise<void> {
  try {
    const job = await prisma.contextResearchJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { topic: true },
    });

    await prisma.contextResearchJob.update({ where: { id: jobId }, data: { stage: "searching" } });

    const { candidates: drafts } = await aiProvider.researchContextSources({
      topicName: job.topic.name,
      subject: job.topic.subject,
      board: job.topic.board,
    });

    await prisma.contextResearchJob.update({ where: { id: jobId }, data: { stage: "reviewing" } });

    const candidates: ResearchCandidate[] = drafts.map((draft) => ({
      id: crypto.randomUUID(),
      title: draft.title,
      url: draft.url,
      type: draft.type,
      snippet: draft.snippet,
      status: "pending",
    }));

    await prisma.contextResearchJob.update({
      where: { id: jobId },
      data: { status: "completed", stage: "done", candidates: candidates as unknown as object },
    });
  } catch (err) {
    console.error(`[context-research] job ${jobId} failed:`, err);
    await prisma.contextResearchJob.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage: err instanceof Error ? err.message : "Research failed" },
    }).catch(() => {});
  }
}
