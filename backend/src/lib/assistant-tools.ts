import { FastifyInstance } from "fastify";
import { prisma } from "./prisma";
import { AssistantToolDeclaration } from "./ai";
import { AppJwtPayload } from "../types/fastify-jwt";
import { AssistantRole, formatIst, isLeadOwnershipRestricted, istDayBounds } from "./assistant-context";

// Per-role tool registry for the in-app assistant. Two rules keep this safe:
//  1. A role only ever sees its own tool list (toolsForRole) - the model can't
//     call a tool the user's role doesn't have.
//  2. "write" tools never execute inside the model turn. They validate + describe
//     the change (prepare), which becomes a pending AiAction the user must
//     confirm; execute then re-runs it through the app's own HTTP route as the
//     user (app.inject with their token), so role checks, ownership checks and
//     validation are exactly the ones the normal screens get.

export interface AssistantLink {
  label: string;
  // A screen in the app's RootStackParamList. Tab targets are expressed as
  // { screen: "MainTabs", params: { screen: "Tasks" } } - the client whitelists.
  screen: string;
  params?: Record<string, unknown>;
}

export interface ToolCtx {
  app: FastifyInstance;
  user: AppJwtPayload;
  schoolId: string;
  authorization: string;
  role: AssistantRole;
}

type Args = Record<string, unknown>;

export class ToolError extends Error {}

interface ReadTool {
  kind: "read";
  declaration: AssistantToolDeclaration;
  run(args: Args, ctx: ToolCtx): Promise<{ data: unknown; links?: AssistantLink[] }>;
}

interface WriteTool {
  kind: "write";
  declaration: AssistantToolDeclaration;
  // Validates args against real, in-scope records and returns a human summary
  // for the confirm card plus the normalised args to store. Must not write.
  prepare(args: Args, ctx: ToolCtx): Promise<{ summary: string; args: Args }>;
  execute(args: Args, ctx: ToolCtx): Promise<{ text: string; link?: AssistantLink }>;
}

export type AssistantTool = ReadTool | WriteTool;

// ---------------------------------------------------------------- helpers

function str(args: Args, key: string, { required = false, max = 2000 } = {}): string | undefined {
  const raw = args[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    if (required) throw new ToolError(`${key} is required`);
    return undefined;
  }
  return value.slice(0, max);
}

function limitArg(args: Args, fallback = 8): number {
  const n = Math.round(Number(args.limit));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : fallback;
}

function isoDate(args: Args, key: string): Date {
  const value = str(args, key, { required: true });
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) throw new ToolError(`${key} must be an ISO 8601 date-time`);
  return date;
}

async function callRoute(
  ctx: ToolCtx,
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: Record<string, unknown>
): Promise<unknown> {
  const res = await ctx.app.inject({
    method,
    url,
    headers: { authorization: ctx.authorization, "content-type": "application/json" },
    ...(payload ? { payload } : {}),
  });
  let body: { data?: unknown; error?: { message?: string } } = {};
  try {
    body = res.json();
  } catch {
    /* non-JSON error body */
  }
  if (res.statusCode >= 400) throw new ToolError(body.error?.message ?? `Request failed (${res.statusCode})`);
  return body.data;
}

const tabLink = (label: string, tab: string): AssistantLink => ({ label, screen: "MainTabs", params: { screen: tab } });
const screenLink = (label: string, screen: string, params: Record<string, unknown>): AssistantLink => ({
  label,
  screen,
  params,
});

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  ...(required.length ? { required } : {}),
});

const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "integer", description });

// ---------------------------------------------- counsellor / front desk

async function loadEnquiryInScope(ctx: ToolCtx, enquiryId: string) {
  const enquiry = await prisma.enquiry.findFirst({
    where: { id: enquiryId, schoolId: ctx.schoolId, erasedAt: null },
    select: { id: true, contactName: true, studentName: true, status: true, ownerUserId: true },
  });
  if (!enquiry) throw new ToolError("That lead was not found. Use search_enquiries to find the right id.");
  if ((await isLeadOwnershipRestricted(ctx.user)) && enquiry.ownerUserId !== ctx.user.sub) {
    throw new ToolError("That lead belongs to another counsellor.");
  }
  return enquiry;
}

async function stageLabels(schoolId: string): Promise<Map<string, { label: string; order: number }>> {
  const stages = await prisma.pipelineStage.findMany({ where: { schoolId }, select: { key: true, label: true, order: true } });
  return new Map(stages.map((s) => [s.key, { label: s.label, order: s.order }]));
}

const enrolmentTools: AssistantTool[] = [
  {
    kind: "read",
    declaration: {
      name: "list_followups",
      description: "List the user's own pending follow-up tasks, soonest first.",
      parameters: objectSchema({
        bucket: { type: "string", enum: ["overdue", "today", "upcoming", "all"], description: "Which tasks. Default all." },
        limit: N("Max rows, default 8."),
      }),
    },
    async run(args, ctx) {
      const { startOfToday, startOfTomorrow } = istDayBounds();
      const bucket = str(args, "bucket") ?? "all";
      const dueAt =
        bucket === "overdue"
          ? { lt: startOfToday }
          : bucket === "today"
            ? { gte: startOfToday, lt: startOfTomorrow }
            : bucket === "upcoming"
              ? { gte: startOfTomorrow }
              : undefined;
      const tasks = await prisma.followUpTask.findMany({
        where: { assignedToUserId: ctx.user.sub, status: "pending", enquiry: { schoolId: ctx.schoolId }, ...(dueAt ? { dueAt } : {}) },
        orderBy: { dueAt: "asc" },
        take: limitArg(args),
        include: { enquiry: { select: { id: true, contactName: true } }, template: { select: { name: true } } },
      });
      return {
        data: tasks.map((t) => ({
          taskId: t.id,
          enquiryId: t.enquiry.id,
          contact: t.enquiry.contactName,
          due: formatIst(t.dueAt),
          overdue: t.dueAt < startOfToday,
          channel: t.channel,
          template: t.template.name,
        })),
        links: [tabLink("Open tasks", "Tasks")],
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "search_enquiries",
      description:
        "Search leads/enquiries by contact name, student name or phone, optionally by pipeline stage key. Counsellors only get their own leads.",
      parameters: objectSchema({
        query: S("Text to match against contact name, student name or phone."),
        status: S("Pipeline stage key, e.g. new, contacted."),
        limit: N("Max rows, default 8."),
      }),
    },
    async run(args, ctx) {
      const query = str(args, "query", { max: 80 });
      const status = str(args, "status", { max: 60 });
      const restricted = await isLeadOwnershipRestricted(ctx.user);
      const [rows, stages] = await Promise.all([
        prisma.enquiry.findMany({
          where: {
            schoolId: ctx.schoolId,
            erasedAt: null,
            ...(restricted ? { ownerUserId: ctx.user.sub } : {}),
            ...(status ? { status } : {}),
            ...(query
              ? {
                  OR: [
                    { contactName: { contains: query, mode: "insensitive" } },
                    { studentName: { contains: query, mode: "insensitive" } },
                    { contactPhone: { contains: query } },
                  ],
                }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: limitArg(args),
          select: { id: true, contactName: true, studentName: true, contactPhone: true, gradeInterest: true, status: true },
        }),
        stageLabels(ctx.schoolId),
      ]);
      return {
        data: rows.map((e) => ({
          enquiryId: e.id,
          contact: e.contactName,
          student: e.studentName,
          phone: e.contactPhone,
          gradeInterest: e.gradeInterest,
          stage: stages.get(e.status)?.label ?? e.status,
          stageKey: e.status,
        })),
        links: rows.slice(0, 3).map((e) => screenLink(e.contactName, "EnquiryDetail", { enquiryId: e.id })),
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "pipeline_summary",
      description: "Count of the user's leads in each pipeline stage (school-wide for front desk).",
    },
    async run(_args, ctx) {
      const restricted = await isLeadOwnershipRestricted(ctx.user);
      const [grouped, stages] = await Promise.all([
        prisma.enquiry.groupBy({
          by: ["status"],
          where: { schoolId: ctx.schoolId, erasedAt: null, ...(restricted ? { ownerUserId: ctx.user.sub } : {}) },
          _count: { _all: true },
        }),
        stageLabels(ctx.schoolId),
      ]);
      return {
        data: grouped
          .map((g) => ({ stage: stages.get(g.status)?.label ?? g.status, stageKey: g.status, count: g._count._all, order: stages.get(g.status)?.order ?? 999 }))
          .sort((a, b) => a.order - b.order)
          .map(({ order: _o, ...rest }) => rest),
        links: [screenLink("Open pipeline", "Pipeline", {})],
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "list_message_templates",
      description: "List message templates (id, name, channel). Needed to schedule a follow-up.",
      parameters: objectSchema({ channel: { type: "string", enum: ["sms", "email", "whatsapp"], description: "Filter by channel." } }),
    },
    async run(args, ctx) {
      const channel = str(args, "channel");
      const templates = await prisma.messageTemplate.findMany({
        where: { schoolId: ctx.schoolId, ...(channel ? { channel } : {}) },
        orderBy: { name: "asc" },
        take: 20,
        select: { id: true, name: true, channel: true },
      });
      return { data: templates.map((t) => ({ templateId: t.id, name: t.name, channel: t.channel })) };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "create_followup_task",
      description:
        "Schedule a follow-up task for a lead. Needs the enquiryId (search_enquiries) and a templateId (list_message_templates) whose channel matches. The user must confirm before it is created.",
      parameters: objectSchema(
        {
          enquiryId: S("Lead id."),
          dueAt: S("When it is due, ISO 8601 with timezone offset, e.g. 2026-09-20T10:00:00+05:30."),
          channel: { type: "string", enum: ["sms", "email", "whatsapp"], description: "Channel to follow up on." },
          templateId: S("Message template id; its channel must equal channel."),
        },
        ["enquiryId", "dueAt", "channel", "templateId"]
      ),
    },
    async prepare(args, ctx) {
      const enquiry = await loadEnquiryInScope(ctx, str(args, "enquiryId", { required: true }) as string);
      const dueAt = isoDate(args, "dueAt");
      const channel = str(args, "channel", { required: true }) as string;
      const template = await prisma.messageTemplate.findFirst({
        where: { id: str(args, "templateId", { required: true }) as string, schoolId: ctx.schoolId },
      });
      if (!template) throw new ToolError("That template was not found. Use list_message_templates.");
      if (template.channel !== channel) throw new ToolError(`That template is for ${template.channel}, not ${channel}.`);
      return {
        summary: `Schedule a ${channel} follow-up with ${enquiry.contactName} for ${formatIst(dueAt)}, using the "${template.name}" template.`,
        args: { enquiryId: enquiry.id, dueAt: dueAt.toISOString(), channel, templateId: template.id },
      };
    },
    async execute(args, ctx) {
      await callRoute(ctx, "POST", "/api/v1/follow-up-tasks", args);
      return { text: "Follow-up scheduled.", link: tabLink("Open tasks", "Tasks") };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "reschedule_followup_task",
      description: "Change the due time of one of the user's pending follow-up tasks (get taskId from list_followups). Needs confirmation.",
      parameters: objectSchema({ taskId: S("Follow-up task id."), dueAt: S("New due time, ISO 8601 with offset.") }, ["taskId", "dueAt"]),
    },
    async prepare(args, ctx) {
      const dueAt = isoDate(args, "dueAt");
      const task = await prisma.followUpTask.findFirst({
        where: { id: str(args, "taskId", { required: true }) as string, assignedToUserId: ctx.user.sub, status: "pending", enquiry: { schoolId: ctx.schoolId } },
        include: { enquiry: { select: { contactName: true } } },
      });
      if (!task) throw new ToolError("That pending task was not found among the user's own tasks.");
      return {
        summary: `Move the follow-up with ${task.enquiry.contactName} from ${formatIst(task.dueAt)} to ${formatIst(dueAt)}.`,
        args: { taskId: task.id, dueAt: dueAt.toISOString() },
      };
    },
    async execute(args, ctx) {
      await callRoute(ctx, "PATCH", `/api/v1/follow-up-tasks/${args.taskId}`, { dueAt: args.dueAt });
      return { text: "Follow-up rescheduled.", link: tabLink("Open tasks", "Tasks") };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "update_enquiry_stage",
      description:
        "Move a lead to another pipeline stage. Use stage keys from pipeline_summary/search_enquiries. Moving to 'lost' needs a lostReason. Needs confirmation.",
      parameters: objectSchema(
        { enquiryId: S("Lead id."), status: S("Target pipeline stage key."), lostReason: S("Required only when status is lost.") },
        ["enquiryId", "status"]
      ),
    },
    async prepare(args, ctx) {
      const enquiry = await loadEnquiryInScope(ctx, str(args, "enquiryId", { required: true }) as string);
      const status = str(args, "status", { required: true, max: 60 }) as string;
      const stages = await stageLabels(ctx.schoolId);
      if (stages.size && !stages.has(status)) throw new ToolError(`Unknown stage. Valid stages: ${[...stages.keys()].join(", ")}.`);
      const lostReason = str(args, "lostReason", { max: 300 });
      if (status === "lost" && !lostReason) throw new ToolError("Moving a lead to lost needs a lostReason - ask the user why.");
      const from = stages.get(enquiry.status)?.label ?? enquiry.status;
      const to = stages.get(status)?.label ?? status;
      return {
        summary: `Move ${enquiry.contactName} from "${from}" to "${to}"${lostReason ? ` (reason: ${lostReason})` : ""}.`,
        args: { enquiryId: enquiry.id, status, ...(lostReason ? { lostReason } : {}) },
      };
    },
    async execute(args, ctx) {
      const { enquiryId, ...body } = args;
      await callRoute(ctx, "PATCH", `/api/v1/enquiries/${enquiryId}`, body);
      return { text: "Lead stage updated.", link: screenLink("Open lead", "EnquiryDetail", { enquiryId }) };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "add_enquiry_note",
      description: "Add a note to a lead. Needs confirmation.",
      parameters: objectSchema({ enquiryId: S("Lead id."), body: S("The note text.") }, ["enquiryId", "body"]),
    },
    async prepare(args, ctx) {
      const enquiry = await loadEnquiryInScope(ctx, str(args, "enquiryId", { required: true }) as string);
      const body = str(args, "body", { required: true, max: 1000 }) as string;
      return { summary: `Add this note to ${enquiry.contactName}: "${body}"`, args: { enquiryId: enquiry.id, body } };
    },
    async execute(args, ctx) {
      await callRoute(ctx, "POST", `/api/v1/enquiries/${args.enquiryId}/notes`, { body: args.body, type: "lead_note" });
      return { text: "Note added.", link: screenLink("Open lead", "EnquiryDetail", { enquiryId: args.enquiryId }) };
    },
  },
];

// ----------------------------------------------------------------- teacher

async function myClassSectionIds(ctx: ToolCtx): Promise<string[]> {
  const rows = await prisma.classSectionTeacher.findMany({
    where: { teacherUserId: ctx.user.sub, classSection: { academicYear: { schoolId: ctx.schoolId } } },
    select: { classSectionId: true },
  });
  return rows.map((r) => r.classSectionId);
}

const classLabel = (c: { className: string; sectionName: string }) => `${c.className}-${c.sectionName}`;

const teacherTools: AssistantTool[] = [
  {
    kind: "read",
    declaration: {
      name: "list_my_topics",
      description: "List the teacher's own topics (with class, subject and how much has been generated).",
      parameters: objectSchema({ query: S("Match against the topic name or subject."), limit: N("Max rows, default 8.") }),
    },
    async run(args, ctx) {
      const query = str(args, "query", { max: 80 });
      const topics = await prisma.topic.findMany({
        where: {
          schoolId: ctx.schoolId,
          teacherUserId: ctx.user.sub,
          status: "active",
          ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { subject: { contains: query, mode: "insensitive" } }] } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: limitArg(args),
        include: { classSection: true, _count: { select: { generations: true, assignments: true } } },
      });
      return {
        data: topics.map((t) => ({
          topicId: t.id,
          name: t.name,
          subject: t.subject,
          class: classLabel(t.classSection),
          generations: t._count.generations,
          assignments: t._count.assignments,
        })),
        links: topics.slice(0, 3).map((t) => screenLink(t.name, "TopicDetail", { topicId: t.id })),
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "list_my_assignments",
      description: "List the teacher's own assignments with submission / grading counts.",
      parameters: objectSchema({
        status: { type: "string", enum: ["draft", "published"], description: "Filter by status." },
        limit: N("Max rows, default 8."),
      }),
    },
    async run(args, ctx) {
      const status = str(args, "status");
      const rows = await prisma.assignment.findMany({
        where: { schoolId: ctx.schoolId, teacherUserId: ctx.user.sub, ...(status ? { status } : {}) },
        orderBy: { updatedAt: "desc" },
        take: limitArg(args),
        include: { classSection: true, submissions: { select: { grade: { select: { releasedToStudent: true } } } } },
      });
      return {
        data: rows.map((a) => ({
          assignmentId: a.id,
          title: a.title,
          class: classLabel(a.classSection),
          status: a.status,
          submissions: a.submissions.length,
          notGraded: a.submissions.filter((s) => !s.grade).length,
          gradedNotReleased: a.submissions.filter((s) => s.grade && !s.grade.releasedToStudent).length,
        })),
        links: rows.slice(0, 3).map((a) => screenLink(a.title, a.status === "draft" ? "AssignmentDraftReview" : "AssignmentDetail", { assignmentId: a.id })),
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "get_assignment_insight",
      description: "How a class did on one of the teacher's assignments (score bands, weak questions).",
      parameters: objectSchema({ assignmentId: S("Assignment id.") }, ["assignmentId"]),
    },
    async run(args, ctx) {
      const id = str(args, "assignmentId", { required: true }) as string;
      const owned = await prisma.assignment.findFirst({ where: { id, schoolId: ctx.schoolId, teacherUserId: ctx.user.sub }, select: { id: true } });
      if (!owned) throw new ToolError("That assignment was not found among the teacher's own.");
      const data = await callRoute(ctx, "GET", `/api/v1/assignments/${id}/class-insight`);
      return { data: JSON.stringify(data).slice(0, 6000), links: [screenLink("Open assignment", "AssignmentDetail", { assignmentId: id })] };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "list_my_students",
      description: "List students in the teacher's classes (needed to message one student).",
      parameters: objectSchema({ query: S("Match against student name."), limit: N("Max rows, default 8.") }),
    },
    async run(args, ctx) {
      const query = str(args, "query", { max: 80 });
      const students = await prisma.studentStub.findMany({
        where: {
          schoolId: ctx.schoolId,
          status: "active",
          classSectionId: { in: await myClassSectionIds(ctx) },
          ...(query ? { fullName: { contains: query, mode: "insensitive" } } : {}),
        },
        orderBy: { fullName: "asc" },
        take: limitArg(args),
        include: { classSection: true },
      });
      return { data: students.map((s) => ({ studentId: s.id, name: s.fullName, class: classLabel(s.classSection), classSectionId: s.classSectionId })) };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "list_my_classes",
      description: "List the classes/sections the teacher teaches (ids needed to message a whole class).",
    },
    async run(_args, ctx) {
      const classes = await prisma.classSection.findMany({
        where: { id: { in: await myClassSectionIds(ctx) }, isActive: true },
        orderBy: [{ className: "asc" }, { sectionName: "asc" }],
      });
      return { data: classes.map((c) => ({ classSectionId: c.id, class: classLabel(c) })) };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "open_lesson_setup",
      description:
        "Open the lesson-generation setup screen for one of the teacher's topics. Lesson generation has options (sources, format) and costs credits, so the assistant does not run it - it sends the teacher there.",
      parameters: objectSchema({ topicId: S("Topic id.") }, ["topicId"]),
    },
    async run(args, ctx) {
      const topic = await prisma.topic.findFirst({
        where: { id: str(args, "topicId", { required: true }) as string, schoolId: ctx.schoolId, teacherUserId: ctx.user.sub },
        select: { id: true, name: true },
      });
      if (!topic) throw new ToolError("That topic was not found among the teacher's own.");
      return {
        data: { topic: topic.name, note: "Tell the user to tap the link to set up and generate the lesson themselves." },
        links: [screenLink(`Set up lesson: ${topic.name}`, "GenerationSetup", { topicId: topic.id })],
      };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "draft_assignment_from_topic",
      description:
        "Create a DRAFT assignment (questions + answer key) with AI from one of the teacher's topics. Uses AI credits and needs taught content on the topic. Needs confirmation; the teacher reviews the draft before publishing.",
      parameters: objectSchema(
        {
          topicId: S("Topic id."),
          questionCount: N("Number of questions, 1-20."),
          questionTypes: { type: "string", enum: ["short_answer", "mcq", "mixed"], description: "Default short_answer." },
          focusPrompt: S("Optional extra guidance, e.g. 'focus on word problems'."),
        },
        ["topicId", "questionCount"]
      ),
    },
    async prepare(args, ctx) {
      const topic = await prisma.topic.findFirst({
        where: { id: str(args, "topicId", { required: true }) as string, schoolId: ctx.schoolId, teacherUserId: ctx.user.sub },
        include: { classSection: true },
      });
      if (!topic) throw new ToolError("That topic was not found among the teacher's own.");
      const questionCount = Math.round(Number(args.questionCount));
      if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 20) throw new ToolError("questionCount must be 1-20.");
      const questionTypes = ["short_answer", "mcq", "mixed"].includes(String(args.questionTypes)) ? String(args.questionTypes) : "short_answer";
      const focusPrompt = str(args, "focusPrompt", { max: 400 });
      return {
        summary: `Draft a ${questionCount}-question ${questionTypes.replace("_", " ")} assignment on "${topic.name}" for ${classLabel(topic.classSection)}${focusPrompt ? `, focusing on: ${focusPrompt}` : ""}. This uses AI credits; you can review it before publishing.`,
        args: { topicId: topic.id, questionCount, questionTypes, ...(focusPrompt ? { focusPrompt } : {}) },
      };
    },
    async execute(args, ctx) {
      const { topicId, ...body } = args;
      const assignment = (await callRoute(ctx, "POST", `/api/v1/topics/${topicId}/assignment-draft`, body)) as { id?: string } | null;
      return {
        text: "Draft assignment created - review it before publishing.",
        link: assignment?.id ? screenLink("Review draft", "AssignmentDraftReview", { assignmentId: assignment.id }) : undefined,
      };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "send_class_message",
      description: "Send a message to every student in one of the teacher's classes. Needs confirmation.",
      parameters: objectSchema({ classSectionId: S("Class section id (list_my_classes)."), body: S("Message text.") }, ["classSectionId", "body"]),
    },
    async prepare(args, ctx) {
      const id = str(args, "classSectionId", { required: true }) as string;
      if (!(await myClassSectionIds(ctx)).includes(id)) throw new ToolError("The teacher does not teach that class.");
      const section = await prisma.classSection.findUnique({ where: { id } });
      const body = str(args, "body", { required: true, max: 1500 }) as string;
      return { summary: `Send to all of ${section ? classLabel(section) : "the class"}: "${body}"`, args: { classSectionId: id, body } };
    },
    async execute(args, ctx) {
      await callRoute(ctx, "POST", "/api/v1/communications/teacher-to-class", args);
      return { text: "Message sent to the class.", link: screenLink("Open messages", "CommunicationHub", {}) };
    },
  },
  {
    kind: "write",
    declaration: {
      name: "send_student_message",
      description: "Send a message to one student in the teacher's classes. Needs confirmation.",
      parameters: objectSchema({ studentStubId: S("Student id (list_my_students)."), body: S("Message text.") }, ["studentStubId", "body"]),
    },
    async prepare(args, ctx) {
      const student = await prisma.studentStub.findFirst({
        where: {
          id: str(args, "studentStubId", { required: true }) as string,
          schoolId: ctx.schoolId,
          status: "active",
          classSectionId: { in: await myClassSectionIds(ctx) },
        },
      });
      if (!student) throw new ToolError("That student was not found in the teacher's classes.");
      const body = str(args, "body", { required: true, max: 1500 }) as string;
      return { summary: `Send to ${student.fullName}: "${body}"`, args: { studentStubId: student.id, body } };
    },
    async execute(args, ctx) {
      await callRoute(ctx, "POST", "/api/v1/communications/teacher-to-student", args);
      return { text: "Message sent.", link: screenLink("Open messages", "CommunicationHub", {}) };
    },
  },
];

// ----------------------------------------------------------------- student

// Read-only on purpose. Nothing here returns an answer key, and unreleased
// grades are hidden exactly as the student portal hides them.
const studentTools: AssistantTool[] = [
  {
    kind: "read",
    declaration: {
      name: "my_assignments",
      description: "The student's own assignments and their status.",
      parameters: objectSchema({
        filter: { type: "string", enum: ["to_do", "submitted", "graded", "all"], description: "Default all." },
      }),
    },
    async run(args, ctx) {
      const student = await prisma.studentStub.findFirst({ where: { id: ctx.user.sub, schoolId: ctx.schoolId } });
      if (!student) throw new ToolError("No student profile found.");
      const filter = str(args, "filter") ?? "all";
      const assignments = await prisma.assignment.findMany({
        where: { schoolId: ctx.schoolId, classSectionId: student.classSectionId, status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 30,
        include: { topic: { select: { name: true, subject: true } }, submissions: { where: { studentStubId: student.id }, include: { grade: true } } },
      });
      const rows = assignments.map((a) => {
        const sub = a.submissions[0];
        const released = sub?.grade?.releasedToStudent ? sub.grade : null;
        return {
          assignmentId: a.id,
          title: a.title,
          topic: a.topic?.name ?? null,
          subject: a.topic?.subject ?? null,
          status: sub ? (released ? "graded" : "submitted") : "to_do",
          score: released?.finalScore ?? null,
          band: released?.performanceBand ?? null,
        };
      });
      return {
        data: rows.filter((r) => filter === "all" || r.status === filter),
        links: [tabLink("Open my assignments", "Home")],
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "get_assignment_questions",
      description:
        "The question prompts of one of the student's assignments (never the answers). Use it to give hints, not solutions, while the assignment is still to do.",
      parameters: objectSchema({ assignmentId: S("Assignment id.") }, ["assignmentId"]),
    },
    async run(args, ctx) {
      const student = await prisma.studentStub.findFirst({ where: { id: ctx.user.sub, schoolId: ctx.schoolId } });
      if (!student) throw new ToolError("No student profile found.");
      const assignment = await prisma.assignment.findFirst({
        where: { id: str(args, "assignmentId", { required: true }) as string, schoolId: ctx.schoolId, classSectionId: student.classSectionId, status: "published" },
        include: { submissions: { where: { studentStubId: student.id }, select: { id: true } } },
      });
      if (!assignment) throw new ToolError("That assignment was not found.");
      const questions = (assignment.questions as unknown as { id: string; prompt: string; options?: string[]; type?: string }[]).map((q) => ({
        id: q.id,
        prompt: q.prompt,
        ...(q.options ? { options: q.options } : {}),
      }));
      return {
        data: { title: assignment.title, alreadySubmitted: assignment.submissions.length > 0, questions },
      };
    },
  },
  {
    kind: "read",
    declaration: {
      name: "get_study_material",
      description: "Lesson material the teacher has shared with the student's class, matched by topic/subject name. Use it to explain concepts.",
      parameters: objectSchema({ query: S("Topic or subject to look for.") }, ["query"]),
    },
    async run(args, ctx) {
      const student = await prisma.studentStub.findFirst({ where: { id: ctx.user.sub, schoolId: ctx.schoolId } });
      if (!student) throw new ToolError("No student profile found.");
      const query = str(args, "query", { required: true, max: 80 }) as string;
      const generations = await prisma.generation.findMany({
        where: {
          topic: {
            schoolId: ctx.schoolId,
            classSectionId: student.classSectionId,
            OR: [{ name: { contains: query, mode: "insensitive" } }, { subject: { contains: query, mode: "insensitive" } }],
          },
          generationStatus: "succeeded",
          shareStatus: "published",
        },
        orderBy: { publishedAt: "desc" },
        take: 2,
        include: { topic: { select: { name: true, subject: true } } },
      });
      if (!generations.length) return { data: { note: "No shared material matched. Explain from general knowledge and say no class material was found." } };
      return {
        data: generations.map((g) => ({
          topic: g.topic.name,
          subject: g.topic.subject,
          type: g.outputType,
          content: (g.editedOutput ?? g.aiOutput ?? "").toString().slice(0, 5000),
        })),
        links: [tabLink("Open materials", "Materials")],
      };
    },
  },
];

// ------------------------------------------------------------- dispatch

export function toolsForRole(role: AssistantRole): AssistantTool[] {
  if (role === "teacher") return teacherTools;
  if (role === "student") return studentTools;
  return enrolmentTools;
}

export function findTool(role: AssistantRole, name: string): AssistantTool | undefined {
  return toolsForRole(role).find((t) => t.declaration.name === name);
}

// Confirm-time dispatch by stored tool name; the role check means a stored
// action can only ever be run by a role that owns that tool.
export function findWriteTool(role: AssistantRole, name: string): WriteTool | undefined {
  const tool = findTool(role, name);
  return tool?.kind === "write" ? tool : undefined;
}
