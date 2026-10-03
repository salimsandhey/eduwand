import { publicWebUrl } from "./layout";
import { renderEmail } from "./layout";
import type { RenderedEmail } from "./layout";
import { defineTemplate } from "./registry";

// Every EduWand email is declared here: its default wording (with {{placeholders}}
// that admins can edit in the dashboard, see registry.ts), and how real data
// becomes placeholder values and the parts that stay in code (details table,
// code, button link). Each template takes the facts about the event and the
// recipient (name, school, teacher, class, ...) so the message reads as written
// for that person. The shared branded look lives in layout.ts.

// Optional link to open/download the app - set APP_URL (store page or a
// universal link). Without it, emails simply omit the button.
function appUrl(): string | undefined {
  return process.env.APP_URL?.trim() || undefined;
}

function classLabel(className?: string | null, sectionName?: string | null): string {
  return [className, sectionName].filter(Boolean).join(" ");
}

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  admin: "School admin",
  principal: "Principal",
  leadership: "Leadership",
  front_desk: "Front desk",
  counsellor: "Counsellor",
  platform_admin: "Platform admin",
};

export const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson plan",
  custom_activity_report: "Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

const v = (name: string, description: string) => ({ name, description });

// --- Sign-in / sign-up codes ------------------------------------------------

export type CodePurpose = "student_login" | "teacher_signup" | "password_reset";

interface LoginCodeInput {
  name?: string;
  code: string;
  purpose: CodePurpose;
  schoolName?: string | null;
}

const CODE_NOTE = "This code expires in 5 minutes. Never share it with anyone - EduWand will never ask you for it.";
const codeVars = [v("code", "The 6-digit code"), v("schoolName", "The school the code is for, if any")];
const codeMake = (input: LoginCodeInput) => ({
  vars: { code: input.code, schoolName: input.schoolName ?? "" },
  parts: { recipientName: input.name, code: input.code, senderContext: input.schoolName ?? undefined },
});
const codeSample: LoginCodeInput = { name: "Aarav Sharma", code: "482916", purpose: "student_login", schoolName: "Green Valley School" };

const studentLoginCode = defineTemplate<LoginCodeInput>({
  key: "login_code_student",
  label: "Student login code",
  group: "Sign-in codes",
  description: "Sent to a student each time they sign in.",
  vars: codeVars,
  copy: {
    subject: "{{code}} is your EduWand login code",
    preheader: "Your code is {{code}}. It expires in 5 minutes.",
    heading: "Your login code",
    paragraphs: ["Use this code to sign in to your EduWand student account."],
    note: CODE_NOTE,
    ctaLabel: "",
  },
  sample: codeSample,
  make: codeMake,
});

const signupCode = defineTemplate<LoginCodeInput>({
  key: "login_code_signup",
  label: "Sign-up verification code",
  group: "Sign-in codes",
  description: "Sent to a teacher to confirm their email while signing up.",
  vars: codeVars,
  copy: {
    subject: "{{code}} is your EduWand verification code",
    preheader: "Your code is {{code}}. It expires in 5 minutes.",
    heading: "Verify your email",
    paragraphs: ["Enter this code in the app to confirm your email and finish creating your workspace."],
    note: CODE_NOTE,
    ctaLabel: "",
  },
  sample: { ...codeSample, purpose: "teacher_signup", schoolName: null },
  make: codeMake,
});

const resetCode = defineTemplate<LoginCodeInput>({
  key: "login_code_reset",
  label: "Password reset code",
  group: "Sign-in codes",
  description: "Sent when someone asks to reset a forgotten password.",
  vars: codeVars,
  copy: {
    subject: "{{code}} is your EduWand password reset code",
    preheader: "Your code is {{code}}. It expires in 5 minutes.",
    heading: "Reset your password",
    paragraphs: ["Enter this code in the app, then choose a new password."],
    note: CODE_NOTE,
    ctaLabel: "",
  },
  sample: { ...codeSample, purpose: "password_reset", schoolName: null },
  make: codeMake,
});

export function loginCodeEmail(input: LoginCodeInput): RenderedEmail {
  return { student_login: studentLoginCode, teacher_signup: signupCode, password_reset: resetCode }[input.purpose](input);
}

// --- Staff accounts ---------------------------------------------------------

export const staffInviteEmail = defineTemplate<{
  name: string;
  email: string;
  role: string;
  schoolName?: string | null;
  invitedByName?: string | null;
  tempPassword: string;
}>({
  key: "staff_invite",
  label: "Staff invitation",
  group: "Accounts",
  description: "Sent when an admin adds someone to a school, with their temporary password.",
  vars: [
    v("where", "The school's name (or EduWand)"),
    v("invitedBy", "Who added them (or 'Your school')"),
    v("roleLabel", "Their role, e.g. Teacher"),
  ],
  copy: {
    subject: "You've been invited to {{where}} on EduWand",
    preheader: "{{invitedBy}} added you as {{roleLabel}}.",
    heading: "Welcome to {{where}}",
    paragraphs: ["{{invitedBy}} has added you to {{where}} on EduWand as {{roleLabel}}. Sign in with the details below."],
    note: "For your security, change this temporary password after you first sign in (Profile → Change password).",
    ctaLabel: "Open EduWand",
  },
  sample: { name: "Priya Nair", email: "priya@school.in", role: "teacher", schoolName: "Green Valley School", invitedByName: "Mr. Rao", tempPassword: "Xk29-mQ7p" },
  make: (input) => {
    const roleLabel = ROLE_LABELS[input.role] ?? input.role;
    return {
      vars: { where: input.schoolName ?? "EduWand", invitedBy: input.invitedByName ?? "Your school", roleLabel },
      parts: {
        recipientName: input.name,
        details: [
          { label: "Email", value: input.email },
          { label: "Temporary password", value: input.tempPassword },
          { label: "Role", value: roleLabel },
        ],
        ctaUrl: appUrl(),
        senderContext: input.schoolName ?? undefined,
      },
    };
  },
});

export const adminPasswordResetEmail = defineTemplate<{
  name: string;
  email: string;
  tempPassword: string;
  resetByName?: string | null;
  schoolName?: string | null;
}>({
  key: "admin_password_reset",
  label: "Password reset by an admin",
  group: "Accounts",
  description: "Sent when an admin resets someone's password and gives them a temporary one.",
  vars: [v("resetBy", "Who reset it (or 'An administrator')")],
  copy: {
    subject: "Your EduWand password was reset",
    preheader: "A temporary password has been set for your account.",
    heading: "Your password was reset",
    paragraphs: ["{{resetBy}} reset the password for your EduWand account. Use the temporary password below to sign in."],
    note: "Please change this password right after you sign in. If you weren't expecting this, contact your school admin.",
    ctaLabel: "Open EduWand",
  },
  sample: { name: "Priya Nair", email: "priya@school.in", tempPassword: "Xk29-mQ7p", resetByName: "Mr. Rao", schoolName: "Green Valley School" },
  make: (input) => ({
    vars: { resetBy: input.resetByName ?? "An administrator" },
    parts: {
      recipientName: input.name,
      details: [
        { label: "Email", value: input.email },
        { label: "Temporary password", value: input.tempPassword },
      ],
      ctaUrl: appUrl(),
      senderContext: input.schoolName ?? undefined,
    },
  }),
});

export const teacherWelcomeEmail = defineTemplate<{ name: string; workspaceName: string; credits?: number | null }>({
  key: "teacher_welcome",
  label: "Teacher welcome",
  group: "Accounts",
  description: "Sent when an individual teacher finishes signing up.",
  vars: [v("firstName", "Their first name"), v("workspaceName", "The name of their new workspace")],
  copy: {
    subject: "Welcome to EduWand, {{firstName}}!",
    preheader: 'Your workspace "{{workspaceName}}" is ready.',
    heading: "Your workspace is ready",
    paragraphs: [
      "Your email is verified and \"{{workspaceName}}\" is set up. Here's a quick way to get going: add your classes, invite students, then create your first lesson plan or presentation with AI.",
    ],
    note: "You can sign in from now on with your email and password.",
    ctaLabel: "Open EduWand",
  },
  sample: { name: "Priya Nair", workspaceName: "Priya's Classroom", credits: 5000 },
  make: (input) => ({
    vars: { firstName: input.name.split(/\s+/)[0], workspaceName: input.workspaceName },
    parts: {
      recipientName: input.name,
      details: input.credits != null ? [{ label: "Starting AI credits", value: String(input.credits) }] : undefined,
      ctaUrl: appUrl(),
      senderContext: input.workspaceName,
      tone: "success",
    },
  }),
});

// --- Security ---------------------------------------------------------------

type SecurityInput = { name?: string };

const securityMake = (input: SecurityInput) => ({ vars: {}, parts: { recipientName: input.name } });

const passwordChanged = defineTemplate<SecurityInput>({
  key: "security_password_changed",
  label: "Password changed",
  group: "Security",
  description: "A heads-up sent after someone changes their password.",
  vars: [],
  copy: {
    subject: "Your EduWand password was changed",
    preheader: "The password for your EduWand account was just changed.",
    heading: "Password changed",
    paragraphs: ["The password for your EduWand account was just changed."],
    note: "If this wasn't you, reset your password immediately and contact your school admin or support.",
    ctaLabel: "",
  },
  sample: { name: "Priya Nair" },
  make: (input) => ({ vars: {}, parts: { ...securityMake(input).parts, tone: "warning" } }),
});

const passwordResetDone = defineTemplate<SecurityInput>({
  key: "security_password_reset_done",
  label: "Password reset complete",
  group: "Security",
  description: "Sent after someone resets their password with an emailed code.",
  vars: [],
  copy: {
    subject: "Your EduWand password was reset",
    preheader: "Your EduWand password was reset using an emailed code.",
    heading: "Password reset complete",
    paragraphs: ["Your EduWand password was reset using an emailed code."],
    note: "If this wasn't you, reset your password immediately and contact your school admin or support.",
    ctaLabel: "",
  },
  sample: { name: "Priya Nair" },
  make: securityMake,
});

const accountDeleted = defineTemplate<SecurityInput>({
  key: "security_account_deleted",
  label: "Account deleted",
  group: "Security",
  description: "Sent after someone deletes their account.",
  vars: [],
  copy: {
    subject: "Your EduWand account was deleted",
    preheader: "Your EduWand account has been deleted and your personal details have been removed, as you requested.",
    heading: "Account deleted",
    paragraphs: ["Your EduWand account has been deleted and your personal details have been removed, as you requested."],
    note: "If you didn't do this, contact support straight away.",
    ctaLabel: "",
  },
  sample: { name: "Priya Nair" },
  make: securityMake,
});

export function securityAlertEmail(input: {
  name?: string;
  event: "password_changed" | "password_reset_completed" | "account_deleted";
}): RenderedEmail {
  return { password_changed: passwordChanged, password_reset_completed: passwordResetDone, account_deleted: accountDeleted }[input.event](input);
}

// --- Students ---------------------------------------------------------------

type EmailChangedInput = {
  studentName: string;
  oldEmail?: string | null;
  newEmail: string;
  audience: "old" | "new";
  schoolName?: string | null;
};

const emailChangedMake = (input: EmailChangedInput) => ({
  vars: { studentName: input.studentName, newEmail: input.newEmail },
  parts: { recipientName: input.studentName, senderContext: input.schoolName ?? undefined },
});
const emailChangedVars = [v("studentName", "The student's name"), v("newEmail", "The new sign-in email")];
const emailChangedSample: EmailChangedInput = { studentName: "Meera Joshi", oldEmail: "meera.old@example.com", newEmail: "meera@example.com", audience: "old", schoolName: "Green Valley School" };

const emailChangedOld = defineTemplate<EmailChangedInput>({
  key: "student_email_changed_old",
  label: "Sign-in email changed (to the old address)",
  group: "Students",
  description: "Tells the previous address that a student's sign-in email was changed.",
  vars: emailChangedVars,
  copy: {
    subject: "Your EduWand sign-in email was changed",
    preheader: "Your school changed the email used to sign in.",
    heading: "Sign-in email changed",
    paragraphs: ["The email used to sign in to {{studentName}}'s EduWand account was changed to {{newEmail}}. Login codes will now be sent there instead."],
    note: "If you didn't expect this, please contact your school.",
    ctaLabel: "",
  },
  sample: emailChangedSample,
  make: emailChangedMake,
});

const emailChangedNew = defineTemplate<EmailChangedInput>({
  key: "student_email_changed_new",
  label: "Sign-in email changed (to the new address)",
  group: "Students",
  description: "Tells the new address it can now be used to sign in.",
  vars: emailChangedVars,
  copy: {
    subject: "Your EduWand sign-in email is now this address",
    preheader: "You can now sign in to EduWand with this address.",
    heading: "You can sign in with this email",
    paragraphs: ["This email address is now linked to {{studentName}}'s EduWand student account. Enter it in the app and we'll send you a login code each time you sign in."],
    note: "",
    ctaLabel: "Open EduWand",
  },
  sample: { ...emailChangedSample, audience: "new" },
  make: (input) => {
    const made = emailChangedMake(input);
    return { vars: made.vars, parts: { ...made.parts, ctaUrl: appUrl() } };
  },
});

export function studentEmailChangedEmail(input: EmailChangedInput): RenderedEmail {
  return (input.audience === "old" ? emailChangedOld : emailChangedNew)(input);
}

export const materialSharedEmail = defineTemplate<{
  studentName: string;
  teacherName?: string | null;
  topicName: string;
  subject?: string | null;
  outputType: string;
  className?: string | null;
  schoolName?: string | null;
}>({
  key: "material_shared",
  label: "New study material",
  group: "Students",
  description: "Sent to a student when a teacher shares a lesson plan, flashcards or other material.",
  vars: [
    v("from", "The teacher's name (or 'Your teacher')"),
    v("topic", "The topic shared"),
    v("typeLabel", "The kind of material, e.g. Flashcards"),
    v("typeLabelLower", "The same, in lower case"),
  ],
  copy: {
    subject: "New {{typeLabelLower}}: {{topic}}",
    preheader: "{{from}} shared {{topic}} with you.",
    heading: "New study material for you",
    paragraphs: ["{{from}} has shared something new with you. Open the Materials tab in the app to read it."],
    note: "",
    ctaLabel: "Open Materials",
  },
  sample: { studentName: "Meera Joshi", teacherName: "Mr. Rao", topicName: "Photosynthesis", subject: "Science", outputType: "flashcards", className: "8 A", schoolName: "Green Valley School" },
  make: (input) => {
    const typeLabel = OUTPUT_TYPE_LABELS[input.outputType] ?? "Material";
    return {
      vars: { from: input.teacherName ?? "Your teacher", topic: input.topicName, typeLabel, typeLabelLower: typeLabel.toLowerCase() },
      parts: {
        recipientName: input.studentName,
        details: [
          { label: "Topic", value: input.topicName },
          { label: "Type", value: typeLabel },
          ...(input.subject ? [{ label: "Subject", value: input.subject }] : []),
          ...(input.className ? [{ label: "Class", value: input.className }] : []),
        ],
        ctaUrl: appUrl(),
        senderContext: input.schoolName ?? undefined,
      },
    };
  },
});

export const assignmentPublishedEmail = defineTemplate<{
  studentName: string;
  title: string;
  teacherName?: string | null;
  className?: string | null;
  questionCount?: number;
  schoolName?: string | null;
}>({
  key: "assignment_published",
  label: "New assignment",
  group: "Students",
  description: "Sent to a student when a teacher posts an assignment.",
  vars: [v("from", "The teacher's name (or 'Your teacher')"), v("title", "The assignment's title")],
  copy: {
    subject: "New assignment: {{title}}",
    preheader: "{{from}} posted a new assignment.",
    heading: "You have a new assignment",
    paragraphs: ["{{from}} posted an assignment for you. You can answer it in the app."],
    note: "",
    ctaLabel: "Open assignment",
  },
  sample: { studentName: "Meera Joshi", title: "Unit test 3", teacherName: "Ms. Iyer", className: "8 A", questionCount: 12, schoolName: "Green Valley School" },
  make: (input) => ({
    vars: { from: input.teacherName ?? "Your teacher", title: input.title },
    parts: {
      recipientName: input.studentName,
      details: [
        { label: "Assignment", value: input.title },
        ...(input.className ? [{ label: "Class", value: input.className }] : []),
        ...(input.questionCount ? [{ label: "Questions", value: String(input.questionCount) }] : []),
      ],
      ctaUrl: appUrl(),
      senderContext: input.schoolName ?? undefined,
    },
  }),
});

export const gradeReleasedEmail = defineTemplate<{
  studentName: string;
  assignmentTitle: string;
  score: number | null;
  performanceBand?: string | null;
  feedback?: string | null;
  teacherName?: string | null;
  schoolName?: string | null;
}>({
  key: "grade_released",
  label: "Result released",
  group: "Students",
  description: "Sent to a student when a teacher releases their grade.",
  vars: [
    v("teacher", "The teacher's name (or 'Your teacher')"),
    v("title", "The assignment's title"),
    v("resultLine", "'You scored 18.' or 'Your assignment has been graded.'"),
    v("feedbackLine", "'Feedback: ...' when the teacher left feedback, otherwise empty"),
  ],
  copy: {
    subject: "Your result is in: {{title}}",
    preheader: "{{resultLine}}",
    heading: "Your assignment has been graded",
    paragraphs: ['{{teacher}} has released the result for "{{title}}".', "{{feedbackLine}}"],
    note: "",
    ctaLabel: "See full result",
  },
  sample: { studentName: "Meera Joshi", assignmentTitle: "Unit test 3", score: 18, performanceBand: "Proficient", feedback: "Great work on the diagrams.", teacherName: "Ms. Iyer", schoolName: "Green Valley School" },
  make: (input) => {
    const feedback = input.feedback?.trim();
    return {
      vars: {
        teacher: input.teacherName ?? "Your teacher",
        title: input.assignmentTitle,
        resultLine: input.score != null ? `You scored ${input.score}.` : "Your assignment has been graded.",
        feedbackLine: feedback ? `Feedback: ${feedback}` : "",
      },
      parts: {
        recipientName: input.studentName,
        details: [
          ...(input.score != null ? [{ label: "Score", value: String(input.score) }] : []),
          ...(input.performanceBand ? [{ label: "Performance", value: input.performanceBand }] : []),
        ],
        ctaUrl: appUrl(),
        senderContext: input.schoolName ?? undefined,
        tone: "success",
      },
    };
  },
});

// --- Class join requests ------------------------------------------------------

export const joinRequestReceivedEmail = defineTemplate<{
  teacherName: string;
  studentName: string;
  guardianName: string;
  className: string;
}>({
  key: "join_request_received",
  label: "Join request received",
  group: "Classes",
  description: "Sent to a teacher when a student asks to join their class through the class link.",
  vars: [v("studentName", "The student's name"), v("className", "The class they asked to join")],
  copy: {
    subject: "{{studentName}} asked to join {{className}}",
    preheader: "A join request is waiting for your approval.",
    heading: "New join request",
    paragraphs: ["{{studentName}} used your class link to ask to join {{className}}. Review it in the app - they're only added once you approve."],
    note: "",
    ctaLabel: "Review request",
  },
  sample: { teacherName: "Ms. Iyer", studentName: "Meera Joshi", guardianName: "Anil Joshi", className: "8 A" },
  make: (input) => ({
    vars: { studentName: input.studentName, className: input.className },
    parts: {
      recipientName: input.teacherName,
      details: [
        { label: "Student", value: input.studentName },
        { label: "Guardian", value: input.guardianName },
        { label: "Class", value: input.className },
      ],
      ctaUrl: appUrl(),
    },
  }),
});

type JoinDecidedInput = {
  studentName: string;
  className: string;
  approved: boolean;
  teacherName?: string | null;
  schoolName?: string | null;
  note?: string | null;
  canSignIn: boolean;
};

const joinDecidedVars = [
  v("teacher", "The teacher's name"),
  v("className", "The class"),
  v("signInLine", "How to sign in (approved only)"),
  v("noteLine", "' Note: ...' when the teacher left a note (declined only)"),
];
const joinDecidedSample: JoinDecidedInput = { studentName: "Meera Joshi", className: "8 A", approved: true, teacherName: "Ms. Iyer", schoolName: "Green Valley School", note: "The class is full this term.", canSignIn: true };

const joinApproved = defineTemplate<JoinDecidedInput>({
  key: "join_request_approved",
  label: "Join request approved",
  group: "Classes",
  description: "Sent to a student when their request to join a class is approved.",
  vars: joinDecidedVars,
  copy: {
    subject: "You're in! Welcome to {{className}}",
    preheader: "Your join request was approved.",
    heading: "You've been added to the class",
    paragraphs: ["{{teacher}} approved your request to join {{className}}.", "{{signInLine}}"],
    note: "",
    ctaLabel: "Open EduWand",
  },
  sample: joinDecidedSample,
  make: (input) => ({
    vars: {
      teacher: input.teacherName ?? "Your teacher",
      className: input.className,
      signInLine: input.canSignIn ? "Open the app and sign in with this email address - we'll send you a login code." : "Ask your teacher to add your email so you can sign in.",
      noteLine: "",
    },
    parts: {
      recipientName: input.studentName,
      details: [{ label: "Class", value: input.className }],
      ctaUrl: appUrl(),
      senderContext: input.schoolName ?? undefined,
      tone: "success",
    },
  }),
});

const joinDeclined = defineTemplate<JoinDecidedInput>({
  key: "join_request_declined",
  label: "Join request declined",
  group: "Classes",
  description: "Sent to a student when their request to join a class is not approved.",
  vars: joinDecidedVars,
  copy: {
    subject: "Your request to join {{className}}",
    preheader: "Your join request wasn't approved.",
    heading: "Join request update",
    paragraphs: ["{{teacher}} couldn't add you to {{className}} this time.{{noteLine}}"],
    note: "",
    ctaLabel: "",
  },
  sample: { ...joinDecidedSample, approved: false },
  make: (input) => {
    const note = input.note?.trim();
    return {
      vars: { teacher: input.teacherName ?? "The teacher", className: input.className, signInLine: "", noteLine: note ? ` Note: ${note}` : "" },
      parts: { recipientName: input.studentName, details: [{ label: "Class", value: input.className }], senderContext: input.schoolName ?? undefined, tone: "warning" },
    };
  },
});

export function joinRequestDecidedEmail(input: JoinDecidedInput): RenderedEmail {
  return (input.approved ? joinApproved : joinDeclined)(input);
}

// --- Credits ----------------------------------------------------------------

type CreditsInput = { name: string; balance: number; exhausted: boolean };
const creditsMake = (input: CreditsInput) => ({
  vars: { balance: String(Math.max(0, input.balance)) },
  parts: {
    recipientName: input.name,
    details: [{ label: "Credits left", value: String(Math.max(0, input.balance)) }],
    tone: (input.exhausted ? "alert" : "warning") as "alert" | "warning",
  },
});

const creditsLow = defineTemplate<CreditsInput>({
  key: "credits_low",
  label: "AI credits running low",
  group: "Credits & plans",
  description: "Sent when a teacher's AI credits are almost used up.",
  vars: [v("balance", "Credits left")],
  copy: {
    subject: "Your AI credits are running low",
    preheader: "{{balance}} credits left.",
    heading: "AI credits running low",
    paragraphs: ["You're getting close to using up your AI credits. Contact your school admin or EduWand if you'd like more before they run out."],
    note: "",
    ctaLabel: "",
  },
  sample: { name: "Priya Nair", balance: 40, exhausted: false },
  make: creditsMake,
});

const creditsOut = defineTemplate<CreditsInput>({
  key: "credits_exhausted",
  label: "Out of AI credits",
  group: "Credits & plans",
  description: "Sent when a teacher's AI credits have run out.",
  vars: [v("balance", "Credits left (0)")],
  copy: {
    subject: "You've run out of AI credits",
    preheader: "AI generation is paused until you top up.",
    heading: "You're out of AI credits",
    paragraphs: ["You've used all your AI credits, so lesson plans, presentations and other AI generation are paused. Contact your school admin or EduWand to top up."],
    note: "",
    ctaLabel: "",
  },
  sample: { name: "Priya Nair", balance: 0, exhausted: true },
  make: creditsMake,
});

export function creditsLowEmail(input: CreditsInput): RenderedEmail {
  return (input.exhausted ? creditsOut : creditsLow)(input);
}

// --- Plans (individual teachers) ---------------------------------------------

// Where a teacher signs in on the website to manage their plan. Emails may
// link to it; the mobile app must not (Google Play payments policy).
function billingUrl(): string | undefined {
  // BILLING_URL if set, otherwise the website's /billing page.
  const site = publicWebUrl();
  return process.env.BILLING_URL?.trim() || (site ? `${site}/billing` : undefined);
}

const dateLabel = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

type PlanEndingInput = { name: string; planName: string; kind: string; daysLeft: number; endsAt: Date; credits: number };

const planEndingVars = [v("planName", "The plan's name"), v("days", "'3 days' / '1 day'"), v("endsOn", "The date it ends")];
const planEndingMake = (input: PlanEndingInput) => ({
  vars: { planName: input.planName, days: `${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`, endsOn: dateLabel(input.endsAt) },
  parts: {
    recipientName: input.name,
    details: [
      { label: "Ends on", value: dateLabel(input.endsAt) },
      { label: "Credits this period", value: String(input.credits) },
    ],
    ctaUrl: billingUrl(),
    tone: "warning" as const,
  },
});
const planEndingParagraphs = [
  "Your {{planName}} ends on {{endsOn}}. After that, AI features (lesson plans, presentations, grading and the assistant) pause until you choose a plan. Your classes, students and saved content are not affected.",
  "Credits from this period do not carry over, so use them before it ends.",
];

const planEndingTrial = defineTemplate<PlanEndingInput>({
  key: "plan_ending_trial",
  label: "Free trial ending soon",
  group: "Credits & plans",
  description: "Sent a few days before a teacher's free trial ends.",
  vars: planEndingVars,
  copy: {
    subject: "Your EduWand trial ends in {{days}}",
    preheader: "{{planName}} ends on {{endsOn}}.",
    heading: "Your free trial is ending soon",
    paragraphs: planEndingParagraphs,
    note: "Sign in on the EduWand website with your account to manage your plan.",
    ctaLabel: "Choose a plan",
  },
  sample: { name: "Priya Nair", planName: "Free trial", kind: "trial", daysLeft: 3, endsAt: new Date("2026-10-15"), credits: 5000 },
  make: planEndingMake,
});

const planEndingPaid = defineTemplate<PlanEndingInput>({
  key: "plan_ending_paid",
  label: "Paid plan ending soon",
  group: "Credits & plans",
  description: "Sent a few days before a teacher's paid plan ends.",
  vars: planEndingVars,
  copy: {
    subject: "Your EduWand plan ends in {{days}}",
    preheader: "{{planName}} ends on {{endsOn}}.",
    heading: "Your plan is ending soon",
    paragraphs: planEndingParagraphs,
    note: "Sign in on the EduWand website with your account to manage your plan.",
    ctaLabel: "Choose a plan",
  },
  sample: { name: "Priya Nair", planName: "Teacher Monthly", kind: "paid", daysLeft: 3, endsAt: new Date("2026-10-15"), credits: 5000 },
  make: planEndingMake,
});

export function planEndingEmail(input: PlanEndingInput): RenderedEmail {
  return (input.kind === "trial" ? planEndingTrial : planEndingPaid)(input);
}

type PlanEndedInput = { name: string; planName: string; kind: string };
const planEndedMake = (input: PlanEndedInput) => ({
  vars: { planName: input.planName },
  parts: { recipientName: input.name, ctaUrl: billingUrl(), tone: "alert" as const },
});
const planEndedParagraphs = [
  "Your {{planName}} has ended, so AI features are paused. Your classes, students and saved content are all still there, and everything else keeps working.",
  "Choose a plan to switch AI features back on.",
];

const planEndedTrial = defineTemplate<PlanEndedInput>({
  key: "plan_ended_trial",
  label: "Free trial ended",
  group: "Credits & plans",
  description: "Sent when a teacher's free trial has ended.",
  vars: [v("planName", "The plan's name")],
  copy: {
    subject: "Your EduWand trial has ended",
    preheader: "AI features are paused until you choose a plan.",
    heading: "Your free trial has ended",
    paragraphs: planEndedParagraphs,
    note: "Sign in on the EduWand website with your account to manage your plan.",
    ctaLabel: "Choose a plan",
  },
  sample: { name: "Priya Nair", planName: "Free trial", kind: "trial" },
  make: planEndedMake,
});

const planEndedPaid = defineTemplate<PlanEndedInput>({
  key: "plan_ended_paid",
  label: "Paid plan ended",
  group: "Credits & plans",
  description: "Sent when a teacher's paid plan has ended.",
  vars: [v("planName", "The plan's name")],
  copy: {
    subject: "Your EduWand plan has ended",
    preheader: "AI features are paused until you choose a plan.",
    heading: "Your plan has ended",
    paragraphs: planEndedParagraphs,
    note: "Sign in on the EduWand website with your account to manage your plan.",
    ctaLabel: "Choose a plan",
  },
  sample: { name: "Priya Nair", planName: "Teacher Monthly", kind: "paid" },
  make: planEndedMake,
});

export function planEndedEmail(input: PlanEndedInput): RenderedEmail {
  return (input.kind === "trial" ? planEndedTrial : planEndedPaid)(input);
}

export const invoiceEmail = defineTemplate<{
  name: string;
  invoice: {
    number: string;
    description: string;
    periodStart: Date;
    periodEnd: Date;
    gstRegistered: boolean;
    taxRatePercent: number;
    taxableValuePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalPaise: number;
    seller: unknown;
  };
}>({
  key: "invoice",
  label: "Payment received (invoice)",
  group: "Credits & plans",
  description: "Sent after a teacher pays for a plan, with the invoice details.",
  vars: [
    v("number", "The invoice number"),
    v("endsOn", "When the plan is paid up to"),
    v("invoiceKind", "'GST tax invoice' or 'invoice'"),
    v("sellerLine", "' from <seller> (GSTIN ...)' when known"),
  ],
  copy: {
    subject: "Payment received - invoice {{number}}",
    preheader: "Thanks! Your plan is active until {{endsOn}}.",
    heading: "Payment received",
    paragraphs: [
      "Thank you - your payment went through and your plan is active until {{endsOn}}. AI features are switched on and your credits have been added.",
      "This is your {{invoiceKind}}{{sellerLine}}.",
    ],
    note: "You can download the PDF invoice any time from your plan page on the EduWand website.",
    ctaLabel: "View invoice",
  },
  sample: {
    name: "Priya Nair",
    invoice: {
      number: "EW-2026-0042",
      description: "Teacher Monthly",
      periodStart: new Date("2026-10-01"),
      periodEnd: new Date("2026-10-31"),
      gstRegistered: true,
      taxRatePercent: 18,
      taxableValuePaise: 423729,
      cgstPaise: 38135,
      sgstPaise: 38136,
      igstPaise: 0,
      totalPaise: 500000,
      seller: { legalName: "EduWand" },
    },
  },
  make: (input) => {
    const { invoice } = input;
    const money = (paise: number) => `Rs ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const seller = invoice.seller as { legalName?: string; gstin?: string };
    return {
      vars: {
        number: invoice.number,
        endsOn: dateLabel(invoice.periodEnd),
        invoiceKind: invoice.gstRegistered ? "GST tax invoice" : "invoice",
        sellerLine: `${seller.legalName ? ` from ${seller.legalName}` : ""}${seller.gstin ? ` (GSTIN ${seller.gstin})` : ""}`,
      },
      parts: {
        recipientName: input.name,
        details: [
          { label: "Invoice number", value: invoice.number },
          { label: "Plan", value: invoice.description },
          { label: "Period", value: `${dateLabel(invoice.periodStart)} to ${dateLabel(invoice.periodEnd)}` },
          { label: invoice.gstRegistered ? "Taxable value" : "Amount", value: money(invoice.taxableValuePaise) },
          ...(invoice.gstRegistered
            ? invoice.igstPaise > 0
              ? [{ label: `IGST @ ${invoice.taxRatePercent}%`, value: money(invoice.igstPaise) }]
              : [
                  { label: `CGST @ ${invoice.taxRatePercent / 2}%`, value: money(invoice.cgstPaise) },
                  { label: `SGST @ ${invoice.taxRatePercent / 2}%`, value: money(invoice.sgstPaise) },
                ]
            : []),
          { label: "Total paid", value: money(invoice.totalPaise) },
        ],
        ctaUrl: billingUrl(),
        tone: "success",
      },
    };
  },
});

// --- AI spend limits (platform admins) ------------------------------------------

type AiLimitInput = { name: string; period: string; percent: 80 | 100; spentInr: number; limitInr: number; limitName: string };
const aiLimitVars = [v("spent", "Amount spent, e.g. ₹850"), v("limit", "The limit, e.g. ₹1000"), v("period", "The period, e.g. today"), v("limitName", "Which limit, e.g. daily limit")];
const aiLimitMake = (input: AiLimitInput) => ({
  vars: { spent: `₹${input.spentInr}`, limit: `₹${input.limitInr}`, period: input.period, limitName: input.limitName },
  parts: {
    recipientName: input.name,
    details: [
      { label: "Spent", value: `₹${input.spentInr}` },
      { label: "Limit", value: `₹${input.limitInr}` },
    ],
    tone: (input.percent === 100 ? "alert" : "warning") as "alert" | "warning",
  },
});
const aiLimitSample: AiLimitInput = { name: "Platform admin", period: "today", percent: 80, spentInr: 800, limitInr: 1000, limitName: "daily AI spend limit" };

const aiLimitWarning = defineTemplate<AiLimitInput>({
  key: "ai_limit_warning",
  label: "AI spend at 80% of limit",
  group: "Admin alerts",
  description: "Sent to platform admins when AI spend reaches 80% of a limit.",
  vars: aiLimitVars,
  copy: {
    subject: "AI spend is at 80% of its limit",
    preheader: "{{spent}} of {{limit}} used {{period}}.",
    heading: "AI spend nearing its limit",
    paragraphs: ["AI spend has reached 80% of the {{limitName}} {{period}}. Requests keep working, but will be refused once the limit is hit."],
    note: "",
    ctaLabel: "",
  },
  sample: aiLimitSample,
  make: aiLimitMake,
});

const aiLimitReached = defineTemplate<AiLimitInput>({
  key: "ai_limit_reached",
  label: "AI spend limit reached",
  group: "Admin alerts",
  description: "Sent to platform admins when an AI spend limit is hit and AI pauses.",
  vars: aiLimitVars,
  copy: {
    subject: "AI spend limit reached - AI is paused",
    preheader: "{{spent}} of {{limit}} used {{period}}.",
    heading: "AI spend limit reached",
    paragraphs: ["The {{limitName}} has been reached {{period}}, so new AI requests are being refused until the period resets or you raise the limit in the admin panel (AI Limits)."],
    note: "",
    ctaLabel: "",
  },
  sample: { ...aiLimitSample, percent: 100, spentInr: 1000 },
  make: aiLimitMake,
});

export function aiLimitEmail(input: AiLimitInput): RenderedEmail {
  return (input.percent === 100 ? aiLimitReached : aiLimitWarning)(input);
}

// --- School-authored follow-ups ----------------------------------------------

// Wraps a school's own follow-up template text in the branded layout so it
// still looks like it came from them. The wording is the school's, so it is not
// one of the editable templates.
export function followUpEmail(input: { body: string; recipientName?: string | null; schoolName?: string | null }): RenderedEmail {
  const paragraphs = input.body
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return renderEmail(input.schoolName ? `A message from ${input.schoolName}` : "A message from your school", {
    heading: input.schoolName ? `A message from ${input.schoolName}` : "A message for you",
    recipientName: input.recipientName ?? undefined,
    paragraphs,
    senderContext: input.schoolName ?? undefined,
  });
}

// Sent instead of a sign-up code when someone signs up with an email that already
// has an account - keeps the sign-up form from revealing who is registered.
export const accountExistsEmail = defineTemplate<{ name?: string }>({
  key: "account_exists",
  label: "Account already exists",
  group: "Accounts",
  description: "Sent instead of a sign-up code when the email already has an account.",
  vars: [],
  copy: {
    subject: "You already have an EduWand account",
    preheader: "Someone tried to create a new account with your email.",
    heading: "You already have an account",
    paragraphs: [
      "Someone tried to create a new EduWand workspace with this email address, but you already have an account.",
      "Sign in with your email and password. If you've forgotten your password, use Forgot password on the sign-in screen to reset it.",
    ],
    note: "If this wasn't you, you can ignore this email - nothing has changed on your account.",
    ctaLabel: "Open EduWand",
  },
  sample: { name: "Priya Nair" },
  make: (input) => ({ vars: {}, parts: { recipientName: input.name, ctaUrl: appUrl() } }),
});

// --- Website ------------------------------------------------------------------

// Sent to the visitor straight after they submit the Contact form.
export const websiteEnquiryReceivedEmail = defineTemplate<{ name: string; subject?: string | null }>({
  key: "website_enquiry_received",
  label: "Contact form: thanks",
  group: "Website",
  description: "Sent to a visitor straight after they send a message through the website's Contact form.",
  vars: [v("aboutLine", "' about \"<their subject>\"' when they gave a subject, otherwise empty")],
  copy: {
    subject: "We got your message - EduWand",
    preheader: "Thanks for reaching out. Our team will reply shortly.",
    heading: "Thanks for getting in touch",
    paragraphs: [
      "We have received your message{{aboutLine}}. A member of the EduWand team will reply to this email address shortly.",
      "In the meantime you can reply to this email if you want to add anything.",
    ],
    note: "You are receiving this because this address was used on the EduWand contact form. If that was not you, you can ignore this email.",
    ctaLabel: "",
  },
  sample: { name: "Rajesh Sharma", subject: "Multi-campus pricing" },
  make: (input) => ({
    vars: { aboutLine: input.subject ? ` about "${input.subject}"` : "" },
    parts: { recipientName: input.name, tone: "success" },
  }),
});

// Sent to the EduWand team (CONTACT_NOTIFY_EMAIL) when a message arrives.
export const websiteEnquiryNotifyEmail = defineTemplate<{
  name: string;
  email: string;
  schoolName?: string | null;
  role?: string | null;
  subject?: string | null;
  message: string;
}>({
  key: "website_enquiry_notify",
  label: "Contact form: team alert",
  group: "Website",
  description: "Sent to the EduWand team when someone uses the Contact form or joins the waitlist.",
  vars: [v("name", "Who sent it"), v("message", "Their message")],
  copy: {
    subject: "New website enquiry from {{name}}",
    preheader: "{{message}}",
    heading: "New website enquiry",
    paragraphs: ["{{message}}"],
    note: "Open the admin dashboard, Website enquiries, to follow it up and track it.",
    ctaLabel: "",
  },
  sample: { name: "Rajesh Sharma", email: "rajesh@school.edu", schoolName: "DPS International", role: "leadership", subject: "Multi-campus pricing", message: "Hello, do you have multi-campus pricing?" },
  make: (input) => ({
    vars: { name: input.name, message: input.message },
    parts: {
      details: [
        { label: "Name", value: input.name },
        { label: "Email", value: input.email },
        ...(input.schoolName ? [{ label: "School", value: input.schoolName }] : []),
        ...(input.role ? [{ label: "Role", value: input.role }] : []),
        ...(input.subject ? [{ label: "Subject", value: input.subject }] : []),
      ],
    },
  }),
});

// Sent when someone joins the website waitlist.
export const waitlistJoinedEmail = defineTemplate<{ roleLabel: string }>({
  key: "waitlist_joined",
  label: "Waitlist: you're on the list",
  group: "Website",
  description: "Sent when someone joins the waitlist from the website's home page.",
  vars: [v("role", "What they signed up as, in lower case, e.g. teacher")],
  copy: {
    subject: "You are on the EduWand waitlist",
    preheader: "Thanks for joining. We will be in touch with early access details.",
    heading: "You are on the list",
    paragraphs: [
      "Thanks for requesting priority access to EduWand as a {{role}}. We have saved your spot.",
      "We will email you with onboarding details as soon as access opens. There is nothing else you need to do.",
    ],
    note: "You are receiving this because this address was entered on the EduWand website. If that was not you, you can ignore this email.",
    ctaLabel: "",
  },
  sample: { roleLabel: "Teacher" },
  make: (input) => ({ vars: { role: input.roleLabel.toLowerCase() }, parts: { tone: "success" } }),
});

export { classLabel };
