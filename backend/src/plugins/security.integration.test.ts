import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { authPlugin } from "./auth";
import { securityPlugin } from "./security";

// Exercises the real hook ordering: a route's own authenticate (onRequest) must
// run before the global student check (preValidation) so request.user is set.
async function buildApp() {
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  const app = Fastify();
  await app.register(authPlugin);
  await app.register(securityPlugin);
  app.get("/api/v1/students", { onRequest: [app.authenticate] }, async () => ({ data: ["everyone"] }));
  app.get("/api/v1/student/materials", { onRequest: [app.authenticate] }, async () => ({ data: [] }));
  app.get("/api/v1/health", async () => ({ data: "ok" }));
  await app.ready();
  return app;
}

test("a student token is refused on staff routes but works on the student portal", async () => {
  const app = await buildApp();
  const student = app.jwt.sign({ sub: "s1", role: "student", schoolId: "sc1", trustId: null, type: "access" });
  const teacher = app.jwt.sign({ sub: "t1", role: "teacher", schoolId: "sc1", trustId: null, type: "access" });

  const blocked = await app.inject({ method: "GET", url: "/api/v1/students", headers: { authorization: `Bearer ${student}` } });
  assert.equal(blocked.statusCode, 403);

  const portal = await app.inject({ method: "GET", url: "/api/v1/student/materials", headers: { authorization: `Bearer ${student}` } });
  assert.equal(portal.statusCode, 200);

  const staff = await app.inject({ method: "GET", url: "/api/v1/students", headers: { authorization: `Bearer ${teacher}` } });
  assert.equal(staff.statusCode, 200);
  await app.close();
});

test("every response carries the security headers", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/api/v1/health" });
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
  assert.match(String(res.headers["content-security-policy"]), /default-src 'none'/);
  await app.close();
});
