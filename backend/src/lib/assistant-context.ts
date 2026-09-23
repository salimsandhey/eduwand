import { prisma } from "./prisma";
import { hasAnyRole } from "./rbac";
import { AppJwtPayload } from "../types/fastify-jwt";

// The in-app assistant is mobile-only, and the mobile app picks its navigator
// from user.role alone (unified-app AppNavigator MainTabs) - so the assistant
// role is user.role too, not the additive UserRoleGrant set. Admin/principal/
// leadership are web-only and get no assistant.
export type AssistantRole = "counsellor" | "front_desk" | "teacher" | "student";

const ASSISTANT_ROLES: AssistantRole[] = ["counsellor", "front_desk", "teacher", "student"];

export function resolveAssistantRole(user: AppJwtPayload): AssistantRole | null {
  return ASSISTANT_ROLES.includes(user.role as AssistantRole) ? (user.role as AssistantRole) : null;
}

// Same rule as isOwnershipRestricted in routes/enquiries.ts: a counsellor sees
// only their own leads unless a role grant also gives broader admissions access.
export async function isLeadOwnershipRestricted(user: AppJwtPayload): Promise<boolean> {
  if (!(await hasAnyRole(user, "counsellor", "teacher"))) return false;
  return !(await hasAnyRole(user, "admin", "front_desk", "principal"));
}

// Calendar-day boundaries in India Standard Time (UTC+05:30) - the day the
// user actually means by "today" / "overdue", independent of the server's TZ.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istDayBounds(now = new Date()): { startOfToday: Date; startOfTomorrow: Date } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const startShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const startOfToday = new Date(startShifted - IST_OFFSET_MS);
  return { startOfToday, startOfTomorrow: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) };
}

export function formatIst(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function loadAssistantIdentity(
  user: AppJwtPayload,
  schoolId: string,
  role: AssistantRole
): Promise<{ fullName: string; schoolName: string }> {
  const [person, school] = await Promise.all([
    role === "student"
      ? prisma.studentStub.findFirst({ where: { id: user.sub, schoolId }, select: { fullName: true } })
      : prisma.appUser.findUnique({ where: { id: user.sub }, select: { fullName: true } }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
  ]);
  return { fullName: person?.fullName ?? "the user", schoolName: school?.name ?? "the school" };
}

async function followUpBullets(user: AppJwtPayload, schoolId: string): Promise<string[]> {
  const { startOfToday, startOfTomorrow } = istDayBounds();
  const base = { assignedToUserId: user.sub, status: "pending", enquiry: { schoolId } };
  const [overdue, dueToday, upcoming] = await Promise.all([
    prisma.followUpTask.count({ where: { ...base, dueAt: { lt: startOfToday } } }),
    prisma.followUpTask.count({ where: { ...base, dueAt: { gte: startOfToday, lt: startOfTomorrow } } }),
    prisma.followUpTask.count({ where: { ...base, dueAt: { gte: startOfTomorrow } } }),
  ]);
  return [`Follow-up tasks assigned to them (pending): ${overdue} overdue, ${dueToday} due today, ${upcoming} upcoming.`];
}

async function leadBullets(user: AppJwtPayload, schoolId: string): Promise<string[]> {
  const restricted = await isLeadOwnershipRestricted(user);
  const [grouped, stages] = await Promise.all([
    prisma.enquiry.groupBy({
      by: ["status"],
      where: { schoolId, erasedAt: null, ...(restricted ? { ownerUserId: user.sub } : {}) },
      _count: { _all: true },
    }),
    prisma.pipelineStage.findMany({ where: { schoolId }, select: { key: true, label: true, isTerminal: true } }),
  ]);
  const stageByKey = new Map(stages.map((s) => [s.key, s]));
  const isTerminal = (key: string) => stageByKey.get(key)?.isTerminal ?? ["lost", "admitted"].includes(key);
  const open = grouped.filter((g) => !isTerminal(g.status));
  const openTotal = open.reduce((sum, g) => sum + g._count._all, 0);
  const breakdown = open.map((g) => `${stageByKey.get(g.status)?.label ?? g.status}: ${g._count._all}`).join(", ");
  const scope = restricted ? "Their own open leads" : "Open leads across the school";
  return [`${scope}: ${openTotal}${breakdown ? ` (${breakdown})` : ""}.`];
}

async function teacherBullets(user: AppJwtPayload, schoolId: string): Promise<string[]> {
  const [classes, topicCount, publishedCount, draftCount, submissions] = await Promise.all([
    prisma.classSection.findMany({
      where: { teacherAssignments: { some: { teacherUserId: user.sub } }, isActive: true, academicYear: { schoolId } },
      select: { className: true, sectionName: true },
      orderBy: [{ className: "asc" }, { sectionName: "asc" }],
    }),
    prisma.topic.count({ where: { schoolId, teacherUserId: user.sub, status: "active" } }),
    prisma.assignment.count({ where: { schoolId, teacherUserId: user.sub, status: "published" } }),
    prisma.assignment.count({ where: { schoolId, teacherUserId: user.sub, status: "draft" } }),
    prisma.submission.findMany({
      where: { assignment: { schoolId, teacherUserId: user.sub, status: "published" } },
      select: { grade: { select: { releasedToStudent: true } } },
    }),
  ]);
  const notGraded = submissions.filter((s) => !s.grade).length;
  const notReleased = submissions.filter((s) => s.grade && !s.grade.releasedToStudent).length;
  const account = await prisma.teacherCreditAccount.findUnique({ where: { teacherUserId: user.sub } });
  return [
    `Classes they teach: ${classes.length ? classes.map((c) => `${c.className}-${c.sectionName}`).join(", ") : "none yet"}.`,
    `Active topics: ${topicCount}. Published assignments: ${publishedCount}. Draft assignments: ${draftCount}.`,
    `Student submissions on their published assignments: ${notGraded} not graded yet, ${notReleased} graded but results not released to students.`,
    `AI credits remaining: ${account?.balance ?? 0}.`,
  ];
}

async function studentBullets(user: AppJwtPayload, schoolId: string): Promise<string[]> {
  const student = await prisma.studentStub.findFirst({
    where: { id: user.sub, schoolId },
    include: { classSection: { select: { className: true, sectionName: true } } },
  });
  if (!student) return ["No student profile was found."];
  const assignments = await prisma.assignment.findMany({
    where: { schoolId, classSectionId: student.classSectionId, status: "published" },
    select: { title: true, submissions: { where: { studentStubId: student.id }, select: { grade: { select: { releasedToStudent: true } } } } },
  });
  const notSubmitted = assignments.filter((a) => a.submissions.length === 0);
  const submitted = assignments.filter((a) => a.submissions.length > 0 && !a.submissions[0].grade?.releasedToStudent);
  const graded = assignments.filter((a) => a.submissions[0]?.grade?.releasedToStudent);
  const pending = notSubmitted.slice(0, 5).map((a) => `"${a.title}"`).join(", ");
  return [
    `Class: ${student.classSection.className}-${student.classSection.sectionName}.`,
    `Assignments to do (not submitted yet): ${notSubmitted.length}${pending ? ` - ${pending}${notSubmitted.length > 5 ? ", ..." : ""}` : ""}.`,
    `Submitted and waiting for results: ${submitted.length}. Results available: ${graded.length}.`,
  ];
}

// Short bullet summary of the user's own current data, dropped into the system
// prompt so most questions ("what's overdue?") need no tool call at all. Every
// query is scoped to the user (or, for students, their own StudentStub) - no
// visibility beyond what the app's own routes already give that role.
export async function buildAssistantContext(user: AppJwtPayload, schoolId: string, role: AssistantRole): Promise<string> {
  const bullets =
    role === "student"
      ? await studentBullets(user, schoolId)
      : role === "teacher"
        ? await teacherBullets(user, schoolId)
        : [...(await followUpBullets(user, schoolId)), ...(await leadBullets(user, schoolId))];
  return bullets.map((b) => `- ${b}`).join("\n");
}
