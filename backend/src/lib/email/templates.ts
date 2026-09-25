import { publicWebUrl, renderEmail, type RenderedEmail } from "./layout";

// Every EduWand email is built here. Each template takes the facts about the
// event and the recipient (name, school, teacher, class, ...) so the message
// reads as written for that person, then hands the wording to renderEmail for
// the shared branded layout.

// Optional link to open/download the app - set APP_URL (store page or a
// universal link). Without it, emails simply omit the button.
function appCta(label: string): { label: string; url: string } | undefined {
  const url = process.env.APP_URL?.trim();
  return url ? { label, url } : undefined;
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

// --- Sign-in / sign-up codes ------------------------------------------------

export type CodePurpose = "student_login" | "teacher_signup" | "password_reset";

export function loginCodeEmail(input: { name?: string; code: string; purpose: CodePurpose; schoolName?: string | null }): RenderedEmail {
  const copy = {
    student_login: {
      subject: `${input.code} is your EduWand login code`,
      heading: "Your login code",
      intro: "Use this code to sign in to your EduWand student account.",
    },
    teacher_signup: {
      subject: `${input.code} is your EduWand verification code`,
      heading: "Verify your email",
      intro: "Enter this code in the app to confirm your email and finish creating your workspace.",
    },
    password_reset: {
      subject: `${input.code} is your EduWand password reset code`,
      heading: "Reset your password",
      intro: "Enter this code in the app, then choose a new password.",
    },
  }[input.purpose];

  return renderEmail(copy.subject, {
    preheader: `Your code is ${input.code}. It expires in 5 minutes.`,
    heading: copy.heading,
    recipientName: input.name,
    paragraphs: [copy.intro],
    code: input.code,
    note: "This code expires in 5 minutes. Never share it with anyone - EduWand will never ask you for it.",
    senderContext: input.schoolName ?? undefined,
  });
}

// --- Staff accounts ---------------------------------------------------------

export function staffInviteEmail(input: {
  name: string;
  email: string;
  role: string;
  schoolName?: string | null;
  invitedByName?: string | null;
  tempPassword: string;
}): RenderedEmail {
  const roleLabel = ROLE_LABELS[input.role] ?? input.role;
  const where = input.schoolName ?? "EduWand";
  return renderEmail(`You've been invited to ${where} on EduWand`, {
    preheader: `${input.invitedByName ?? "Your school"} added you as ${roleLabel}.`,
    heading: `Welcome to ${where}`,
    recipientName: input.name,
    paragraphs: [
      `${input.invitedByName ?? "Your school"} has added you to ${where} on EduWand as ${roleLabel}. Sign in with the details below.`,
    ],
    details: [
      { label: "Email", value: input.email },
      { label: "Temporary password", value: input.tempPassword },
      { label: "Role", value: roleLabel },
    ],
    cta: appCta("Open EduWand"),
    note: "For your security, change this temporary password after you first sign in (Profile → Change password).",
    senderContext: input.schoolName ?? undefined,
  });
}

export function adminPasswordResetEmail(input: {
  name: string;
  email: string;
  tempPassword: string;
  resetByName?: string | null;
  schoolName?: string | null;
}): RenderedEmail {
  return renderEmail("Your EduWand password was reset", {
    preheader: "A temporary password has been set for your account.",
    heading: "Your password was reset",
    recipientName: input.name,
    paragraphs: [
      `${input.resetByName ?? "An administrator"} reset the password for your EduWand account. Use the temporary password below to sign in.`,
    ],
    details: [
      { label: "Email", value: input.email },
      { label: "Temporary password", value: input.tempPassword },
    ],
    cta: appCta("Open EduWand"),
    note: "Please change this password right after you sign in. If you weren't expecting this, contact your school admin.",
    senderContext: input.schoolName ?? undefined,
  });
}

export function teacherWelcomeEmail(input: { name: string; workspaceName: string; credits?: number | null }): RenderedEmail {
  return renderEmail(`Welcome to EduWand, ${input.name.split(/\s+/)[0]}!`, {
    preheader: `Your workspace "${input.workspaceName}" is ready.`,
    heading: "Your workspace is ready",
    tone: "success",
    recipientName: input.name,
    paragraphs: [
      `Your email is verified and "${input.workspaceName}" is set up. Here's a quick way to get going: add your classes, invite students, then create your first lesson plan or presentation with AI.`,
    ],
    details: input.credits != null ? [{ label: "Starting AI credits", value: String(input.credits) }] : undefined,
    cta: appCta("Open EduWand"),
    note: "You can sign in from now on with your email and password.",
    senderContext: input.workspaceName,
  });
}

// --- Security ---------------------------------------------------------------

export function securityAlertEmail(input: {
  name?: string;
  event: "password_changed" | "password_reset_completed" | "account_deleted";
}): RenderedEmail {
  const copy = {
    password_changed: {
      subject: "Your EduWand password was changed",
      heading: "Password changed",
      tone: "warning",
      body: "The password for your EduWand account was just changed.",
    },
    password_reset_completed: {
      subject: "Your EduWand password was reset",
      heading: "Password reset complete",
      body: "Your EduWand password was reset using an emailed code.",
    },
    account_deleted: {
      subject: "Your EduWand account was deleted",
      heading: "Account deleted",
      body: "Your EduWand account has been deleted and your personal details have been removed, as you requested.",
    },
  }[input.event];

  return renderEmail(copy.subject, {
    preheader: copy.body,
    heading: copy.heading,
    recipientName: input.name,
    paragraphs: [copy.body],
    note:
      input.event === "account_deleted"
        ? "If you didn't do this, contact support straight away."
        : "If this wasn't you, reset your password immediately and contact your school admin or support.",
  });
}

// --- Students ---------------------------------------------------------------

export function studentEmailChangedEmail(input: {
  studentName: string;
  oldEmail?: string | null;
  newEmail: string;
  audience: "old" | "new";
  schoolName?: string | null;
}): RenderedEmail {
  const isOld = input.audience === "old";
  return renderEmail(isOld ? "Your EduWand sign-in email was changed" : "Your EduWand sign-in email is now this address", {
    preheader: isOld ? "Your school changed the email used to sign in." : "You can now sign in to EduWand with this address.",
    heading: isOld ? "Sign-in email changed" : "You can sign in with this email",
    recipientName: input.studentName,
    paragraphs: isOld
      ? [`The email used to sign in to ${input.studentName}'s EduWand account was changed to ${input.newEmail}. Login codes will now be sent there instead.`]
      : [`This email address is now linked to ${input.studentName}'s EduWand student account. Enter it in the app and we'll send you a login code each time you sign in.`],
    cta: isOld ? undefined : appCta("Open EduWand"),
    note: isOld ? "If you didn't expect this, please contact your school." : undefined,
    senderContext: input.schoolName ?? undefined,
  });
}

export function materialSharedEmail(input: {
  studentName: string;
  teacherName?: string | null;
  topicName: string;
  subject?: string | null;
  outputType: string;
  className?: string | null;
  schoolName?: string | null;
}): RenderedEmail {
  const typeLabel = OUTPUT_TYPE_LABELS[input.outputType] ?? "Material";
  const from = input.teacherName ?? "Your teacher";
  return renderEmail(`New ${typeLabel.toLowerCase()}: ${input.topicName}`, {
    preheader: `${from} shared ${input.topicName} with you.`,
    heading: "New study material for you",
    recipientName: input.studentName,
    paragraphs: [`${from} has shared something new with you. Open the Materials tab in the app to read it.`],
    details: [
      { label: "Topic", value: input.topicName },
      { label: "Type", value: typeLabel },
      ...(input.subject ? [{ label: "Subject", value: input.subject }] : []),
      ...(input.className ? [{ label: "Class", value: input.className }] : []),
    ],
    cta: appCta("Open Materials"),
    senderContext: input.schoolName ?? undefined,
  });
}

export function assignmentPublishedEmail(input: {
  studentName: string;
  title: string;
  teacherName?: string | null;
  className?: string | null;
  questionCount?: number;
  schoolName?: string | null;
}): RenderedEmail {
  const from = input.teacherName ?? "Your teacher";
  return renderEmail(`New assignment: ${input.title}`, {
    preheader: `${from} posted a new assignment.`,
    heading: "You have a new assignment",
    recipientName: input.studentName,
    paragraphs: [`${from} posted an assignment for you. You can answer it in the app.`],
    details: [
      { label: "Assignment", value: input.title },
      ...(input.className ? [{ label: "Class", value: input.className }] : []),
      ...(input.questionCount ? [{ label: "Questions", value: String(input.questionCount) }] : []),
    ],
    cta: appCta("Open assignment"),
    senderContext: input.schoolName ?? undefined,
  });
}

export function gradeReleasedEmail(input: {
  studentName: string;
  assignmentTitle: string;
  score: number | null;
  performanceBand?: string | null;
  feedback?: string | null;
  teacherName?: string | null;
  schoolName?: string | null;
}): RenderedEmail {
  const feedback = input.feedback?.trim();
  return renderEmail(`Your result is in: ${input.assignmentTitle}`, {
    preheader: input.score != null ? `You scored ${input.score}.` : "Your assignment has been graded.",
    heading: "Your assignment has been graded",
    tone: "success",
    recipientName: input.studentName,
    paragraphs: [
      `${input.teacherName ?? "Your teacher"} has released the result for "${input.assignmentTitle}".`,
      ...(feedback ? [`Feedback: ${feedback}`] : []),
    ],
    details: [
      ...(input.score != null ? [{ label: "Score", value: String(input.score) }] : []),
      ...(input.performanceBand ? [{ label: "Performance", value: input.performanceBand }] : []),
    ],
    cta: appCta("See full result"),
    senderContext: input.schoolName ?? undefined,
  });
}

// --- Class join requests ------------------------------------------------------

export function joinRequestReceivedEmail(input: {
  teacherName: string;
  studentName: string;
  guardianName: string;
  className: string;
}): RenderedEmail {
  return renderEmail(`${input.studentName} asked to join ${input.className}`, {
    preheader: "A join request is waiting for your approval.",
    heading: "New join request",
    recipientName: input.teacherName,
    paragraphs: [`${input.studentName} used your class link to ask to join ${input.className}. Review it in the app - they're only added once you approve.`],
    details: [
      { label: "Student", value: input.studentName },
      { label: "Guardian", value: input.guardianName },
      { label: "Class", value: input.className },
    ],
    cta: appCta("Review request"),
  });
}

export function joinRequestDecidedEmail(input: {
  studentName: string;
  className: string;
  approved: boolean;
  teacherName?: string | null;
  schoolName?: string | null;
  note?: string | null;
  canSignIn: boolean;
}): RenderedEmail {
  const note = input.note?.trim();
  return renderEmail(
    input.approved ? `You're in! Welcome to ${input.className}` : `Your request to join ${input.className}`,
    {
      preheader: input.approved ? "Your join request was approved." : "Your join request wasn't approved.",
      heading: input.approved ? "You've been added to the class" : "Join request update",
      tone: input.approved ? "success" : "warning",
      recipientName: input.studentName,
      paragraphs: input.approved
        ? [
            `${input.teacherName ?? "Your teacher"} approved your request to join ${input.className}.`,
            input.canSignIn
              ? "Open the app and sign in with this email address - we'll send you a login code."
              : "Ask your teacher to add your email so you can sign in.",
          ]
        : [`${input.teacherName ?? "The teacher"} couldn't add you to ${input.className} this time.${note ? ` Note: ${note}` : ""}`],
      details: [{ label: "Class", value: input.className }],
      cta: input.approved ? appCta("Open EduWand") : undefined,
      senderContext: input.schoolName ?? undefined,
    }
  );
}

// --- Credits ----------------------------------------------------------------

export function creditsLowEmail(input: { name: string; balance: number; exhausted: boolean }): RenderedEmail {
  return renderEmail(input.exhausted ? "You've run out of AI credits" : "Your AI credits are running low", {
    preheader: input.exhausted ? "AI generation is paused until you top up." : `${input.balance} credits left.`,
    heading: input.exhausted ? "You're out of AI credits" : "AI credits running low",
    tone: input.exhausted ? "alert" : "warning",
    recipientName: input.name,
    paragraphs: [
      input.exhausted
        ? "You've used all your AI credits, so lesson plans, presentations and other AI generation are paused. Contact your school admin or EduWand to top up."
        : "You're getting close to using up your AI credits. Contact your school admin or EduWand if you'd like more before they run out.",
    ],
    details: [{ label: "Credits left", value: String(Math.max(0, input.balance)) }],
  });
}

// --- Plans (individual teachers) ---------------------------------------------

// Where a teacher signs in on the website to manage their plan. Emails may
// link to it; the mobile app must not (Google Play payments policy).
function billingCta(label: string): { label: string; url: string } | undefined {
  // BILLING_URL if set, otherwise the website's /billing page.
  const site = publicWebUrl();
  const url = process.env.BILLING_URL?.trim() || (site ? `${site}/billing` : "");
  return url ? { label, url } : undefined;
}

const dateLabel = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function planEndingEmail(input: { name: string; planName: string; kind: string; daysLeft: number; endsAt: Date; credits: number }): RenderedEmail {
  const days = `${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`;
  const isTrial = input.kind === "trial";
  return renderEmail(isTrial ? `Your EduWand trial ends in ${days}` : `Your EduWand plan ends in ${days}`, {
    preheader: `${input.planName} ends on ${dateLabel(input.endsAt)}.`,
    heading: isTrial ? "Your free trial is ending soon" : "Your plan is ending soon",
    tone: "warning",
    recipientName: input.name,
    paragraphs: [
      `Your ${input.planName} ends on ${dateLabel(input.endsAt)}. After that, AI features (lesson plans, presentations, grading and the assistant) pause until you choose a plan. Your classes, students and saved content are not affected.`,
      "Credits from this period do not carry over, so use them before it ends.",
    ],
    details: [
      { label: "Ends on", value: dateLabel(input.endsAt) },
      { label: "Credits this period", value: String(input.credits) },
    ],
    cta: billingCta("Choose a plan"),
    note: "Sign in on the EduWand website with your account to manage your plan.",
  });
}

export function planEndedEmail(input: { name: string; planName: string; kind: string }): RenderedEmail {
  return renderEmail(input.kind === "trial" ? "Your EduWand trial has ended" : "Your EduWand plan has ended", {
    preheader: "AI features are paused until you choose a plan.",
    heading: input.kind === "trial" ? "Your free trial has ended" : "Your plan has ended",
    tone: "alert",
    recipientName: input.name,
    paragraphs: [
      `Your ${input.planName} has ended, so AI features are paused. Your classes, students and saved content are all still there, and everything else keeps working.`,
      "Choose a plan to switch AI features back on.",
    ],
    cta: billingCta("Choose a plan"),
    note: "Sign in on the EduWand website with your account to manage your plan.",
  });
}

export function invoiceEmail(input: {
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
}): RenderedEmail {
  const { invoice } = input;
  const money = (paise: number) => `Rs ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const seller = invoice.seller as { legalName?: string; gstin?: string };
  const details = [
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
  ];
  return renderEmail(`Payment received - invoice ${invoice.number}`, {
    preheader: `Thanks! Your plan is active until ${dateLabel(invoice.periodEnd)}.`,
    heading: "Payment received",
    tone: "success",
    recipientName: input.name,
    paragraphs: [
      `Thank you - your payment went through and your plan is active until ${dateLabel(invoice.periodEnd)}. AI features are switched on and your credits have been added.`,
      `This is your ${invoice.gstRegistered ? "GST tax invoice" : "invoice"}${seller.legalName ? ` from ${seller.legalName}` : ""}${seller.gstin ? ` (GSTIN ${seller.gstin})` : ""}.`,
    ],
    details,
    cta: billingCta("View invoice"),
    note: "You can download the PDF invoice any time from your plan page on the EduWand website.",
  });
}

// --- AI spend limits (platform admins) ------------------------------------------

export function aiLimitEmail(input: {
  name: string;
  period: string;
  percent: 80 | 100;
  spentInr: number;
  limitInr: number;
  limitName: string;
}): RenderedEmail {
  const reached = input.percent === 100;
  return renderEmail(reached ? "AI spend limit reached - AI is paused" : "AI spend is at 80% of its limit", {
    preheader: `₹${input.spentInr} of ₹${input.limitInr} used ${input.period}.`,
    heading: reached ? "AI spend limit reached" : "AI spend nearing its limit",
    tone: reached ? "alert" : "warning",
    recipientName: input.name,
    paragraphs: [
      reached
        ? `The ${input.limitName} has been reached ${input.period}, so new AI requests are being refused until the period resets or you raise the limit in the admin panel (AI Limits).`
        : `AI spend has reached 80% of the ${input.limitName} ${input.period}. Requests keep working, but will be refused once the limit is hit.`,
    ],
    details: [
      { label: "Spent", value: `₹${input.spentInr}` },
      { label: "Limit", value: `₹${input.limitInr}` },
    ],
  });
}

// --- School-authored follow-ups ----------------------------------------------

// Wraps a school's own follow-up template text in the branded layout so it
// still looks like it came from them.
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
export function accountExistsEmail(input: { name?: string }): RenderedEmail {
  return renderEmail("You already have an EduWand account", {
    preheader: "Someone tried to create a new account with your email.",
    heading: "You already have an account",
    recipientName: input.name,
    paragraphs: [
      "Someone tried to create a new EduWand workspace with this email address, but you already have an account.",
      "Sign in with your email and password. If you've forgotten your password, use Forgot password on the sign-in screen to reset it.",
    ],
    cta: appCta("Open EduWand"),
    note: "If this wasn't you, you can ignore this email - nothing has changed on your account.",
  });
}

export { classLabel };
