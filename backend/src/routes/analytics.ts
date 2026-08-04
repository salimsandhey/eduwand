import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

const STATUSES = ["new", "contacted", "visit", "application", "admitted", "enrolled", "lost"];
const CONVERTED_STATUSES = ["admitted", "enrolled"];

interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
}

const analyticsGuard = (app: FastifyInstance) => [
  app.authenticate,
  app.requireSchoolScope,
  requireRoles("admin", "leadership"),
];

function dateRangeFilter(query: DateRangeQuery) {
  if (!query.startDate && !query.endDate) return {};
  return {
    createdAt: {
      ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
      ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
    },
  };
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/funnel",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { status: true } });

      const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
      for (const enquiry of enquiries) {
        byStatus[enquiry.status] = (byStatus[enquiry.status] ?? 0) + 1;
      }

      const totalCount = enquiries.length;
      const convertedCount = enquiries.filter((e) => CONVERTED_STATUSES.includes(e.status)).length;
      const conversionRate = totalCount === 0 ? 0 : convertedCount / totalCount;

      return {
        data: { byStatus, totalCount, convertedCount, conversionRate },
        meta: {},
      };
    }
  );

  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/by-source",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { source: true } });

      const bySource: Record<string, number> = {};
      for (const enquiry of enquiries) {
        bySource[enquiry.source] = (bySource[enquiry.source] ?? 0) + 1;
      }

      return { data: { bySource, totalCount: enquiries.length }, meta: {} };
    }
  );

  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/counsellor-performance",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ownerUserId: { not: null },
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { ownerUserId: true, status: true } });

      const byOwner = new Map<string, { totalCount: number; convertedCount: number }>();
      for (const enquiry of enquiries) {
        const ownerId = enquiry.ownerUserId as string;
        const stats = byOwner.get(ownerId) ?? { totalCount: 0, convertedCount: 0 };
        stats.totalCount += 1;
        if (CONVERTED_STATUSES.includes(enquiry.status)) stats.convertedCount += 1;
        byOwner.set(ownerId, stats);
      }

      const owners = await prisma.appUser.findMany({
        where: { id: { in: [...byOwner.keys()] } },
        select: { id: true, fullName: true },
      });
      const nameById = new Map(owners.map((o) => [o.id, o.fullName]));

      const data = [...byOwner.entries()].map(([ownerUserId, stats]) => ({
        ownerUserId,
        fullName: nameById.get(ownerUserId) ?? "Unknown",
        totalCount: stats.totalCount,
        convertedCount: stats.convertedCount,
        conversionRate: stats.totalCount === 0 ? 0 : stats.convertedCount / stats.totalCount,
      }));

      data.sort((a, b) => b.conversionRate - a.conversionRate);

      return { data, meta: {} };
    }
  );
}
