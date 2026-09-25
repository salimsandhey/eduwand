import test from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "./layout";
import { loginCodeEmail, materialSharedEmail, gradeReleasedEmail, staffInviteEmail } from "./templates";

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
