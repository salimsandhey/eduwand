import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
  schoolId?: string;
}

interface TrendQuery {
  months?: string;
  schoolId?: string;
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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Oldest -> newest, always the full window even where a month has no data, so
// the trend chart never has a gap.
function buildMonthBuckets(months: number): string[] {
  const now = new Date();
  const buckets: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    buckets.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return buckets;
}

// Pipeline stages are configurable per school (FR-EG-3), so "which statuses
// exist" and "which statuses count as converted" are no longer fixed constants.
async function getStages(schoolId: string) {
  return prisma.pipelineStage.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/funnel",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const stages = await getStages(request.schoolId);
      const convertedKeys = stages.filter((s) => s.isConverted).map((s) => s.key);

      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { status: true } });

      const byStatus = Object.fromEntries(stages.map((s) => [s.key, 0]));
      for (const enquiry of enquiries) {
        byStatus[enquiry.status] = (byStatus[enquiry.status] ?? 0) + 1;
      }

      const totalCount = enquiries.length;
      const convertedCount = enquiries.filter((e) => convertedKeys.includes(e.status)).length;
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
      const stages = await getStages(request.schoolId);
      const convertedKeys = stages.filter((s) => s.isConverted).map((s) => s.key);

      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ownerUserId: { not: null },
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { id: true, ownerUserId: true, status: true } });

      const byOwner = new Map<
        string,
        { totalCount: number; convertedCount: number; responseMsTotal: number; responseCount: number }
      >();
      const ownerByEnquiryId = new Map<string, string>();
      for (const enquiry of enquiries) {
        const ownerId = enquiry.ownerUserId as string;
        ownerByEnquiryId.set(enquiry.id, ownerId);
        const stats = byOwner.get(ownerId) ?? { totalCount: 0, convertedCount: 0, responseMsTotal: 0, responseCount: 0 };
        stats.totalCount += 1;
        if (convertedKeys.includes(enquiry.status)) stats.convertedCount += 1;
        byOwner.set(ownerId, stats);
      }

      // Response time = elapsed time between an enquiry's 1st stage-history row
      // (written at creation, "new") and its 2nd (its first move away from
      // "new") - undefined for an enquiry with no 2nd row yet.
      const history = await prisma.enquiryStageHistory.findMany({
        where: { enquiryId: { in: enquiries.map((e) => e.id) } },
        orderBy: [{ enquiryId: "asc" }, { changedAt: "asc" }],
        select: { enquiryId: true, changedAt: true },
      });
      const changedAtsByEnquiry = new Map<string, Date[]>();
      for (const row of history) {
        const list = changedAtsByEnquiry.get(row.enquiryId) ?? [];
        list.push(row.changedAt);
        changedAtsByEnquiry.set(row.enquiryId, list);
      }
      for (const [enquiryId, changedAts] of changedAtsByEnquiry) {
        if (changedAts.length < 2) continue;
        const ownerId = ownerByEnquiryId.get(enquiryId);
        const stats = ownerId ? byOwner.get(ownerId) : undefined;
        if (!stats) continue;
        stats.responseMsTotal += changedAts[1].getTime() - changedAts[0].getTime();
        stats.responseCount += 1;
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
        avgResponseHours:
          stats.responseCount === 0 ? null : Math.round((stats.responseMsTotal / stats.responseCount / 3600000) * 10) / 10,
      }));

      data.sort((a, b) => b.conversionRate - a.conversionRate);

      return { data, meta: {} };
    }
  );

  app.get<{ Querystring: TrendQuery }>(
    "/analytics/enrolment/trend",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const stages = await getStages(request.schoolId);
      const convertedKeys = stages.filter((s) => s.isConverted).map((s) => s.key);
      const months = Math.min(24, Math.max(1, Number(request.query.months) || 12));
      const now = new Date();
      const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
      const periods = buildMonthBuckets(months);

      const newByPeriod = Object.fromEntries(periods.map((p) => [p, 0])) as Record<string, number>;
      const convertedByPeriod = Object.fromEntries(periods.map((p) => [p, 0])) as Record<string, number>;

      const enquiries = await prisma.enquiry.findMany({
        where: { schoolId: request.schoolId, duplicateOfEnquiryId: null, createdAt: { gte: since } },
        select: { createdAt: true },
      });
      for (const enquiry of enquiries) {
        const key = monthKey(enquiry.createdAt);
        if (key in newByPeriod) newByPeriod[key] += 1;
      }

      // First crossing into admitted/enrolled per enquiry only - an enquiry that
      // later moves admitted -> enrolled must not be counted as two conversions.
      const conversions = await prisma.enquiryStageHistory.findMany({
        where: {
          toStatus: { in: convertedKeys },
          changedAt: { gte: since },
          enquiry: { schoolId: request.schoolId, duplicateOfEnquiryId: null },
        },
        select: { enquiryId: true, changedAt: true },
        orderBy: { changedAt: "asc" },
      });
      const seenEnquiryIds = new Set<string>();
      for (const row of conversions) {
        if (seenEnquiryIds.has(row.enquiryId)) continue;
        seenEnquiryIds.add(row.enquiryId);
        const key = monthKey(row.changedAt);
        if (key in convertedByPeriod) convertedByPeriod[key] += 1;
      }

      return {
        data: {
          periods: periods.map((period) => ({
            period,
            newEnquiries: newByPeriod[period],
            converted: convertedByPeriod[period],
          })),
        },
        meta: {},
      };
    }
  );
}
