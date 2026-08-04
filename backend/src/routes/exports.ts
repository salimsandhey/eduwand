import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { toCsv } from "../lib/csv";
import { storage } from "../lib/storage";

// Fixed, standard column set (FR-EG-11) - not configurable per school.
const CSV_HEADERS = [
  "full_name",
  "date_of_birth",
  "class",
  "section",
  "board",
  "guardian_name",
  "guardian_contact",
  "admission_date",
  "fee_status",
  "source_enquiry_id",
];

interface ListQuery {
  page?: string;
  pageSize?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

export async function exportRoutes(app: FastifyInstance) {
  app.post("/exports/run", { onRequest: scoped(app) }, async (request, reply) => {
    try {
      const students = await prisma.studentStub.findMany({
        where: { schoolId: request.schoolId },
        include: { classSection: true, school: true },
        orderBy: { admissionDate: "asc" },
      });

      const rows = students.map((s) => [
        s.fullName,
        s.dateOfBirth.toISOString().slice(0, 10),
        s.classSection.className,
        s.classSection.sectionName,
        s.school.board,
        s.guardianName,
        s.guardianContact,
        s.admissionDate.toISOString().slice(0, 10),
        s.feeStatus,
        s.sourceEnquiryId,
      ]);

      const csv = toCsv(CSV_HEADERS, rows);
      const key = `${request.schoolId}/${Date.now()}-admitted-students.csv`;
      const { location } = await storage.save(key, csv);

      const log = await prisma.csvExportLog.create({
        data: {
          schoolId: request.schoolId,
          requestedByUserId: request.user.sub,
          runAt: new Date(),
          rowCount: rows.length,
          status: "success",
          fileLocation: location,
        },
      });

      return reply.code(201).send({ data: log, meta: {} });
    } catch (err) {
      app.log.error(err);
      const log = await prisma.csvExportLog.create({
        data: {
          schoolId: request.schoolId,
          requestedByUserId: request.user.sub,
          runAt: new Date(),
          rowCount: 0,
          status: "failed",
        },
      });
      return reply.code(500).send({
        data: null,
        error: { code: "export_failed", message: "Export failed", exportLogId: log.id },
      });
    }
  });

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
