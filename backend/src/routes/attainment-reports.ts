import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher", "leadership", "admin")];

// Attainment Report (Docs/Dev/AI_Module_Rebuild_Plan.md, Phase 4) - one per
// topic, auto-assembled from that topic's generations, observations, and
// grade results, no re-entry by the teacher. Generated on first request
// rather than a separate "create" endpoint, then cached in the
// attainment_report row (regenerated on every GET for now since the
// underlying data can keep changing until the topic is archived - a
// generated_at-based cache invalidation strategy is a follow-up, not built
// here to avoid guessing a staleness window the client hasn't specified).
export async function attainmentReportRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/topics/:id/attainment-report", { onRequest: scoped(app) }, async (request, reply) => {
    const topic = await prisma.topic.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: {
        generations: true,
        observations: { orderBy: { recordedAt: "asc" } },
        assignments: {
          include: { submissions: { include: { grade: true } } },
        },
      },
    });
    if (!topic) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }

    // Honest gap, per the client doc's own edge case: a topic generated but
    // never taught (no observations, no outcomes) shows that gap rather than
    // fabricating content.
    const whatWasDone =
      topic.generations.length > 0
        ? topic.generations.map((g) => `${g.outputType}: ${(g.editedOutput ?? g.aiOutput).slice(0, 200)}`).join("\n\n")
        : "No generations recorded for this topic yet.";

    const allGrades = topic.assignments.flatMap((a) => a.submissions.map((s) => s.grade).filter(Boolean));
    const gradedWithScore = allGrades.filter((g) => g!.finalScore != null || g!.aiScore != null);
    const outcomes =
      gradedWithScore.length > 0
        ? `${gradedWithScore.length} graded submission(s) across ${topic.assignments.length} assignment(s) on this topic.`
        : topic.assignments.length > 0
        ? "Assignments exist for this topic but none are graded yet."
        : "No assignment was ever set for this topic, so there are no attainment results to report.";

    const improvementNotes =
      topic.observations.length > 0
        ? topic.observations.map((o) => o.body).join(" | ")
        : "No teacher observations recorded for this topic.";

    const report = await prisma.attainmentReport.upsert({
      where: { topicId: topic.id },
      create: {
        topicId: topic.id,
        whatWasDone,
        outcomes,
        improvementNotes,
        bloomsTaxonomyMapping: Prisma.JsonNull,
      },
      update: { whatWasDone, outcomes, improvementNotes },
    });

    return { data: report, meta: {} };
  });

  // PDF export needs a PDF generation library - none is a dependency yet
  // (Docs/Dev/AI_Module_Rebuild_Plan.md Phase 4 flags this explicitly as an
  // open dependency decision). Not implemented here to avoid silently picking
  // one; returns 501 rather than a fake/broken PDF.
  app.get<{ Params: { id: string } }>("/topics/:id/attainment-report/pdf", { onRequest: scoped(app) }, async (_request, reply) => {
    return reply.code(501).send({
      data: null,
      error: { code: "not_implemented", message: "PDF export requires a PDF generation dependency decision - see AI_Module_Rebuild_Plan.md Phase 4" },
    });
  });

  app.get("/attainment-reports/roll-up", { onRequest: scoped(app) }, async (request, reply) => {
    const query = (request.query ?? {}) as { classSectionId?: string; subject?: string };
    if (!query.classSectionId || !query.subject) {
      return reply.code(400).send({ data: null, error: { code: "validation_error", message: "classSectionId and subject are required" } });
    }

    const topics = await prisma.topic.findMany({
      where: { schoolId: request.schoolId, classSectionId: query.classSectionId, subject: query.subject },
      include: { attainmentReport: true },
    });

    const reports = topics.map((t) => t.attainmentReport).filter(Boolean);
    return { data: reports, meta: { topicCount: topics.length, reportCount: reports.length } };
  });
}
