import { test } from "node:test";
import assert from "node:assert/strict";
import { Validator, normalizeIndianPhone, passwordProblem } from "./validation";

test("normalizeIndianPhone accepts Indian mobiles in common forms", () => {
  assert.equal(normalizeIndianPhone("9876543210"), "9876543210");
  assert.equal(normalizeIndianPhone("+91 98765 43210"), "9876543210");
  assert.equal(normalizeIndianPhone("91-9876543210"), "9876543210");
  assert.equal(normalizeIndianPhone("09876543210"), "9876543210");
});

test("normalizeIndianPhone rejects non-Indian or malformed numbers", () => {
  assert.equal(normalizeIndianPhone("1234567890"), null);
  assert.equal(normalizeIndianPhone("98765"), null);
  assert.equal(normalizeIndianPhone("98765432101"), null);
  assert.equal(normalizeIndianPhone("abcdefghij"), null);
  assert.equal(normalizeIndianPhone("+1 415 555 0132"), null);
});

test("passwordProblem enforces length and letter+number", () => {
  assert.notEqual(passwordProblem("short1"), null);
  assert.notEqual(passwordProblem("onlyletters"), null);
  assert.notEqual(passwordProblem("12345678"), null);
  assert.notEqual(passwordProblem("a1".repeat(40)), null);
  assert.equal(passwordProblem("goodpass1"), null);
});

test("email is trimmed, lowercased and strictly checked", () => {
  const v = new Validator();
  assert.equal(v.email("email", "  Foo@Example.COM "), "foo@example.com");
  assert.equal(v.hasErrors, false);
  v.email("bad", "a@b");
  v.email("bad2", "no-at-sign.com");
  v.email("bad3", "");
  assert.deepEqual(Object.keys(v.errors), ["bad", "bad2", "bad3"]);
});

test("optional empty fields produce no error and no value", () => {
  const v = new Validator();
  assert.equal(v.phone("phone", "", false), undefined);
  assert.equal(v.email("email", undefined, false), undefined);
  assert.equal(v.hasErrors, false);
});

test("personName rejects too short, digits only and control characters", () => {
  const v = new Validator();
  assert.equal(v.personName("a", "  Asha   Rao "), "Asha Rao");
  v.personName("b", "A");
  v.personName("c", "12345");
  v.personName("d", "Bad\u0000Name");
  v.personName("e", "x".repeat(81));
  assert.deepEqual(Object.keys(v.errors), ["b", "c", "d", "e"]);
});

test("dateOfBirth rejects impossible, future and out-of-range ages", () => {
  const v = new Validator();
  assert.ok(v.dateOfBirth("ok", "2015-06-10"));
  v.dateOfBirth("impossible", "2015-02-31");
  v.dateOfBirth("future", "2999-01-01");
  v.dateOfBirth("old", "1900-01-01");
  v.dateOfBirth("toddler", new Date().toISOString().slice(0, 10));
  v.dateOfBirth("junk", "not-a-date");
  assert.deepEqual(Object.keys(v.errors), ["impossible", "future", "old", "toddler", "junk"]);
});

test("number enforces integer and bounds", () => {
  const v = new Validator();
  assert.equal(v.number("n", "5", "Seat", { integer: true, min: 1, max: 40 }), 5);
  v.number("low", 0, "Seat", { min: 1 });
  v.number("high", 50, "Seat", { max: 40 });
  v.number("frac", 1.5, "Seat", { integer: true });
  v.number("text", "abc", "Seat");
  v.number("missing", undefined, "Seat", { required: true });
  assert.deepEqual(Object.keys(v.errors), ["low", "high", "frac", "text", "missing"]);
});

import { validateAssignmentQuestions } from "./validation";

test("reject sends a 400 with the first message and per-field messages", () => {
  const sent: { code?: number; body?: unknown } = {};
  const reply = {
    code(c: number) {
      sent.code = c;
      return this;
    },
    send(b: unknown) {
      sent.body = b;
      return this;
    },
  };
  const v = new Validator();
  v.email("email", "nope");
  v.phone("guardianContact", "123");
  v.reject(reply as never);
  assert.equal(sent.code, 400);
  const body = sent.body as { data: null; error: { code: string; message: string; fields: Record<string, string> } };
  assert.equal(body.error.code, "validation_error");
  assert.deepEqual(Object.keys(body.error.fields), ["email", "guardianContact"]);
  assert.equal(body.error.message, body.error.fields.email);
});

test("gstin, url and timezone", () => {
  const v = new Validator();
  assert.equal(v.gstin("g", " 22aaaaa0000a1z5 "), "22AAAAA0000A1Z5");
  assert.equal(v.url("u", "https://example.com/a"), "https://example.com/a");
  assert.equal(v.timezone("t", "Asia/Kolkata"), "Asia/Kolkata");
  assert.equal(v.hasErrors, false);
  v.gstin("g2", "12345");
  v.url("u2", "javascript:alert(1)");
  v.url("u3", "ftp://example.com");
  v.url("u4", "not a url");
  v.timezone("t2", "Mars/Olympus");
  assert.deepEqual(Object.keys(v.errors), ["g2", "u2", "u3", "u4", "t2"]);
});

test("validateAssignmentQuestions catches incomplete questions", () => {
  const ok = new Validator();
  validateAssignmentQuestions(ok, "questions", [
    { prompt: "2+2?", type: "mcq", options: ["3", "4"], correctOptionIndex: 1 },
    { prompt: "Explain", type: "short_answer" },
  ]);
  assert.equal(ok.hasErrors, false);

  const cases: unknown[] = [
    [],
    [{ prompt: "" }],
    [{ prompt: "Q", type: "mcq", options: ["a"], correctOptionIndex: 0 }],
    [{ prompt: "Q", type: "mcq", options: ["a", "b"] }],
    [{ prompt: "Q", type: "mcq", options: ["a", ""], correctOptionIndex: 0 }],
    [{ prompt: "Q", type: "match_following", pairs: [{ left: "a", right: "" }, { left: "b", right: "c" }] }],
    [{ prompt: "Q", type: "sequencing", items: ["only one"] }],
  ];
  for (const bad of cases) {
    const v = new Validator();
    validateAssignmentQuestions(v, "questions", bad);
    assert.equal(v.hasErrors, true, JSON.stringify(bad));
  }
});
