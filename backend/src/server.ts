import "dotenv/config";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { authPlugin } from "./plugins/auth";
import { scopePlugin } from "./plugins/scope";
import { aiContextPlugin } from "./plugins/ai-context";
import { securityPlugin, redactUrl } from "./plugins/security";
import { isDevOtpMode } from "./lib/otp";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { authMeRoutes } from "./routes/auth-me";
import { authSignupRoutes } from "./routes/auth-signup";
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
import { subjectRoutes } from "./routes/subjects";
import { academicStructureRoutes } from "./routes/academic-structure";
import { schoolFormatTemplateRoutes } from "./routes/school-format-templates";
import { userRoutes } from "./routes/users";
import { trustRoutes } from "./routes/trusts";
import { schoolRoutes } from "./routes/schools";
import { pipelineStageRoutes } from "./routes/pipeline-stages";
import { formDefinitionRoutes } from "./routes/form-definitions";
import { documentRoutes } from "./routes/documents";
import { enquiryPhotoRoutes } from "./routes/enquiry-photo";
import { lessonStudioRoutes } from "./routes/lesson-studio";
import { topicRoutes } from "./routes/topics";
import { generationRoutes } from "./routes/generations";
import { communicationRoutes } from "./routes/communications";
import { attainmentReportRoutes } from "./routes/attainment-reports";
import { assignmentRoutes } from "./routes/assignments";
import { teacherDashboardRoutes } from "./routes/teacher-dashboard";
import { submissionRoutes } from "./routes/submissions";
import { assessmentRoutes } from "./routes/assessments";
import { aiAnalyticsRoutes } from "./routes/ai-analytics";
import { auditLogRoutes } from "./routes/audit-log";
import { aiPromptRoutes } from "./routes/ai-prompts";
import { admissionsWorkflowRoutes } from "./routes/admissions-workflow";
import { subjectChangeRequestRoutes } from "./routes/subject-change-requests";
import { boardChangeTicketRoutes } from "./routes/board-change-tickets";
import { platformSettingRoutes } from "./routes/platform-settings";
import { teacherCreditRoutes } from "./routes/teacher-credits";
import { teacherOnboardingRoutes } from "./routes/teacher-onboarding";
import { planRoutes } from "./routes/plans";
import { classChangeRequestRoutes } from "./routes/class-change-requests";
import { classJoinRoutes } from "./routes/class-join";
import { realtimeRoutes } from "./routes/realtime";
import { presentRoutes } from "./routes/present";
import { aiAssistantRoutes } from "./routes/ai-assistant";
import { contentPageRoutes } from "./routes/content-pages";
import { timetableRoutes } from "./routes/timetable";
import { aiFeatureRoutes } from "./routes/ai-features";
import { aiGuardRoutes } from "./routes/ai-guard";
import { aiCostRoutes } from "./routes/ai-costs";
import { billingPlanRoutes } from "./routes/billing-plans";
import { billingRoutes, billingWebhookRoutes } from "./routes/billing";
import { startPlanReminderJob } from "./lib/plan-reminders";

const isProduction = process.env.NODE_ENV === "production";

// Behind a load balancer/reverse proxy request.ip is the proxy's address unless
// told to trust X-Forwarded-For - which would make every IP-based rate limit
// treat all users as one client. Opt in with TRUST_PROXY=true (or a hop count);
// off by default because trusting it without a proxy lets clients spoof their IP.
function trustProxySetting(): boolean {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (!raw || raw === "false") return false;
  if (raw === "true") return true;
  const hops = Number(raw);
  // Fastify accepts a hop count at runtime; its type definitions just don't list it.
  return Number.isInteger(hops) && hops > 0 ? (hops as unknown as boolean) : false;
}

const app = Fastify({
  trustProxy: trustProxySetting(),
  logger: {
    serializers: {
      // ?token= carries a live access token for image/websocket URLs - keep it out of logs.
      req(request) {
        return {
          method: request.method,
          url: redactUrl(request.url),
          hostname: request.hostname,
          remoteAddress: request.ip,
        };
      },
    },
  },
});

// Browsers only: native mobile requests send no Origin header and are unaffected.
// Production must list the admin dashboard's origin(s) in CORS_ORIGINS.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
  console.error("CORS_ORIGINS is not set - browser clients (the admin dashboard) will be blocked. Set it to the dashboard origin(s), comma-separated.");
}

app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Local development convenience only.
    if (!isProduction && allowedOrigins.length === 0) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
});
app.register(rateLimit, { global: true, max: 1000, timeWindow: "1 minute" });
app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
app.register(authPlugin);
app.register(securityPlugin);
app.register(scopePlugin);
app.register(aiContextPlugin);
app.register(healthRoutes, { prefix: "/api/v1" });
app.register(authRoutes, { prefix: "/api/v1" });
app.register(authMeRoutes, { prefix: "/api/v1" });
app.register(authSignupRoutes, { prefix: "/api/v1" });
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
app.register(subjectRoutes, { prefix: "/api/v1" });
app.register(academicStructureRoutes, { prefix: "/api/v1" });
app.register(schoolFormatTemplateRoutes, { prefix: "/api/v1" });
app.register(userRoutes, { prefix: "/api/v1" });
app.register(trustRoutes, { prefix: "/api/v1" });
app.register(schoolRoutes, { prefix: "/api/v1" });
app.register(pipelineStageRoutes, { prefix: "/api/v1" });
app.register(formDefinitionRoutes, { prefix: "/api/v1" });
app.register(documentRoutes, { prefix: "/api/v1" });
app.register(enquiryPhotoRoutes, { prefix: "/api/v1" });
app.register(lessonStudioRoutes, { prefix: "/api/v1" });
app.register(topicRoutes, { prefix: "/api/v1" });
app.register(generationRoutes, { prefix: "/api/v1" });
app.register(communicationRoutes, { prefix: "/api/v1" });
app.register(attainmentReportRoutes, { prefix: "/api/v1" });
app.register(assignmentRoutes, { prefix: "/api/v1" });
app.register(teacherDashboardRoutes, { prefix: "/api/v1" });
app.register(submissionRoutes, { prefix: "/api/v1" });
app.register(assessmentRoutes, { prefix: "/api/v1" });
app.register(aiAnalyticsRoutes, { prefix: "/api/v1" });
app.register(auditLogRoutes, { prefix: "/api/v1" });
app.register(aiPromptRoutes, { prefix: "/api/v1" });
app.register(admissionsWorkflowRoutes, { prefix: "/api/v1" });
app.register(subjectChangeRequestRoutes, { prefix: "/api/v1" });
app.register(boardChangeTicketRoutes, { prefix: "/api/v1" });
app.register(platformSettingRoutes, { prefix: "/api/v1" });
app.register(teacherCreditRoutes, { prefix: "/api/v1" });
app.register(teacherOnboardingRoutes, { prefix: "/api/v1" });
app.register(planRoutes, { prefix: "/api/v1" });
app.register(classChangeRequestRoutes, { prefix: "/api/v1" });
app.register(classJoinRoutes, { prefix: "/api/v1" });
app.register(realtimeRoutes, { prefix: "/api/v1" });
app.register(presentRoutes, { prefix: "/api/v1" });
app.register(aiAssistantRoutes, { prefix: "/api/v1" });
app.register(contentPageRoutes, { prefix: "/api/v1" });
app.register(timetableRoutes, { prefix: "/api/v1" });
app.register(aiFeatureRoutes, { prefix: "/api/v1" });
app.register(aiGuardRoutes, { prefix: "/api/v1" });
app.register(aiCostRoutes, { prefix: "/api/v1" });
app.register(billingPlanRoutes, { prefix: "/api/v1" });
app.register(billingRoutes, { prefix: "/api/v1" });
app.register(billingWebhookRoutes, { prefix: "/api/v1" });

const port = Number(process.env.PORT) || 4000;

// All file uploads (context sources, submissions, photos, exports) go to
// Cloudinary - fail fast at boot rather than at the first upload.
for (const requiredEnv of ["DATABASE_URL", "JWT_SECRET", "CLOUDINARY_URL"]) {
  if (!process.env[requiredEnv]) {
    console.error(`Missing required environment variable: ${requiredEnv}`);
    process.exit(1);
  }
}

// A weak or placeholder signing secret lets anyone mint valid tokens.
const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret.length < 32 || /change-me|changeme|secret$/i.test(jwtSecret)) {
  const message = "JWT_SECRET is too weak - use a random value of at least 32 characters (e.g. `openssl rand -base64 48`).";
  if (isProduction) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`[security] ${message}`);
}

// The fixed dev sign-in code (123456) must never be reachable in production.
if (isProduction && process.env.ALLOW_DEV_OTP === "true") {
  console.error("ALLOW_DEV_OTP=true is not permitted when NODE_ENV=production.");
  process.exit(1);
}
// The fake payment gateway must never be reachable in production.
if (isProduction && process.env.RAZORPAY_MOCK === "true") {
  console.error("RAZORPAY_MOCK=true is not permitted when NODE_ENV=production.");
  process.exit(1);
}
if (process.env.RAZORPAY_MOCK === "true") {
  console.warn("[billing] Mock payment gateway is ON - payments are simulated. Never enable this outside local development.");
}
if (isProduction && process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_WEBHOOK_SECRET) {
  console.warn("[billing] RAZORPAY_WEBHOOK_SECRET is not set - payments that finish after the browser closes will not be applied.");
}
if (isDevOtpMode()) {
  console.warn("[security] Dev OTP mode is ON - every login code is 123456. Never enable this outside local development.");
}

startPlanReminderJob();

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
