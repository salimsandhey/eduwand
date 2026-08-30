import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";
import { MAX_EXTRACTED_CHARS } from "../lib/extraction";
import { runContextExtraction } from "../lib/context-extraction";

const VALID_SOURCE_TYPES = ["pdf", "docx", "pptx", "image", "url", "idream_k12"];

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
