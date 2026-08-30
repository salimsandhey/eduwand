import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

type ActivityType = "generation" | "observation" | "assignment_published";

interface ActivityItem {
  type: ActivityType;
  id: string;
  topicId: string | null;
  label: string;
  timestamp: string;
}

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.getFullYear(), now.getMonth(), diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function teacherDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard/teacher-summary", { onRequest: scoped(app) }, async (request) => {
    const schoolId = request.schoolId;
    const teacherUserId = request.user.sub;
    const weekStart = startOfWeek();

    const [
      topicCount,
      topicsUpdatedThisWeek,
      continueTopic,
      assignmentCount,
      draftAssignmentCount,
      publishedAssignmentCount,
      ungradedSubmissionCount,
      recentGenerations,
      recentObservations,
      recentPublishedAssignments,
    ] = await Promise.all([
      prisma.topic.count({ where: { schoolId, teacherUserId, status: "active" } }),
      prisma.topic.count({ where: { schoolId, teacherUserId, status: "active", updatedAt: { gte: weekStart } } }),
      prisma.topic.findFirst({
        where: { schoolId, teacherUserId, status: "active" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, subject: true, classSectionId: true, updatedAt: true },
      }),
      prisma.assignment.count({ where: { schoolId, teacherUserId } }),
      prisma.assignment.count({ where: { schoolId, teacherUserId, status: "draft" } }),
      prisma.assignment.count({ where: { schoolId, teacherUserId, status: "published" } }),
      prisma.submission.count({ where: { assignment: { schoolId, teacherUserId }, grade: null } }),
      prisma.generation.findMany({
        where: { topic: { schoolId, teacherUserId } },
        orderBy: { generatedAt: "desc" },
        take: 3,
        select: { id: true, topicId: true, outputType: true, generatedAt: true, topic: { select: { name: true } } },
      }),
      prisma.observation.findMany({
        where: { topic: { schoolId, teacherUserId } },
        orderBy: { recordedAt: "desc" },
        take: 3,
        select: { id: true, topicId: true, body: true, recordedAt: true, topic: { select: { name: true } } },
      }),
      prisma.assignment.findMany({
        where: { schoolId, teacherUserId, status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: { id: true, title: true, publishedAt: true },
      }),
    ]);

    const recentActivity: ActivityItem[] = [
      ...recentGenerations.map((g) => ({
        type: "generation" as const,
        id: g.id,
        topicId: g.topicId,
        label: `${OUTPUT_TYPE_LABELS[g.outputType] ?? g.outputType} generated - ${g.topic.name}`,
        timestamp: g.generatedAt.toISOString(),
      })),
      ...recentObservations.map((o) => ({
        type: "observation" as const,
        id: o.id,
        topicId: o.topicId,
        label: `Observation added - ${o.topic.name}`,
        timestamp: o.recordedAt.toISOString(),
      })),
      ...recentPublishedAssignments.map((a) => ({
        type: "assignment_published" as const,
        id: a.id,
        topicId: null,
        label: `${a.title} published`,
        timestamp: (a.publishedAt ?? new Date()).toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    return {
      data: {
        topicCount,
        topicsUpdatedThisWeek,
        continueTopic,
        assignmentCount,
        draftAssignmentCount,
        publishedAssignmentCount,
        ungradedSubmissionCount,
        recentActivity,
      },
      meta: {},
    };
  });
}
