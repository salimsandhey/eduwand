import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";

interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
  schoolId?: string;
  academicYearId?: string;
}

interface TrendQuery {
  months?: string;
  schoolId?: string;
  academicYearId?: string;
}

const analyticsGuard = (app: FastifyInstance) => [
  app.authenticate,
  app.requireSchoolScope,
  requireRoles("admin", "principal", "leadership", "counsellor", "front_desk", PLATFORM_ADMIN_ROLE),
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

function academicYearFilter(academicYearId?: string) {
  return academicYearId ? { academicYearId } : {};
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthBuckets(months: number): string[] {
  const now = new Date();
  const buckets: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    buckets.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return buckets;
}

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
        ...academicYearFilter(request.query.academicYearId),
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
        ...academicYearFilter(request.query.academicYearId),
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
        ...academicYearFilter(request.query.academicYearId),
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
        where: {
          schoolId: request.schoolId,
          duplicateOfEnquiryId: null,
          ...academicYearFilter(request.query.academicYearId),
          createdAt: { gte: since },
        },
        select: { createdAt: true },
      });
      for (const enquiry of enquiries) {
        const key = monthKey(enquiry.createdAt);
        if (key in newByPeriod) newByPeriod[key] += 1;
      }

      const conversions = await prisma.enquiryStageHistory.findMany({
        where: {
          toStatus: { in: convertedKeys },
          changedAt: { gte: since },
          enquiry: { schoolId: request.schoolId, duplicateOfEnquiryId: null, ...academicYearFilter(request.query.academicYearId) },
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

  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/stage-velocity",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const stages = await getStages(request.schoolId);

      const enquiries = await prisma.enquiry.findMany({
        where: {
          schoolId: request.schoolId,
          duplicateOfEnquiryId: null,
          ...academicYearFilter(request.query.academicYearId),
          ...dateRangeFilter(request.query),
        },
        select: { id: true, createdAt: true },
      });
      const createdAtByEnquiry = new Map(enquiries.map((e) => [e.id, e.createdAt]));

      const history = await prisma.enquiryStageHistory.findMany({
        where: { enquiryId: { in: enquiries.map((e) => e.id) } },
        orderBy: [{ enquiryId: "asc" }, { changedAt: "asc" }],
        select: { enquiryId: true, fromStatus: true, changedAt: true },
      });

      const durationByStage = new Map<string, { totalMs: number; count: number }>();
      let previousEnquiryId: string | null = null;
      let previousAt: Date | null = null;

      for (const row of history) {
        if (row.enquiryId !== previousEnquiryId) {
          previousAt = createdAtByEnquiry.get(row.enquiryId) ?? null;
          previousEnquiryId = row.enquiryId;
        }
        if (previousAt && row.fromStatus) {
          const durationMs = row.changedAt.getTime() - previousAt.getTime();
          const bucket = durationByStage.get(row.fromStatus) ?? { totalMs: 0, count: 0 };
          bucket.totalMs += durationMs;
          bucket.count += 1;
          durationByStage.set(row.fromStatus, bucket);
        }
        previousAt = row.changedAt;
      }

      const data = stages.map((stage) => {
        const bucket = durationByStage.get(stage.key);
        return {
          stageKey: stage.key,
          stageLabel: stage.label,
          avgDays: bucket && bucket.count > 0 ? Math.round((bucket.totalMs / bucket.count / 86400000) * 10) / 10 : null,
          sampleCount: bucket?.count ?? 0,
        };
      });

      return { data, meta: {} };
    }
  );

  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/lost-reasons",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        lostReason: { not: null },
        ...academicYearFilter(request.query.academicYearId),
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { lostReason: true } });

      const byReason: Record<string, number> = {};
      for (const enquiry of enquiries) {
        const reason = enquiry.lostReason ?? "Unspecified";
        byReason[reason] = (byReason[reason] ?? 0) + 1;
      }

      return { data: { byReason, totalCount: enquiries.length }, meta: {} };
    }
  );

  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/task-outcomes",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const tasks = await prisma.followUpTask.findMany({
        where: {
          enquiry: { schoolId: request.schoolId, duplicateOfEnquiryId: null, ...academicYearFilter(request.query.academicYearId) },
          ...dateRangeFilter(request.query),
        },
        select: { status: true, channel: true },
      });

      const byStatus: Record<string, number> = {};
      const byChannel: Record<string, { total: number; sent: number }> = {};
      for (const task of tasks) {
        byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
        const channelStats = byChannel[task.channel] ?? { total: 0, sent: 0 };
        channelStats.total += 1;
        if (task.status === "sent") channelStats.sent += 1;
        byChannel[task.channel] = channelStats;
      }

      const channelEffectiveness = Object.entries(byChannel).map(([channel, stats]) => ({
        channel,
        total: stats.total,
        sent: stats.sent,
        sentRate: stats.total === 0 ? 0 : stats.sent / stats.total,
      }));

      return { data: { byStatus, channelEffectiveness, totalCount: tasks.length }, meta: {} };
    }
  );

  app.get<{ Querystring: DateRangeQuery }>(
    "/analytics/enrolment/grade-demand",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const where = {
        schoolId: request.schoolId,
        duplicateOfEnquiryId: null,
        ...academicYearFilter(request.query.academicYearId),
        ...dateRangeFilter(request.query),
      };

      const enquiries = await prisma.enquiry.findMany({ where, select: { gradeInterest: true } });

      const byGrade: Record<string, number> = {};
      for (const enquiry of enquiries) {
        const grade = enquiry.gradeInterest ?? "Not specified";
        byGrade[grade] = (byGrade[grade] ?? 0) + 1;
      }

      return { data: { byGrade, totalCount: enquiries.length }, meta: {} };
    }
  );

  app.get(
    "/analytics/enrolment/yearly-trend",
    { onRequest: analyticsGuard(app) },
    async (request) => {
      const stages = await getStages(request.schoolId);
      const convertedKeys = stages.filter((s) => s.isConverted).map((s) => s.key);

      const enquiries = await prisma.enquiry.findMany({
        where: { schoolId: request.schoolId, duplicateOfEnquiryId: null },
        select: { createdAt: true },
      });
      const newByYear: Record<string, number> = {};
      for (const enquiry of enquiries) {
        const year = String(enquiry.createdAt.getUTCFullYear());
        newByYear[year] = (newByYear[year] ?? 0) + 1;
      }

      const conversions = await prisma.enquiryStageHistory.findMany({
        where: {
          toStatus: { in: convertedKeys },
          enquiry: { schoolId: request.schoolId, duplicateOfEnquiryId: null },
        },
        select: { enquiryId: true, changedAt: true },
        orderBy: { changedAt: "asc" },
      });
      const convertedByYear: Record<string, number> = {};
      const seenEnquiryIds = new Set<string>();
      for (const row of conversions) {
        if (seenEnquiryIds.has(row.enquiryId)) continue;
        seenEnquiryIds.add(row.enquiryId);
        const year = String(row.changedAt.getUTCFullYear());
        convertedByYear[year] = (convertedByYear[year] ?? 0) + 1;
      }

      const years = [...new Set([...Object.keys(newByYear), ...Object.keys(convertedByYear)])].sort();

      return {
        data: {
          years: years.map((year) => ({
            year,
            newEnquiries: newByYear[year] ?? 0,
            converted: convertedByYear[year] ?? 0,
          })),
        },
        meta: {},
      };
    }
  );
}
