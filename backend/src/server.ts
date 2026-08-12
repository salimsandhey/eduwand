import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { authPlugin } from "./plugins/auth";
import { scopePlugin } from "./plugins/scope";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { studentAuthRoutes } from "./routes/student-auth";
import { studentPortalRoutes } from "./routes/student-portal";
import { enquiryRoutes } from "./routes/enquiries";
import { messageTemplateRoutes } from "./routes/message-templates";
import { followUpTaskRoutes } from "./routes/follow-up-tasks";
import { studentRoutes } from "./routes/students";
import { exportRoutes } from "./routes/exports";
import { analyticsRoutes } from "./routes/analytics";
import { publicEnquiryRoutes } from "./routes/public-enquiries";
import { classSectionRoutes } from "./routes/class-sections";
import { academicStructureRoutes } from "./routes/academic-structure";
import { userRoutes } from "./routes/users";
import { trustRoutes } from "./routes/trusts";
import { schoolRoutes } from "./routes/schools";
import { pipelineStageRoutes } from "./routes/pipeline-stages";
import { documentRoutes } from "./routes/documents";
import { lessonStudioRoutes } from "./routes/lesson-studio";
import { assignmentRoutes } from "./routes/assignments";
import { submissionRoutes } from "./routes/submissions";
import { aiAnalyticsRoutes } from "./routes/ai-analytics";
import { auditLogRoutes } from "./routes/audit-log";

const app = Fastify({ logger: true });

// Dev-only: reflects any origin so the local Expo web/admin dashboard dev servers can
// call the API regardless of port. Lock this down to real origins before production.
app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] });
app.register(rateLimit, { global: true, max: 1000, timeWindow: "1 minute" });
app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB per admission document (FR-EG-6)
app.register(authPlugin);
app.register(scopePlugin);
app.register(healthRoutes, { prefix: "/api/v1" });
app.register(authRoutes, { prefix: "/api/v1" });
app.register(studentAuthRoutes, { prefix: "/api/v1" });
app.register(studentPortalRoutes, { prefix: "/api/v1" });
app.register(enquiryRoutes, { prefix: "/api/v1" });
app.register(messageTemplateRoutes, { prefix: "/api/v1" });
app.register(followUpTaskRoutes, { prefix: "/api/v1" });
app.register(studentRoutes, { prefix: "/api/v1" });
app.register(exportRoutes, { prefix: "/api/v1" });
app.register(analyticsRoutes, { prefix: "/api/v1" });
app.register(publicEnquiryRoutes, { prefix: "/api/v1" });
app.register(classSectionRoutes, { prefix: "/api/v1" });
app.register(academicStructureRoutes, { prefix: "/api/v1" });
app.register(userRoutes, { prefix: "/api/v1" });
app.register(trustRoutes, { prefix: "/api/v1" });
app.register(schoolRoutes, { prefix: "/api/v1" });
app.register(pipelineStageRoutes, { prefix: "/api/v1" });
app.register(documentRoutes, { prefix: "/api/v1" });
app.register(lessonStudioRoutes, { prefix: "/api/v1" });
app.register(assignmentRoutes, { prefix: "/api/v1" });
app.register(submissionRoutes, { prefix: "/api/v1" });
app.register(aiAnalyticsRoutes, { prefix: "/api/v1" });
app.register(auditLogRoutes, { prefix: "/api/v1" });

const port = Number(process.env.PORT) || 4000;

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
