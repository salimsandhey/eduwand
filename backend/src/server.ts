import Fastify from "fastify";
import { authPlugin } from "./plugins/auth";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";

const app = Fastify({ logger: true });

app.register(authPlugin);
app.register(healthRoutes, { prefix: "/api/v1" });
app.register(authRoutes, { prefix: "/api/v1" });

const port = Number(process.env.PORT) || 4000;

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
