import test from "node:test";
import assert from "node:assert/strict";
import { isStudentAllowedPath, redactUrl } from "./security";
import { detectImageMime, uploadKey, imageKey } from "../lib/upload";
import { generateLoginOtp, isDevOtpMode, DEV_OTP_CODE } from "../lib/otp";

test("students can reach only the student portal and account endpoints", () => {
  for (const ok of ["/student/materials", "/student/me", "/auth/me", "/auth/me/photo", "/auth/refresh", "/students/3f9c2c1e-8b1a-4c53-9a4e-0a1f1c2b3d4e/photo", "/content-pages/privacy_policy", "/health"]) {
    assert.equal(isStudentAllowedPath(ok), true, ok);
  }
  for (const blocked of [
    "/students",
    "/students/3f9c2c1e-8b1a-4c53-9a4e-0a1f1c2b3d4e",
    "/enquiries/abc/documents",
    "/enquiries/abc/photo",
    "/exports/run",
    "/follow-up-tasks",
    "/message-templates",
    "/ai-assistant/messages",
    "/subjects",
    "/topics",
    "/studentsx",
    "/student-x",
  ]) {
    assert.equal(isStudentAllowedPath(blocked), false, blocked);
  }
});

test("tokens are redacted from logged URLs", () => {
  assert.equal(redactUrl("/api/v1/auth/me/photo?token=abc.def.ghi&v=2"), "/api/v1/auth/me/photo?token=[redacted]&v=2");
  assert.equal(redactUrl("/realtime?presentCode=ABC&key=secret"), "/realtime?presentCode=ABC&key=[redacted]");
  assert.equal(redactUrl("/api/v1/students?page=2"), "/api/v1/students?page=2");
});

test("images are identified by their bytes, and svg or html is rejected", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  assert.equal(detectImageMime(jpeg), "image/jpeg");
  assert.equal(detectImageMime(png), "image/png");
  assert.equal(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(detectImageMime(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(detectImageMime(Buffer.alloc(4)), null);
});

test("upload keys are random and never carry the client filename", () => {
  const a = uploadKey("documents/x", "../../etc/passwd.pdf");
  const b = uploadKey("documents/x", "../../etc/passwd.pdf");
  assert.notEqual(a, b);
  assert.match(a, /^documents\/x\/[0-9a-f-]{36}\.pdf$/);
  assert.doesNotMatch(a, /passwd|\.\./);
  assert.match(uploadKey("documents/x", "evil.html"), /\.bin$/);
  assert.match(uploadKey("documents/x", "evil.SVG"), /\.bin$/);
  assert.match(imageKey("photos", "image/png"), /^photos\/[0-9a-f-]{36}\.png$/);
});

test("the fixed dev OTP is opt-in and never active in production", () => {
  const saved = { allow: process.env.ALLOW_DEV_OTP, env: process.env.NODE_ENV };
  try {
    delete process.env.ALLOW_DEV_OTP;
    process.env.NODE_ENV = "development";
    assert.equal(isDevOtpMode(), false);
    assert.notEqual(generateLoginOtp(), DEV_OTP_CODE + "x");
    assert.match(generateLoginOtp(), /^\d{6}$/);

    process.env.ALLOW_DEV_OTP = "true";
    assert.equal(isDevOtpMode(), true);
    assert.equal(generateLoginOtp(), DEV_OTP_CODE);

    process.env.NODE_ENV = "production";
    assert.equal(isDevOtpMode(), false);
    assert.match(generateLoginOtp(), /^\d{6}$/);
  } finally {
    if (saved.allow === undefined) delete process.env.ALLOW_DEV_OTP;
    else process.env.ALLOW_DEV_OTP = saved.allow;
    if (saved.env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved.env;
  }
});
