import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher", "leadership", "admin")];

export async function attainmentReportRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/topics/:id/attainment-report", { onRequest: scoped(app) }, async (request, reply) => {
    const topic = await prisma.topic.findFirst({
      where: { id: request.params.id, schoolId: request.schoolId },
      include: {
        generations: true,
        observations: { orderBy: { recordedAt: "asc" } },
        classSection: {
          select: {
            className: true,
            sectionName: true,
            studentStubs: { select: { id: true } },
          },
        },
        assignments: {
          include: { submissions: { include: { grade: true } } },
        },
      },
    });
    if (!topic) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Topic not found" } });
    }

    const whatWasDone =
      topic.generations.length > 0
        ? topic.generations.map((g) => `${g.outputType}: ${(g.editedOutput ?? g.aiOutput).slice(0, 200)}`).join("\n\n")
        : "No generations recorded for this topic yet.";

    const allGrades = topic.assignments.flatMap((a) => a.submissions.map((s) => s.grade).filter(Boolean));
    const gradedWithScore = allGrades.filter((g) => g!.finalScore != null || g!.aiScore != null);
    const scores = gradedWithScore.map((grade) => grade!.finalScore ?? grade!.aiScore ?? 0);
    const averageScore = scores.length > 0 ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
    const scoreBands = {
      above80: scores.filter((score) => score >= 80).length,
      between60And80: scores.filter((score) => score >= 60 && score < 80).length,
      below60: scores.filter((score) => score < 60).length,
    };
    const assignmentAttainment = topic.assignments
      .map((assignment) => {
        const assignmentScores = assignment.submissions
          .map((submission) => submission.grade?.finalScore ?? submission.grade?.aiScore)
          .filter((score): score is number => score != null);
        return {
          assignmentId: assignment.id,
          title: assignment.title,
          averageScore: assignmentScores.length > 0 ? assignmentScores.reduce((total, score) => total + score, 0) / assignmentScores.length : null,
        };
      })
      .filter((assignment) => assignment.averageScore !== null);
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

    return {
      data: {
        ...report,
        topicName: topic.name,
        subject: topic.subject,
        board: topic.board,
        className: topic.classSection.className,
        sectionName: topic.classSection.sectionName,
        studentCount: topic.classSection.studentStubs.length,
        gradedSubmissionCount: scores.length,
        averageScore,
        scoreBands,
        assignmentAttainment,
      },
      meta: {},
    };
  });

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
