import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { authPlugin } from "./plugins/auth";
import { scopePlugin } from "./plugins/scope";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { enquiryRoutes } from "./routes/enquiries";
import { messageTemplateRoutes } from "./routes/message-templates";
import { followUpTaskRoutes } from "./routes/follow-up-tasks";
import { studentRoutes } from "./routes/students";
import { exportRoutes } from "./routes/exports";
import { analyticsRoutes } from "./routes/analytics";
import { publicEnquiryRoutes } from "./routes/public-enquiries";

const app = Fastify({ logger: true });

app.register(rateLimit, { global: true, max: 1000, timeWindow: "1 minute" });
app.register(authPlugin);
app.register(scopePlugin);
app.register(healthRoutes, { prefix: "/api/v1" });
app.register(authRoutes, { prefix: "/api/v1" });
app.register(enquiryRoutes, { prefix: "/api/v1" });
app.register(messageTemplateRoutes, { prefix: "/api/v1" });
app.register(followUpTaskRoutes, { prefix: "/api/v1" });
app.register(studentRoutes, { prefix: "/api/v1" });
app.register(exportRoutes, { prefix: "/api/v1" });
app.register(analyticsRoutes, { prefix: "/api/v1" });
app.register(publicEnquiryRoutes, { prefix: "/api/v1" });

const port = Number(process.env.PORT) || 4000;

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
