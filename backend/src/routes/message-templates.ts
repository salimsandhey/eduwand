import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

const VALID_CHANNELS = ["sms", "email"];

interface CreateTemplateBody {
  channel: string;
  name: string;
  body: string;
  language?: string;
}

interface ListQuery {
  channel?: string;
}

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

export async function messageTemplateRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    "/message-templates",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const { channel } = request.query;

      if (channel && !VALID_CHANNELS.includes(channel)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `channel must be one of ${VALID_CHANNELS.join(", ")}` },
        });
      }

      const templates = await prisma.messageTemplate.findMany({
        where: { schoolId: request.schoolId, ...(channel ? { channel } : {}) },
        orderBy: { createdAt: "desc" },
      });

      return { data: templates, meta: {} };
    }
  );

  app.post<{ Body: CreateTemplateBody }>(
    "/message-templates",
    { onRequest: scoped(app) },
    async (request, reply) => {
      const body = request.body ?? ({} as CreateTemplateBody);

      if (!body.channel || !body.name || !body.body) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: "channel, name, and body are required" },
        });
      }

      if (!VALID_CHANNELS.includes(body.channel)) {
        return reply.code(400).send({
          data: null,
          error: { code: "validation_error", message: `channel must be one of ${VALID_CHANNELS.join(", ")}` },
        });
      }

      const template = await prisma.messageTemplate.create({
        data: {
          schoolId: request.schoolId,
          channel: body.channel,
          name: body.name,
          body: body.body,
          language: body.language ?? "English",
        },
      });

      return reply.code(201).send({ data: template, meta: {} });
    }
  );
}
