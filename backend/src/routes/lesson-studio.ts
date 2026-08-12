import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { aiProvider, logAiUsage } from "../lib/ai";

const VALID_BOARDS = ["CBSE", "ICSE", "State"];
const VALID_FORMATS = ["lesson_plan", "learning_material"];

interface GenerateLessonPlanBody {
  topic: string;
  board: string;
  format?: string;
  classSectionId?: string;
}

interface GenerateResearchReportBody {
  topic: string;
  board: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

// Lesson Studio (FR-AI-1, FR-AI-5). Generation is synchronous here since the
// stub provider (backend/src/lib/ai.ts) resolves instantly - the API
// Specification's note about async jobs applies once a real, slower model is
// wired in behind the same AiProvider interface.
export async function lessonStudioRoutes(app: FastifyInstance) {
  app.post<{ Body: GenerateLessonPlanBody }>(
    "/lesson-plans/generate",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as GenerateLessonPlanBody);

      if (!body.topic || !body.board) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "topic and board are required" },
        });
      }
      if (!VALID_BOARDS.includes(body.board)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `board must be one of ${VALID_BOARDS.join(", ")}` },
        });
      }
      const format = body.format ?? "lesson_plan";
      if (!VALID_FORMATS.includes(format)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `format must be one of ${VALID_FORMATS.join(", ")}` },
        });
      }

      let classLabel: string | undefined;
      if (body.classSectionId) {
        const classSection = await prisma.classSection.findFirst({
          where: { id: body.classSectionId, academicYear: { schoolId: request.schoolId } },
        });
        if (!classSection) {
          return reply.code(404).send({ data: null, error: { code: "not_found", message: "Class section not found" } });
        }
        classLabel = `${classSection.className} ${classSection.sectionName}`;
      }

      const start = Date.now();
      const { content, model } = await aiProvider.generateLessonPlan({
        topic: body.topic,
        board: body.board,
        format,
        classLabel,
      });

      const lessonPlan = await prisma.lessonPlan.create({
        data: {
          schoolId: request.schoolId,
          teacherUserId: request.user.sub,
          classSectionId: body.classSectionId ?? null,
          topic: body.topic,
          board: body.board,
          format,
          content,
        },
      });

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "lesson_plan",
        model,
        durationMs: Date.now() - start,
      });

      return reply.code(201).send({ data: lessonPlan, meta: {} });
    }
  );

  app.get("/lesson-plans", { onRequest: scoped(app) }, async (request) => {
    const lessonPlans = await prisma.lessonPlan.findMany({
      where: { schoolId: request.schoolId, teacherUserId: request.user.sub },
      orderBy: { createdAt: "desc" },
    });
    return { data: lessonPlans, meta: {} };
  });

  app.post<{ Body: GenerateResearchReportBody }>(
    "/research-reports/generate",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as GenerateResearchReportBody);

      if (!body.topic || !body.board) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "topic and board are required" },
        });
      }
      if (!VALID_BOARDS.includes(body.board)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `board must be one of ${VALID_BOARDS.join(", ")}` },
        });
      }

      const start = Date.now();
      const { content, model } = await aiProvider.generateResearchReport({ topic: body.topic, board: body.board });

      const report = await prisma.researchReport.create({
        data: {
          schoolId: request.schoolId,
          teacherUserId: request.user.sub,
          topic: body.topic,
          board: body.board,
          content,
        },
      });

      await logAiUsage({
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        feature: "research_report",
        model,
        durationMs: Date.now() - start,
      });

      return reply.code(201).send({ data: report, meta: {} });
    }
  );

  app.get("/research-reports", { onRequest: scoped(app) }, async (request) => {
    const reports = await prisma.researchReport.findMany({
      where: { schoolId: request.schoolId, teacherUserId: request.user.sub },
      orderBy: { createdAt: "desc" },
    });
    return { data: reports, meta: {} };
  });
}
