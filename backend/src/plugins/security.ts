import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";

// Everything here applies to every route, so a route that forgets its own
// checks still can't be reached the wrong way.

const API_PREFIX = "/api/v1";

// A student token is only ever meant for the student portal and the account
// endpoints below. Most staff routes only check "logged in + belongs to a
// school", so without this a student login could list every student, read
// admissions documents, export CSVs, etc.
const STUDENT_ALLOWED: RegExp[] = [
  /^\/student(\/|$)/, // the student portal (student-portal.ts)
  /^\/auth(\/|$)/, // /auth/me, own photo/avatar, refresh
  /^\/students\/[0-9a-f-]{36}\/photo$/, // own photo - the handler enforces "own"
  /^\/content-pages(\/|$)/,
  /^\/health$/,
];

export function isStudentAllowedPath(path: string): boolean {
  return STUDENT_ALLOWED.some((pattern) => pattern.test(path));
}

function pathOf(url: string): string {
  const path = url.split("?")[0];
  return path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) || "/" : path;
}

// Query-string credentials (?token=, ?key=) are needed for <Image> URLs and
// websockets, but must never end up in logs.
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:token|key|k)=)[^&#]*/gi, "$1[redacted]");
}

export const securityPlugin = fp(async (app: FastifyInstance) => {
  const isProduction = process.env.NODE_ENV === "production";

  app.addHook("preValidation", async (request, reply) => {
    const user = (request as { user?: { role?: string } | null }).user;
    if (user?.role !== "student") return;
    if (!isStudentAllowedPath(pathOf(request.url))) {
      return reply.code(403).send({
        data: null,
        error: { code: "forbidden", message: "This endpoint isn't available to student accounts" },
      });
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    // The API only serves JSON and file bytes, never pages. This also stops an
    // uploaded HTML/SVG file from running script if someone opens its URL.
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox");
    if (isProduction) reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (pathOf(request.url).startsWith("/auth") || /[?&]token=/.test(request.url)) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });
});
