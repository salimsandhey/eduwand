import test from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "./layout";
import { getTemplateDef, listTemplateDefs, placeholdersIn, renderTemplateSample, setEmailOverrides } from "./registry";
import { loginCodeEmail, materialSharedEmail, gradeReleasedEmail, staffInviteEmail, planEndingEmail } from "./templates";

test("login code email greets by first name and shows the code in both parts", () => {
  const mail = loginCodeEmail({ name: "Aarav Sharma", code: "123456", purpose: "student_login", schoolName: "Green Valley School" });
  assert.match(mail.subject, /123456/);
  assert.match(mail.html, /Hi Aarav,/);
  assert.match(mail.html, /123456/);
  assert.match(mail.html, /Green Valley School/);
  assert.match(mail.text, /Your code: 123456/);
});

test("falls back to a plain greeting when no name is known", () => {
  const mail = loginCodeEmail({ code: "654321", purpose: "teacher_signup" });
  assert.match(mail.html, /Hello,/);
  assert.doesNotMatch(mail.html, /Hi undefined/);
});

test("user-supplied text is HTML-escaped", () => {
  const mail = renderEmail("Subject", {
    heading: "<script>alert(1)</script>",
    recipientName: "<b>Eve</b>",
    paragraphs: ['A "quoted" & <tag>'],
  });
  assert.doesNotMatch(mail.html, /<script>alert/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /&amp;/);
});

test("material and grade emails carry the personal details", () => {
  const material = materialSharedEmail({
    studentName: "Meera",
    teacherName: "Mr. Rao",
    topicName: "Photosynthesis",
    subject: "Science",
    outputType: "flashcards",
    className: "8 A",
  });
  assert.match(material.html, /Mr\. Rao/);
  assert.match(material.html, /Photosynthesis/);
  assert.match(material.html, /Flashcards/);

  const grade = gradeReleasedEmail({ studentName: "Meera", assignmentTitle: "Unit test", score: 18, feedback: "Great work" });
  assert.match(grade.html, /18/);
  assert.match(grade.html, /Great work/);
});

test("staff invite includes the temporary password and change-it note", () => {
  const mail = staffInviteEmail({ name: "Priya", email: "priya@school.in", role: "teacher", schoolName: "Green Valley", tempPassword: "abc123XYZ" });
  assert.match(mail.html, /abc123XYZ/);
  assert.match(mail.text, /change this temporary password/i);
});

test("header uses the hosted logo when a public address is set, and a wordmark when not", () => {
  const saved = { web: process.env.PUBLIC_WEB_URL, asset: process.env.EMAIL_ASSET_URL, billing: process.env.BILLING_URL, app: process.env.APP_URL };
  try {
    delete process.env.EMAIL_ASSET_URL;
    delete process.env.BILLING_URL;
    delete process.env.APP_URL;

    process.env.PUBLIC_WEB_URL = "https://eduwand.example/";
    const withLogo = renderEmail("Subject", { heading: "Hello", paragraphs: ["Body"] });
    assert.match(withLogo.html, /src="https:\/\/eduwand\.example\/email\/logo-white\.png"/);
    assert.match(withLogo.html, /alt="EduWand"/);
    assert.match(withLogo.html, /https:\/\/eduwand\.example\/privacy/);

    delete process.env.PUBLIC_WEB_URL;
    const without = renderEmail("Subject", { heading: "Hello", paragraphs: ["Body"] });
    assert.doesNotMatch(without.html, /<img/);
    assert.match(without.html, /Edu<span[^>]*>Wand<\/span>/);
    assert.doesNotMatch(without.html, /\/privacy/);
  } finally {
    for (const [key, value] of Object.entries({ PUBLIC_WEB_URL: saved.web, EMAIL_ASSET_URL: saved.asset, BILLING_URL: saved.billing, APP_URL: saved.app })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the tone colours the accent bar", () => {
  const good = renderEmail("S", { heading: "H", paragraphs: ["p"], tone: "success" });
  const bad = renderEmail("S", { heading: "H", paragraphs: ["p"], tone: "alert" });
  const plain = renderEmail("S", { heading: "H", paragraphs: ["p"] });
  assert.match(good.html, /width:44px;background:#0CA30C/);
  assert.match(bad.html, /width:44px;background:#D03B3B/);
  assert.match(plain.html, /width:44px;background:#FBAA0A/);
});

test("a saved wording replaces the default, fills placeholders and drops empty paragraphs", () => {
  const def = getTemplateDef("grade_released");
  assert.ok(def);
  setEmailOverrides(new Map([["grade_released", { ...def.copy, heading: "Result for {{title}}", paragraphs: ["{{teacher}} marked it.", "{{feedbackLine}}"] }]]));
  try {
    const withoutFeedback = gradeReleasedEmail({ studentName: "Meera", assignmentTitle: "Unit test", score: 9, teacherName: "Ms. Iyer" });
    assert.match(withoutFeedback.html, /Result for Unit test/);
    assert.match(withoutFeedback.html, /Ms\. Iyer marked it\./);
    assert.doesNotMatch(withoutFeedback.html, /Feedback:/);
    const withFeedback = gradeReleasedEmail({ studentName: "Meera", assignmentTitle: "Unit test", score: 9, feedback: "Well done" });
    assert.match(withFeedback.html, /Feedback: Well done/);
  } finally {
    setEmailOverrides(new Map());
  }
  assert.match(gradeReleasedEmail({ studentName: "Meera", assignmentTitle: "Unit test", score: 9 }).html, /Your assignment has been graded/);
});

test("every template renders its example with its own default wording", () => {
  const defs = listTemplateDefs();
  assert.ok(defs.length >= 25);
  for (const def of defs) {
    const mail = renderTemplateSample(def.key);
    assert.ok(mail, def.key);
    assert.ok(mail.subject.trim(), `${def.key} has no subject`);
    assert.doesNotMatch(mail.html, /\{\{/, `${def.key} left a placeholder unfilled`);
    // Every placeholder written in the default wording is one the template documents.
    const allowed = new Set(def.vars.map((x) => x.name));
    for (const text of [def.copy.subject, def.copy.preheader, def.copy.heading, def.copy.note, ...def.copy.paragraphs]) {
      for (const name of placeholdersIn(text)) assert.ok(allowed.has(name), `${def.key} uses undocumented {{${name}}}`);
    }
  }
});

test("a plan-ending email links to the billing page on the website", () => {
  const saved = { web: process.env.PUBLIC_WEB_URL, billing: process.env.BILLING_URL };
  try {
    delete process.env.BILLING_URL;
    process.env.PUBLIC_WEB_URL = "https://eduwand.example";
    const mail = planEndingEmail({ name: "Priya", planName: "Free trial", kind: "trial", daysLeft: 3, endsAt: new Date("2026-10-01"), credits: 5000 });
    assert.match(mail.html, /href="https:\/\/eduwand\.example\/billing"/);
    assert.match(mail.text, /Choose a plan: https:\/\/eduwand\.example\/billing/);
  } finally {
    if (saved.web === undefined) delete process.env.PUBLIC_WEB_URL;
    else process.env.PUBLIC_WEB_URL = saved.web;
    if (saved.billing === undefined) delete process.env.BILLING_URL;
    else process.env.BILLING_URL = saved.billing;
  }
});
