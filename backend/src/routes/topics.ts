import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";
import { MAX_EXTRACTED_CHARS } from "../lib/extraction";
import { runContextExtraction } from "../lib/context-extraction";
import { runContextResearch, ResearchCandidate } from "../lib/context-research";
import { markOnboardingTaskComplete } from "../lib/onboarding";
import {
  assertContextSourceCapNotExceeded,
  assertBucketCapNotExceeded,
  bucketForSourceType,
  ContextSourceBucket,
  ContextSourceCapError,
  detectYoutubeUrl,
} from "../lib/context-limits";

const VALID_SOURCE_TYPES = ["pdf", "docx", "pptx", "image", "url", "youtube", "idream_k12"];

const FILE_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

interface CreateTopicBody {
  classSectionId: string;
  subject: string;
  name: string;
  board: string;
}

interface CreateContextSourceBody {
  sourceType: string;
  sourceUrl?: string;
  idreamK12ReferenceId?: string;
}

interface CreateObservationBody {
  body: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

export async function topicRoutes(app: FastifyInstance) {
  app.get("/topics", { onRequest: scoped(app) }, async (request) => {
    const query = (request.query ?? {}) as { classSectionId?: string; subject?: string };
    const topics = await prisma.topic.findMany({
      where: {
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        ...(query.classSectionId ? { classSectionId: query.classSectionId } : {}),
        ...(query.subject ? { subject: query.subject } : {}),
      },
      include: { classSection: { select: { className: true, sectionName: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return { data: topics, meta: {} };
  });

  app.post<{ Body: CreateTopicBody }>("/topics", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? ({} as CreateTopicBody);

    if (!body.classSectionId || !body.subject || !body.name || !body.board) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "classSectionId, subject, name, and board are required" },
      });
    }

    const classSection = await prisma.classSection.findFirst({
      where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
    });
    if (!classSection) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
    }

    const topic = await prisma.topic.create({
      data: {
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        classSectionId: body.classSectionId,
        subject: body.subject,
        name: body.name,
        board: body.board,
        status: "active",
      },
    });

    await markOnboardingTaskComplete(request.user.sub, "first_lesson");

    return reply.code(201).send({ data: topic, meta: {} });
  });

  app.get<{ Params: { id: string } }>("/topics/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const topic = await prisma.topic.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: {
        classSection: { select: { className: true, sectionName: true } },
        contextSources: { orderBy: { createdAt: "desc" } },
        generations: { orderBy: { generatedAt: "desc" }, include: { contextSources: true } },
        observations: { orderBy: { recordedAt: "desc" } },
        assignments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!topic) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }
    return { data: topic, meta: {} };
  });

  app.post<{ Params: { id: string }; Body: CreateContextSourceBody }>(
    "/topics/:id/context",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const topic = await prisma.topic.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const isMultipart = request.isMultipart?.();
      let sourceType: string;
      let fileLocation: string | null = null;
      let originalFilename: string | null = null;
      let sourceUrl: string | null = null;
      let idreamK12ReferenceId: string | null = null;
      let fileBuffer: Buffer | null = null;

      if (isMultipart) {
        const file = await request.file();
        if (!file) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: "No file uploaded" } });
        }
        const ext = (file.filename.split(".").pop() ?? "").toLowerCase();
        sourceType = ["pdf", "docx", "pptx"].includes(ext)
          ? ext === "docx"
            ? "docx"
            : ext === "pptx"
            ? "pptx"
            : "pdf"
          : "image";
        originalFilename = file.filename;
        fileBuffer = await file.toBuffer();
        const { location } = await storage.save(`context-sources/${topic.id}/${Date.now()}-${file.filename}`, fileBuffer);
        fileLocation = location;
      } else {
        const body = request.body ?? ({} as CreateContextSourceBody);
        if (!body.sourceType || !VALID_SOURCE_TYPES.includes(body.sourceType)) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: `sourceType must be one of ${VALID_SOURCE_TYPES.join(", ")}` },
          });
        }
        if (body.sourceType === "url" && !body.sourceUrl) {
          return reply.code(400).send({ data: null, error: { code: "validation_error", message: "sourceUrl is required for sourceType url" } });
        }
        if (body.sourceType === "idream_k12" && !body.idreamK12ReferenceId) {
          return reply.code(400).send({
            data: null,
            error: { code: "validation_error", message: "idreamK12ReferenceId is required for sourceType idream_k12" },
          });
        }
        sourceType = body.sourceType;
        sourceUrl = body.sourceUrl ?? null;
        idreamK12ReferenceId = body.idreamK12ReferenceId ?? null;
        // Detection happens server-side regardless of what the client sent,
        // so it's centralized in one place rather than duplicated on every caller.
        if (sourceType === "url" && sourceUrl && detectYoutubeUrl(sourceUrl)) {
          sourceType = "youtube";
        }
      }

      try {
        await assertContextSourceCapNotExceeded(topic.id, sourceType);
      } catch (err) {
        if (err instanceof ContextSourceCapError) {
          return reply.code(400).send({ data: null, error: { code: err.code, message: err.message } });
        }
        throw err;
      }

      const extraction = await runContextExtraction({ sourceType, fileLocation, sourceUrl, buffer: fileBuffer });

      const contextSource = await prisma.contextSource.create({
        data: {
          topicId: topic.id,
          sourceType,
          fileLocation,
          originalFilename,
          sourceUrl,
          idreamK12ReferenceId,
          pageCount: extraction.pageCount ?? null,
          extractionStatus: extraction.extractionStatus,
          extractedText: extraction.extractedText,
          extractionError: extraction.extractionError,
        },
      });

      return reply.code(201).send({ data: contextSource, meta: {} });
    }
  );

  // Re-run extraction for an existing source - used by the "Re-transcribe" /
  // "Re-extract" action when the first pass produced nothing useful, or ran
  // before a vision key was configured (status "pending").
  app.post<{ Params: { topicId: string; contextSourceId: string } }>(
    "/topics/:topicId/context/:contextSourceId/retry-extraction",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const source = await prisma.contextSource.findFirst({
        where: {
          id: request.params.contextSourceId,
          topicId: request.params.topicId,
          topic: { schoolId: request.schoolId },
        },
      });
      if (!source) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Context source not found" } });
      }

      const extraction = await runContextExtraction({
        sourceType: source.sourceType,
        fileLocation: source.fileLocation,
        sourceUrl: source.sourceUrl,
      });

      const updated = await prisma.contextSource.update({
        where: { id: source.id },
        data: {
          extractedText: extraction.extractedText,
          extractionError: extraction.extractionError,
          extractionStatus: extraction.extractionStatus,
        },
      });

      return { data: updated, meta: {} };
    }
  );

  // Manual override of a source's extracted text - lets a teacher fix a poor
  // transcription or paste text in for a source the extractor could not read.
  app.patch<{ Params: { topicId: string; contextSourceId: string }; Body: { extractedText?: string } }>(
    "/topics/:topicId/context/:contextSourceId",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? {};
      if (typeof body.extractedText !== "string" || !body.extractedText.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "extractedText is required" } });
      }

      const source = await prisma.contextSource.findFirst({
        where: {
          id: request.params.contextSourceId,
          topicId: request.params.topicId,
          topic: { schoolId: request.schoolId },
        },
      });
      if (!source) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Context source not found" } });
      }

      const updated = await prisma.contextSource.update({
        where: { id: source.id },
        data: {
          extractedText: body.extractedText.trim().slice(0, MAX_EXTRACTED_CHARS),
          extractionStatus: "extracted",
          extractionError: null,
        },
      });

      return { data: updated, meta: {} };
    }
  );

  // Deletes a context source outright - lets a teacher clear out sources
  // that turned out irrelevant/wrong instead of leaving them cluttering
  // every future generation's source picker. Also frees its cap slot.
  app.delete<{ Params: { topicId: string; contextSourceId: string } }>(
    "/topics/:topicId/context/:contextSourceId",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const source = await prisma.contextSource.findFirst({
        where: {
          id: request.params.contextSourceId,
          topicId: request.params.topicId,
          topic: { schoolId: request.schoolId },
        },
      });
      if (!source) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Context source not found" } });
      }

      await prisma.contextSource.delete({ where: { id: source.id } });
      if (source.fileLocation) await storage.remove(source.fileLocation);

      // A JSON envelope, not a bare 204 - every other endpoint in this API
      // returns { data, meta } and the frontend's request() helper always
      // calls response.json(), which throws on an empty body.
      return { data: null, meta: {} };
    }
  );

  // Clones another of the teacher's own topics' context sources onto this
  // topic - "import from another class" for the same lesson taught to a
  // different section. No re-extraction: extractedText/extractionStatus are
  // copied verbatim since the underlying file/url content is identical.
  app.post<{ Params: { id: string }; Body: { sourceTopicId?: string; contextSourceIds?: string[] } }>(
    "/topics/:id/context/import",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const topic = await prisma.topic.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const body = request.body ?? {};
      if (!body.sourceTopicId) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "sourceTopicId is required" } });
      }

      const sourceTopic = await prisma.topic.findFirst({
        where: { id: body.sourceTopicId, schoolId: request.schoolId, teacherUserId: request.user.sub },
        include: {
          contextSources: body.contextSourceIds?.length ? { where: { id: { in: body.contextSourceIds } } } : true,
        },
      });
      if (!sourceTopic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Source topic not found" } });
      }

      const bucketCounts = new Map<ContextSourceBucket, number>();
      for (const source of sourceTopic.contextSources) {
        const bucket = bucketForSourceType(source.sourceType);
        if (bucket) bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
      }
      try {
        for (const [bucket, count] of bucketCounts) {
          await assertBucketCapNotExceeded(topic.id, bucket, count);
        }
      } catch (err) {
        if (err instanceof ContextSourceCapError) {
          return reply.code(400).send({ data: null, error: { code: err.code, message: err.message } });
        }
        throw err;
      }

      const imported = await prisma.$transaction(
        sourceTopic.contextSources.map((source) =>
          prisma.contextSource.create({
            data: {
              topicId: topic.id,
              sourceType: source.sourceType,
              fileLocation: source.fileLocation,
              originalFilename: source.originalFilename,
              sourceUrl: source.sourceUrl,
              idreamK12ReferenceId: source.idreamK12ReferenceId,
              pageCount: source.pageCount,
              extractionStatus: source.extractionStatus,
              extractedText: source.extractedText,
              extractionError: source.extractionError,
            },
          })
        )
      );

      return reply.code(201).send({ data: imported, meta: {} });
    }
  );

  // AI Research mode: starts a background search for candidate context
  // sources. Returns immediately with the job id; the frontend polls
  // GET .../research/:jobId for progress (see backend/src/lib/context-research.ts
  // for why this is an in-process fire-and-forget job rather than a queue).
  app.post<{ Params: { id: string } }>("/topics/:id/context/research", { onRequest: scoped(app) }, async (request, reply) => {
    const topic = await prisma.topic.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
    if (!topic) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }

    const job = await prisma.contextResearchJob.create({ data: { topicId: topic.id } });
    void runContextResearch(job.id);

    return reply.code(202).send({ data: job, meta: {} });
  });

  app.get<{ Params: { id: string; jobId: string } }>(
    "/topics/:id/context/research/:jobId",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const job = await prisma.contextResearchJob.findFirst({
        where: { id: request.params.jobId, topicId: request.params.id, topic: { schoolId: request.schoolId } },
      });
      if (!job) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Research job not found" } });
      }
      return { data: job, meta: {} };
    }
  );

  // Two candidates on the same job can be approved/dismissed at the same
  // time (the whole point is letting a teacher work through the list in
  // parallel instead of one at a time) - but they all read-modify-write the
  // same `candidates` JSON column, and `apply()` below does real work
  // (fetching the URL, running AI cleanup) that can take several seconds, so
  // the window for two requests to both read the pre-update array and then
  // clobber each other's write is wide open.
  //
  // `apply()` runs exactly once, up front - it has side effects (creating a
  // ContextSource), so it must never be retried. Only the cheap "merge this
  // candidate's result into the latest array and write" step retries, guarded
  // by optimistic concurrency (`updatedAt` must match what was just read) so
  // a losing write re-reads the now-current array instead of clobbering
  // whatever the other concurrent request just wrote.
  async function updateResearchCandidate(
    request: FastifyRequest<{ Params: { id: string; jobId: string; candidateId: string } }>,
    reply: FastifyReply,
    apply: (candidate: ResearchCandidate) => Promise<ResearchCandidate>
  ) {
    const initialJob = await prisma.contextResearchJob.findFirst({
      where: { id: request.params.jobId, topicId: request.params.id, topic: { schoolId: request.schoolId } },
    });
    if (!initialJob) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Research job not found" } });
    }
    const initialCandidates = initialJob.candidates as unknown as ResearchCandidate[];
    const initialCandidate = initialCandidates.find((c) => c.id === request.params.candidateId);
    if (!initialCandidate) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Candidate not found" } });
    }

    const updatedCandidate = await apply(initialCandidate);

    let job = initialJob;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidates = job.candidates as unknown as ResearchCandidate[];
      const index = candidates.findIndex((c) => c.id === request.params.candidateId);
      if (index !== -1) candidates[index] = updatedCandidate;

      const { count } = await prisma.contextResearchJob.updateMany({
        where: { id: job.id, updatedAt: job.updatedAt },
        data: { candidates: candidates as unknown as object },
      });
      if (count > 0) {
        return { data: await prisma.contextResearchJob.findUniqueOrThrow({ where: { id: job.id } }), meta: {} };
      }
      job = await prisma.contextResearchJob.findUniqueOrThrow({ where: { id: job.id } });
    }
    return reply.code(409).send({ data: null, error: { code: "conflict", message: "Too many concurrent updates to this research job - try again" } });
  }

  app.post<{ Params: { id: string; jobId: string; candidateId: string } }>(
    "/topics/:id/context/research/:jobId/candidates/:candidateId/approve",
    { onRequest: scoped(app) },
    async (request, reply) => {
      try {
        return await updateResearchCandidate(request, reply, async (candidate) => {
          if (candidate.status === "approved") return candidate;
          const sourceType = detectYoutubeUrl(candidate.url) ? "youtube" : "url";
          await assertContextSourceCapNotExceeded(request.params.id, sourceType);
          const extraction = await runContextExtraction({ sourceType, sourceUrl: candidate.url });
          const contextSource = await prisma.contextSource.create({
            data: {
              topicId: request.params.id,
              sourceType,
              sourceUrl: candidate.url,
              extractionStatus: extraction.extractionStatus,
              extractedText: extraction.extractedText,
              extractionError: extraction.extractionError,
            },
          });
          return { ...candidate, status: "approved", contextSourceId: contextSource.id };
        });
      } catch (err) {
        if (err instanceof ContextSourceCapError) {
          return reply.code(400).send({ data: null, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  app.post<{ Params: { id: string; jobId: string; candidateId: string } }>(
    "/topics/:id/context/research/:jobId/candidates/:candidateId/dismiss",
    { onRequest: scoped(app) },
    async (request, reply) =>
      updateResearchCandidate(request, reply, async (candidate) => ({ ...candidate, status: "dismissed" }))
  );

  async function authenticateFromHeaderOrToken(request: FastifyRequest, reply: FastifyReply) {
    if (request.headers.authorization) {
      return app.authenticate(request, reply);
    }
    const token = (request.query as { token?: string } | undefined)?.token;
    if (!token) {
      reply.code(401).send({ data: null, error: { code: "unauthorized", message: "Missing access token" } });
      return;
    }
    try {
      const payload = app.jwt.verify(token) as typeof request.user;
      if (payload.type !== "access") throw new Error("Not an access token");
      request.user = payload;
    } catch {
      reply.code(401).send({ data: null, error: { code: "unauthorized", message: "Missing or invalid access token" } });
    }
  }

  app.get<{ Params: { topicId: string; contextSourceId: string } }>(
    "/topics/:topicId/context/:contextSourceId/file",
    { onRequest: [authenticateFromHeaderOrToken, app.requireSchoolScope, requireRoles("teacher")] },
    async (request, reply) => {
      const contextSource = await prisma.contextSource.findFirst({
        where: {
          id: request.params.contextSourceId,
          topicId: request.params.topicId,
          topic: { schoolId: request.schoolId },
        },
      });
      if (!contextSource || !contextSource.fileLocation) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "File not found for this context source" } });
      }

      const buffer = await storage.readBuffer(contextSource.fileLocation);
      const filename = contextSource.originalFilename ?? contextSource.fileLocation.split(/[\\/]/).pop() ?? "file";
      const ext = (filename.split(".").pop() ?? "").toLowerCase();

      reply.header("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
      reply.type(FILE_CONTENT_TYPES[ext] ?? "application/octet-stream");
      return reply.send(buffer);
    }
  );

  app.get("/content-library/idream-k12/search", { onRequest: scoped(app) }, async (request) => {
    const query = (request.query ?? {}) as { topic?: string };
    app.log.info({ topic: query.topic }, "iDream K12 search requested, no integration configured yet");
    return { data: [], meta: { integrationConfigured: false } };
  });

  app.post<{ Params: { id: string }; Body: CreateObservationBody }>(
    "/topics/:id/observations",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateObservationBody);
      if (!body.body || !body.body.trim()) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "body is required" } });
      }

      const topic = await prisma.topic.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
      if (!topic) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
      }

      const observation = await prisma.observation.create({
        data: { topicId: topic.id, authorUserId: request.user.sub, body: body.body.trim() },
      });

      return reply.code(201).send({ data: observation, meta: {} });
    }
  );
}
