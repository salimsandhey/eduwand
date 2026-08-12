import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { sendFollowUpTask, FollowUpSendError } from "../lib/follow-up";

const VALID_CHANNELS = ["sms", "email"];
const VALID_STATUSES = ["pending", "sent", "failed", "cancelled"];

interface CreateTaskBody {
  enquiryId: string;
  assignedToUserId?: string;
  dueAt: string;
  channel: string;
  templateId: string;
}

interface ListQuery {
  assignedToUserId?: string;
  status?: string;
}

interface UpdateTaskBody {
  dueAt?: string;
  status?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

export async function followUpTaskRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/follow-up-tasks",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { assignedToUserId, status } = request.query;

      if (status && !VALID_STATUSES.includes(status)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `status must be one of ${VALID_STATUSES.join(", ")}` },
        });
      }

      const tasks = await prisma.followUpTask.findMany({
        where: {
          enquiry: { schoolId: request.schoolId },
          ...(assignedToUserId ? { assignedToUserId } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: { dueAt: "asc" },
        include: { enquiry: { select: { id: true, contactName: true, contactPhone: true, contactEmail: true } } },
      });

      return { data: tasks, meta: {} };
    }
  );

  app.post<{ Body: CreateTaskBody }>(
    "/follow-up-tasks",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateTaskBody);

      if (!body.enquiryId || !body.dueAt || !body.channel || !body.templateId) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "enquiryId, dueAt, channel, and templateId are required" },
        });
      }

      if (!VALID_CHANNELS.includes(body.channel)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `channel must be one of ${VALID_CHANNELS.join(", ")}` },
        });
      }

      const [enquiry, template] = await Promise.all([
        prisma.enquiry.findFirst({ where: { id: body.enquiryId, schoolId: request.schoolId } }),
        prisma.messageTemplate.findFirst({ where: { id: body.templateId, schoolId: request.schoolId } }),
      ]);

      if (!enquiry) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Enquiry not found" } });
      }
      if (!template) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Message template not found" } });
      }
      if (template.channel !== body.channel) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "templateId does not match the given channel" },
        });
      }

      const task = await prisma.followUpTask.create({
        data: {
          enquiryId: enquiry.id,
          assignedToUserId: body.assignedToUserId ?? request.user.sub,
          dueAt: new Date(body.dueAt),
          channel: body.channel,
          templateId: template.id,
          status: "pending",
        },
      });

      return reply.code(201).send({ data: task, meta: {} });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/follow-up-tasks/:id/send",
    { onRequest: scoped(app) },
    async (request, reply) => {
      // school-scope check happens here (never inside the shared function,
      // since the worker calls it directly for due tasks across every school).
      const task = await prisma.followUpTask.findFirst({
        where: { id: request.params.id, enquiry: { schoolId: request.schoolId } },
        select: { id: true },
      });
      if (!task) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Follow up task not found" } });
      }

      try {
        const { task: updated, renderedBody } = await sendFollowUpTask(task.id);
        return { data: updated, meta: { renderedBody } };
      } catch (err) {
        if (err instanceof FollowUpSendError) {
          const statusCode = err.code === "not_found" ? 404 : err.code === "consent_required" ? 403 : 400;
          return reply.code(statusCode).send({ data: null, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  // Supports the Follow Up Task List screen's "reschedule" and "mark complete" actions
  // (Docs/Dev/EduWand_UI_Screen_Spec.md section 3). Not in the original API spec table,
  // added because the UI needs a way to change a pending task's due date or close it out
  // without sending. Only pending tasks can be rescheduled or cancelled.
  app.patch<{ Params: { id: string }; Body: UpdateTaskBody }>(
    "/follow-up-tasks/:id",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const task = await prisma.followUpTask.findFirst({
        where: { id: request.params.id, enquiry: { schoolId: request.schoolId } },
      });

      if (!task) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Follow up task not found" } });
      }

      if (task.status !== "pending") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `Task is already ${task.status}, only pending tasks can be changed` },
        });
      }

      const body = request.body ?? {};

      if (body.status && body.status !== "cancelled") {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "status can only be set to cancelled via this endpoint" },
        });
      }

      const updated = await prisma.followUpTask.update({
        where: { id: task.id },
        data: {
          dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
          status: body.status,
        },
      });

      return { data: updated, meta: {} };
    }
  );
}
