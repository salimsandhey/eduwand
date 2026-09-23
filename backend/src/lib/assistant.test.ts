import { test } from "node:test";
import assert from "node:assert/strict";
import { stubProvider } from "./ai";
import { istDayBounds, resolveAssistantRole } from "./assistant-context";
import { findTool, findWriteTool, toolsForRole } from "./assistant-tools";
import { AppJwtPayload } from "../types/fastify-jwt";

const jwt = (role: string): AppJwtPayload => ({ sub: "u1", role, schoolId: "s1", trustId: null, type: "access" });

test("assistant is offered to the four mobile roles only", () => {
  for (const role of ["teacher", "student", "counsellor", "front_desk"]) {
    assert.equal(resolveAssistantRole(jwt(role)), role);
  }
  for (const role of ["admin", "principal", "leadership", "platform_admin", "nonsense"]) {
    assert.equal(resolveAssistantRole(jwt(role)), null);
  }
});

test("students get read-only tools and no write tool", () => {
  const tools = toolsForRole("student");
  assert.ok(tools.length > 0);
  assert.ok(tools.every((t) => t.kind === "read"));
});

test("tool names are unique within each role and declared with a description", () => {
  for (const role of ["teacher", "student", "counsellor", "front_desk"] as const) {
    const names = toolsForRole(role).map((t) => t.declaration.name);
    assert.equal(new Set(names).size, names.length, `${role} has duplicate tool names`);
    assert.ok(toolsForRole(role).every((t) => t.declaration.description.length > 10));
  }
});

test("a role cannot reach another role's tools", () => {
  assert.equal(findTool("student", "create_followup_task"), undefined);
  assert.equal(findTool("student", "send_class_message"), undefined);
  assert.equal(findTool("teacher", "update_enquiry_stage"), undefined);
  assert.equal(findTool("counsellor", "draft_assignment_from_topic"), undefined);
  assert.equal(findWriteTool("counsellor", "send_class_message"), undefined);
  assert.equal(findWriteTool("student", "send_student_message"), undefined);
});

test("findWriteTool only returns write tools", () => {
  assert.equal(findWriteTool("counsellor", "list_followups"), undefined);
  assert.equal(findWriteTool("counsellor", "create_followup_task")?.kind, "write");
  assert.equal(findWriteTool("teacher", "draft_assignment_from_topic")?.kind, "write");
});

test("counsellor and front desk share the enrolment tools", () => {
  assert.deepEqual(
    toolsForRole("counsellor").map((t) => t.declaration.name),
    toolsForRole("front_desk").map((t) => t.declaration.name)
  );
});

test("istDayBounds is the IST calendar day around a given instant", () => {
  // 2026-09-19 23:30 IST == 18:00 UTC same day; the IST day is 19th 00:00 -> 20th 00:00 IST.
  const { startOfToday, startOfTomorrow } = istDayBounds(new Date("2026-09-19T18:00:00Z"));
  assert.equal(startOfToday.toISOString(), "2026-09-18T18:30:00.000Z");
  assert.equal(startOfTomorrow.toISOString(), "2026-09-19T18:30:00.000Z");
  // 00:10 IST on the 20th == 18:40 UTC on the 19th -> already the 20th in IST.
  const next = istDayBounds(new Date("2026-09-19T18:40:00Z"));
  assert.equal(next.startOfToday.toISOString(), "2026-09-19T18:30:00.000Z");
});

test("stub assistantStep is deterministic and never asks for a tool", async () => {
  const input = {
    contents: [{ role: "user" as const, parts: [{ text: "what is overdue?" }] }],
    systemPrompt: "x",
    tools: toolsForRole("counsellor").map((t) => t.declaration),
  };
  const a = await stubProvider.assistantStep(input);
  const b = await stubProvider.assistantStep(input);
  assert.deepEqual(a, b);
  assert.equal(a.parts.length, 1);
  assert.ok("text" in a.parts[0] && a.parts[0].text.includes("what is overdue?"));
});
