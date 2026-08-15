import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { storage } from "../lib/storage";

const VALID_SOURCE_TYPES = ["pdf", "docx", "pptx", "image", "url", "idream_k12"];

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

// Topic (Docs/Dev/AI_Module_Rebuild_Plan.md, Phase 1) - the container every
// generation, assignment, observation, and attainment report belongs to.
// Two topics with the same name for the same class/subject are allowed
// (client doc edge case) - name is intentionally not unique.
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
        contextSources: { orderBy: { createdAt: "desc" } },
        generations: { orderBy: { generatedAt: "desc" } },
        observations: { orderBy: { recordedAt: "desc" } },
        assignments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!topic) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }
    return { data: topic, meta: {} };
  });

  // Upload path (pdf/docx/pptx/image) goes through multipart; url/idream_k12
  // are plain JSON. Kept as one endpoint per the API spec ("POST
  // /topics/{id}/context"), branching on content-type.
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
      let sourceUrl: string | null = null;
      let idreamK12ReferenceId: string | null = null;

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
        const buffer = await file.toBuffer();
        const { location } = await storage.save(`context-sources/${topic.id}/${Date.now()}-${file.filename}`, buffer);
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

      const contextSource = await prisma.contextSource.create({
        data: {
          topicId: topic.id,
          sourceType,
          fileLocation,
          sourceUrl,
          idreamK12ReferenceId,
          // Text extraction (for PDF/DOCX/PPTX context) isn't wired to a real
          // parser yet - left pending rather than faked. Edge case from the
          // client doc ("uploaded PDF is a scan with no extractable text")
          // maps to extractionStatus:"failed_no_text" once that parser exists.
          extractionStatus: sourceType === "url" || sourceType === "idream_k12" ? "extracted" : "pending",
        },
      });

      return reply.code(201).send({ data: contextSource, meta: {} });
    }
  );

  // No iDream K12 credentials/integration exist yet (same situation as
  // backend/src/lib/messaging.ts and the Bedrock provider in lib/ai.ts).
  // Returns an explicit empty result rather than fabricating fake library
  // content - callers must handle the "no results" edge case either way.
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
