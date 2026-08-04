import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  app.register(fastifyJwt, { secret });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (request.user.type !== "access") {
        throw new Error("Not an access token");
      }
    } catch {
      reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Missing or invalid access token" },
      });
    }
  });
});
