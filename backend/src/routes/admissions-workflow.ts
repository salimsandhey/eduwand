import { Prisma } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { hasAnyRole, requireRoles } from "../lib/rbac";

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];
const ADMIN_ROLES = ["admin", "principal"];

export async function admissionsWorkflowRoutes(app: FastifyInstance) {
  app.get("/fee-plans", { onRequest: scoped(app) }, async (request) => {
    const plans = await prisma.feePlan.findMany({ where: { schoolId: request.schoolId, isActive: true }, orderBy: { name: "asc" } });
    return { data: plans, meta: {} };
  });

  app.post<{ Body: { academicYearId: string; name: string; amount: number; frequency: string } }>(
    "/fee-plans",
    { onRequest: [...scoped(app), requireRoles(...ADMIN_ROLES)] },
    async (request, reply) => {
      const body = request.body ?? ({} as { academicYearId: string; name: string; amount: number; frequency: string });
      if (!body.academicYearId || !body.name || !Number.isFinite(body.amount) || !["one_time", "annual", "term"].includes(body.frequency)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "academicYearId, name, amount, and a valid frequency are required" } });
      }
      const year = await prisma.academicYear.findFirst({ where: { id: body.academicYearId, schoolId: request.schoolId } });
      if (!year) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Academic year not found" } });
      const plan = await prisma.feePlan.create({ data: { schoolId: request.schoolId, academicYearId: year.id, name: body.name.trim(), amount: body.amount, frequency: body.frequency } });
      return reply.code(201).send({ data: plan, meta: {} });
    }
  );

  app.get<{ Params: { id: string } }>("/enquiries/:id/interviews", { onRequest: scoped(app) }, async (request, reply) => {
    const enquiry = await prisma.enquiry.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
    if (!enquiry) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
    const records = await prisma.interviewRecord.findMany({ where: { enquiryId: enquiry.id }, include: { conductedBy: { select: { fullName: true } } }, orderBy: { interviewDate: "desc" } });
    return { data: records, meta: {} };
  });

  app.post<{ Params: { id: string }; Body: { interviewDate: string; score?: number; maxScore?: number; notes: string } }>(
    "/enquiries/:id/interviews",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as { interviewDate: string; score?: number; maxScore?: number; notes: string });
      if (!body.interviewDate || !body.notes?.trim() || (body.score != null && body.maxScore != null && body.score > body.maxScore)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "interviewDate, notes, and valid scores are required" } });
      }
      const enquiry = await prisma.enquiry.findFirst({ where: { id: request.params.id, schoolId: request.schoolId } });
      if (!enquiry) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      const record = await prisma.interviewRecord.create({ data: { enquiryId: enquiry.id, conductedByUserId: request.user.sub, interviewDate: new Date(body.interviewDate), score: body.score, maxScore: body.maxScore, notes: body.notes.trim() } });
      return reply.code(201).send({ data: record, meta: {} });
    }
  );

  app.get("/approval-chain", { onRequest: scoped(app) }, async (request) => ({ data: await prisma.approvalChainStep.findMany({ where: { schoolId: request.schoolId }, orderBy: { order: "asc" } }), meta: {} }));

  app.patch<{ Body: { steps: { order: number; requiredRole: string }[] } }>(
    "/approval-chain",
    { onRequest: [...scoped(app), requireRoles(...ADMIN_ROLES)] },
    async (request, reply) => {
      const steps = request.body?.steps;
      if (!Array.isArray(steps) || steps.length === 0 || steps.some((step, index) => step.order !== index + 1 || !step.requiredRole)) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "steps must be a non-empty sequential role list" } });
      }
      const data = await prisma.$transaction(async (tx) => {
        await tx.approvalChainStep.deleteMany({ where: { schoolId: request.schoolId } });
        await tx.approvalChainStep.createMany({ data: steps.map((step) => ({ schoolId: request.schoolId, order: step.order, requiredRole: step.requiredRole })) });
        return tx.approvalChainStep.findMany({ where: { schoolId: request.schoolId }, orderBy: { order: "asc" } });
      });
      return { data, meta: {} };
    }
  );

  app.post<{ Params: { id: string }; Body: { decision: string; comment?: string } }>(
    "/enquiries/:id/approvals",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as { decision: string; comment?: string });
      if (!["approved", "rejected"].includes(body.decision)) return reply.code(400).send({ data: null, error: { code: "validation_error", message: "decision must be approved or rejected" } });
      const enquiry = await prisma.enquiry.findFirst({ where: { id: request.params.id, schoolId: request.schoolId }, include: { approvals: { orderBy: { stepOrder: "asc" } } } });
      if (!enquiry) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      if (enquiry.status !== "application") return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Approvals are available only at Application" } });
      if (enquiry.approvals.some((approval) => approval.decision === "rejected")) return reply.code(400).send({ data: null, error: { code: "validation_error", message: "This application has already been rejected" } });
      const snapshot = (enquiry.approvalChainSnapshot as { steps?: { order: number; requiredRole: string }[] } | null)?.steps ?? (await prisma.approvalChainStep.findMany({ where: { schoolId: request.schoolId }, orderBy: { order: "asc" }, select: { order: true, requiredRole: true } }));
      const nextStep = snapshot[enquiry.approvals.length];
      if (!nextStep) return reply.code(400).send({ data: null, error: { code: "validation_error", message: "Approval chain is already complete" } });
      if (!(await hasAnyRole(request.user, nextStep.requiredRole))) return reply.code(403).send({ data: null, error: { code: "forbidden", message: `Requires role: ${nextStep.requiredRole}` } });
      const finalApproval = enquiry.approvals.length + 1 === snapshot.length && body.decision === "approved";
      const result = await prisma.$transaction(async (tx) => {
        const approval = await tx.enquiryApproval.create({ data: { enquiryId: enquiry.id, stepOrder: nextStep.order, approvedByUserId: request.user.sub, decision: body.decision, comment: body.comment?.trim() || null } });
        if (!enquiry.approvalChainSnapshot) await tx.enquiry.update({ where: { id: enquiry.id }, data: { approvalChainSnapshot: { steps: snapshot } as Prisma.InputJsonValue } });
        if (finalApproval) {
          await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: "admitted" } });
          await tx.enquiryStageHistory.create({ data: { enquiryId: enquiry.id, fromStatus: "application", toStatus: "admitted", changedByUserId: request.user.sub } });
        }
        return approval;
      });
      return { data: result, meta: { admitted: finalApproval } };
    }
  );
}
