import Fastify from "fastify";
import { healthRoutes } from "./routes/health";

const app = Fastify({ logger: true });

app.register(healthRoutes, { prefix: "/api/v1" });

const port = Number(process.env.PORT) || 4000;

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
