import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AssistantRole, resolveAssistantRole } from "../lib/assistant-context";
import { ASSISTANT_NAME, runAssistantTurn } from "../lib/assistant-engine";
import { AssistantLink, ToolCtx, ToolError, findWriteTool } from "../lib/assistant-tools";

const HISTORY_LIMIT = 20;
const LIST_LIMIT = 100;
const MAX_TEXT = 2000;
const FALLBACK_REPLY = `Sorry, ${ASSISTANT_NAME} couldn't respond right now - please try again.`;

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope];

type MessageRow = Prisma.AiMessageGetPayload<{ include: { action: true } }>;

function serialize(message: MessageRow) {
  return {
    id: message.id,
    from: message.from,
    text: message.text,
    links: (message.links as AssistantLink[] | null) ?? [],
    createdAt: message.createdAt,
    action: message.action
      ? {
          id: message.action.id,
          summary: message.action.summary,
          status: message.action.status,
          resultText: message.action.resultText,
          resultLink: (message.action.resultLink as AssistantLink | null) ?? null,
        }
      : null,
  };
}

const forbidden = {
  data: null,
  error: { code: "forbidden", message: `${ASSISTANT_NAME} is available to teachers, students, counsellors and front desk in the mobile app.` },
};

export async function aiAssistantRoutes(app: FastifyInstance) {
  // Students authenticate as a StudentStub (JWT sub = StudentStub.id), staff as
  // an AppUser - AiConversation.userId holds whichever it is (no FK on purpose).
  function contextFor(request: { user: ToolCtx["user"]; schoolId: string; headers: { authorization?: string } }, role: AssistantRole): ToolCtx {
    return { app, user: request.user, schoolId: request.schoolId, authorization: request.headers.authorization ?? "", role };
  }

  async function getConversation(userId: string, schoolId: string) {
    return prisma.aiConversation.upsert({ where: { userId }, update: {}, create: { userId, schoolId } });
  }

  app.get("/ai-assistant/messages", { onRequest: scoped(app) }, async (request, reply) => {
    if (!resolveAssistantRole(request.user)) return reply.code(403).send(forbidden);
    const conversation = await getConversation(request.user.sub, request.schoolId);
    const rows = await prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      include: { action: true },
    });
    return { data: rows.reverse().map(serialize), meta: {} };
  });

  app.post<{ Body: { text?: string } }>(
    "/ai-assistant/messages",
    { onRequest: scoped(app), config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const role = resolveAssistantRole(request.user);
      if (!role) return reply.code(403).send(forbidden);

      const text = request.body?.text?.trim();
      if (!text) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: "text is required" } });
      }
      if (text.length > MAX_TEXT) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: `text must be at most ${MAX_TEXT} characters` } });
      }

      const conversation = await getConversation(request.user.sub, request.schoolId);
      const userMessage = await prisma.aiMessage.create({
        data: { conversationId: conversation.id, from: "user", text },
        include: { action: true },
      });

      const recent = await prisma.aiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        include: { action: true },
      });
      // A confirm card is told to the model as what it was and how it ended, so
      // "did that go through?" and follow-ups have the right facts.
      const history = recent.reverse().map((m) => ({
        from: m.from,
        text: m.action
          ? `[Proposed change - ${m.action.status}${m.action.resultText ? `: ${m.action.resultText}` : ""}] ${m.action.summary}`
          : m.text,
      }));

      let replies: MessageRow[];
      try {
        const turn = await runAssistantTurn({ ctx: contextFor(request, role), conversationId: conversation.id, history });
        const reply1 = await prisma.aiMessage.create({
          data: { conversationId: conversation.id, from: "assistant", text: turn.text, ...(turn.links.length ? { links: turn.links as unknown as Prisma.InputJsonValue } : {}) },
          include: { action: true },
        });
        // One confirm card per proposed change, each its own message.
        const cards: MessageRow[] = [];
        for (const actionId of turn.actionIds) {
          const action = await prisma.aiAction.findUniqueOrThrow({ where: { id: actionId } });
          cards.push(
            await prisma.aiMessage.create({
              data: { conversationId: conversation.id, from: "assistant", text: action.summary, actionId },
              include: { action: true },
            })
          );
        }
        replies = [reply1, ...cards];
      } catch (err) {
        request.log.error({ err }, "assistant turn failed");
        replies = [
          await prisma.aiMessage.create({
            data: { conversationId: conversation.id, from: "assistant", text: FALLBACK_REPLY },
            include: { action: true },
          }),
        ];
      }

      return reply.code(201).send({ data: { userMessage: serialize(userMessage), replies: replies.map(serialize) }, meta: {} });
    }
  );

  app.post<{ Params: { id: string } }>("/ai-assistant/actions/:id/confirm", { onRequest: scoped(app) }, async (request, reply) => {
    const role = resolveAssistantRole(request.user);
    if (!role) return reply.code(403).send(forbidden);

    const action = await prisma.aiAction.findFirst({
      where: { id: request.params.id, conversation: { userId: request.user.sub } },
    });
    if (!action) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Action not found" } });

    // Claim it atomically so a double-tap can't run the change twice.
    const claimed = await prisma.aiAction.updateMany({ where: { id: action.id, status: "pending" }, data: { status: "confirmed" } });
    if (claimed.count !== 1) {
      return reply.code(409).send({ data: null, error: { code: "conflict", message: "This action was already handled" } });
    }

    const tool = findWriteTool(role, action.tool);
    let status = "confirmed";
    let resultText: string;
    let resultLink: AssistantLink | undefined;
    try {
      if (!tool) throw new ToolError("This action isn't available for your role.");
      const ctx = contextFor(request, role);
      // Re-validate against current data - the lead/task may have changed since it was proposed.
      const prepared = await tool.prepare(action.args as Record<string, unknown>, ctx);
      const result = await tool.execute(prepared.args, ctx);
      resultText = result.text;
      resultLink = result.link;
    } catch (err) {
      status = "failed";
      resultText = err instanceof ToolError ? err.message : "Something went wrong - nothing was changed.";
      if (!(err instanceof ToolError)) request.log.error({ err }, "assistant action failed");
    }

    const updated = await prisma.aiAction.update({
      where: { id: action.id },
      data: { status, resultText, resultLink: resultLink ? (resultLink as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
    });
    return { data: { id: updated.id, status: updated.status, resultText: updated.resultText, resultLink: resultLink ?? null }, meta: {} };
  });

  app.post<{ Params: { id: string } }>("/ai-assistant/actions/:id/cancel", { onRequest: scoped(app) }, async (request, reply) => {
    if (!resolveAssistantRole(request.user)) return reply.code(403).send(forbidden);
    const result = await prisma.aiAction.updateMany({
      where: { id: request.params.id, status: "pending", conversation: { userId: request.user.sub } },
      data: { status: "cancelled", resultText: "Cancelled" },
    });
    if (result.count !== 1) {
      return reply.code(409).send({ data: null, error: { code: "conflict", message: "This action was already handled or does not exist" } });
    }
    return { data: { id: request.params.id, status: "cancelled" }, meta: {} };
  });

  // "New chat": wipes the user's own rolling conversation.
  app.delete("/ai-assistant/messages", { onRequest: scoped(app) }, async (request, reply) => {
    if (!resolveAssistantRole(request.user)) return reply.code(403).send(forbidden);
    const conversation = await prisma.aiConversation.findUnique({ where: { userId: request.user.sub } });
    if (conversation) {
      // Messages point at actions, so they go first.
      await prisma.$transaction([
        prisma.aiMessage.deleteMany({ where: { conversationId: conversation.id } }),
        prisma.aiAction.deleteMany({ where: { conversationId: conversation.id } }),
      ]);
    }
    return { data: { cleared: true }, meta: {} };
  });
}
