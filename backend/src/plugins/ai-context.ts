import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { aiRequestContext } from "../lib/llm/context";
import { AiLimitError, PlanExpiredError } from "../lib/llm/errors";

// Runs every request handler inside an AI request context so the spend guard
// knows which user a call is for, and turns a guard refusal that reaches the
// top into a clean 503 instead of a generic 500.
export const aiContextPlugin = fp(async (app: FastifyInstance) => {
  // preHandler runs after each route's own authenticate hook, so request.user
  // is already populated for authenticated routes.
  app.addHook("preHandler", (request, _reply, done) => {
    const user = (request as { user?: { sub?: string } }).user;
    aiRequestContext.run({ userId: user?.sub, schoolId: (request as { schoolId?: string }).schoolId, callLogIds: [] }, done);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof PlanExpiredError) {
      return reply.code(402).send({ data: null, error: { code: "plan_expired", message: error.message } });
    }
    if (error instanceof AiLimitError) {
      request.log.warn({ reason: error.reason, limit: error.limitKey }, "AI call refused by spend guard");
      return reply.code(503).send({ data: null, error: { code: "ai_unavailable", message: error.message } });
    }
    return reply.send(error);
  });
});
