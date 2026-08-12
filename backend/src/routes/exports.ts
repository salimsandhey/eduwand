import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { storage } from "../lib/storage";
import { runCsvExport } from "../lib/exports";
import { requireRoles } from "../lib/rbac";

interface ListQuery {
  page?: string;
  pageSize?: string;
}

interface ScheduleBody {
  frequency?: "daily" | "weekly";
  isActive?: boolean;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

export async function exportRoutes(app: FastifyInstance) {
  app.post("/exports/run", { onRequest: scoped(app) }, async (request, reply) => {
    const log = await runCsvExport(request.schoolId, request.user.sub);
    if (log.status === "failed") {
      return reply.code(500).send({
        data: null,
        error: { code: "export_failed", message: "Export failed", exportLogId: log.id },
      });
    }
    return reply.code(201).send({ data: log, meta: {} });
  });

  // Recurring export config (FR-EG-11) - the worker (backend/src/worker.ts)
  // checks lastRunAt against frequency each tick and calls runCsvExport itself.
  app.get(
    "/exports/schedule",
    { onRequest: [...scoped(app), requireRoles("admin", "leadership")] },
    async (request) => {
      const schedule = await prisma.csvExportSchedule.findUnique({ where: { schoolId: request.schoolId } });
      return { data: schedule, meta: {} };
    }
  );

  app.put<{ Body: ScheduleBody }>(
    "/exports/schedule",
    { onRequest: [...scoped(app), requireRoles("admin", "leadership")] },
    async (request, reply) => {
      const body = request.body ?? {};
      if (body.frequency && !["daily", "weekly"].includes(body.frequency)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "frequency must be daily or weekly" },
        });
      }

      const schedule = await prisma.csvExportSchedule.upsert({
        where: { schoolId: request.schoolId },
        update: { frequency: body.frequency ?? undefined, isActive: body.isActive ?? undefined },
        create: {
          schoolId: request.schoolId,
          frequency: body.frequency ?? "weekly",
          isActive: body.isActive ?? true,
        },
      });

      return { data: schedule, meta: {} };
    }
  );

  app.get<{ Querystring: ListQuery }>("/exports/log", { onRequest: scoped(app) }, async (request) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.query.pageSize) || 20));
    const where = { schoolId: request.schoolId };

    const [items, totalCount] = await Promise.all([
      prisma.csvExportLog.findMany({
        where,
        orderBy: { runAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.csvExportLog.count({ where }),
    ]);

    return { data: items, meta: { page, pageSize, totalCount } };
  });

  app.get<{ Params: { id: string } }>(
    "/exports/:id/download",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const log = await prisma.csvExportLog.findFirst({
        where: { id: request.params.id, schoolId: request.schoolId },
      });

      if (!log || log.status !== "success" || !log.fileLocation) {
        return reply.code(404).send({
          data: null,
          error: { code: "not_found", message: "Export file not found" },
        });
      }

      const content = await storage.read(log.fileLocation);

      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename="export-${log.id}.csv"`);
      return reply.send(content);
    }
  );
}
