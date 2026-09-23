import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { authorizeForSchool } from "./academic-structure";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AGENDA_DAYS = 42;

interface SlotBody {
  teacherUserId?: string;
  classSectionId?: string;
  subject?: string;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  room?: string | null;
}

interface TaskBody {
  title?: string;
  notes?: string | null;
  taskDate?: string;
  dueTime?: string | null;
  isDone?: boolean;
}

// Dates are pure calendar dates ("YYYY-MM-DD"), handled in UTC so a server
// timezone can never shift a task or a weekday by a day.
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekday(date: Date): number {
  return date.getUTCDay() === 0 ? 7 : date.getUTCDay();
}

function validationError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, message: string) {
  return reply.code(400).send({ data: null, error: { code: "validation_error", message } });
}

type SlotFields = { teacherUserId: string; classSectionId: string; subject: string; weekday: number; startTime: string; endTime: string; room: string | null };

// Shared by create and update: checks the shape, that the teacher and class
// belong to this school, and that the period doesn't overlap another one the
// same teacher already has that weekday.
async function resolveSlot(
  schoolId: string,
  fields: SlotFields,
  excludeId?: string
): Promise<{ error: { status: number; code: string; message: string } } | { ok: true }> {
  if (!Number.isInteger(fields.weekday) || fields.weekday < 1 || fields.weekday > 7) {
    return { error: { status: 400, code: "validation_error", message: "weekday must be 1 (Mon) to 7 (Sun)" } };
  }
  if (!TIME_RE.test(fields.startTime) || !TIME_RE.test(fields.endTime)) {
    return { error: { status: 400, code: "validation_error", message: "startTime and endTime must be 24h HH:mm" } };
  }
  if (fields.startTime >= fields.endTime) {
    return { error: { status: 400, code: "validation_error", message: "endTime must be after startTime" } };
  }
  if (!fields.subject) {
    return { error: { status: 400, code: "validation_error", message: "subject is required" } };
  }

  const teacher = await prisma.appUser.findFirst({ where: { id: fields.teacherUserId, schoolId, role: "teacher" }, select: { id: true } });
  if (!teacher) return { error: { status: 404, code: "not_found", message: "Teacher not found in this school" } };

  const classSection = await prisma.classSection.findFirst({
    where: { id: fields.classSectionId, isActive: true, academicYear: { schoolId } },
    select: { id: true },
  });
  if (!classSection) return { error: { status: 404, code: "not_found", message: "Class section not found in this school" } };

  const clash = await prisma.timetableSlot.findFirst({
    where: {
      schoolId,
      teacherUserId: fields.teacherUserId,
      weekday: fields.weekday,
      startTime: { lt: fields.endTime },
      endTime: { gt: fields.startTime },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });
  if (clash) {
    return { error: { status: 409, code: "conflict", message: `Overlaps an existing period (${clash.startTime}-${clash.endTime}) on that day` } };
  }

  return { ok: true };
}

const slotInclude = { classSection: { select: { className: true, sectionName: true } } } as const;

const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];

export async function timetableRoutes(app: FastifyInstance) {
  // --- Timetable management: school admin/leadership, or an individual
  // teacher for their own personal school (authorizeForSchool's rule). ---

  app.get<{ Params: { schoolId: string }; Querystring: { teacherUserId?: string } }>(
    "/schools/:schoolId/timetable-slots",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      if (!(await authorizeForSchool(request, reply, request.params.schoolId))) return;
      const { teacherUserId } = request.query ?? {};
      const slots = await prisma.timetableSlot.findMany({
        where: { schoolId: request.params.schoolId, ...(teacherUserId ? { teacherUserId } : {}) },
        include: slotInclude,
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      });
      return { data: slots, meta: {} };
    }
  );

  app.post<{ Params: { schoolId: string }; Body: SlotBody }>(
    "/schools/:schoolId/timetable-slots",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { schoolId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;

      const body = request.body ?? {};
      if (!body.teacherUserId || !body.classSectionId || !body.subject?.trim() || body.weekday == null || !body.startTime || !body.endTime) {
        return validationError(reply, "teacherUserId, classSectionId, subject, weekday, startTime and endTime are required");
      }

      const fields: SlotFields = {
        teacherUserId: body.teacherUserId,
        classSectionId: body.classSectionId,
        subject: body.subject.trim(),
        weekday: body.weekday,
        startTime: body.startTime,
        endTime: body.endTime,
        room: body.room?.trim() || null,
      };
      const result = await resolveSlot(schoolId, fields);
      if ("error" in result) {
        return reply.code(result.error.status).send({ data: null, error: { code: result.error.code, message: result.error.message } });
      }

      const slot = await prisma.timetableSlot.create({ data: { schoolId, ...fields }, include: slotInclude });
      return reply.code(201).send({ data: slot, meta: {} });
    }
  );

  app.patch<{ Params: { schoolId: string; slotId: string }; Body: SlotBody }>(
    "/schools/:schoolId/timetable-slots/:slotId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { schoolId, slotId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;

      const existing = await prisma.timetableSlot.findFirst({ where: { id: slotId, schoolId } });
      if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Timetable slot not found" } });

      const body = request.body ?? {};
      const fields: SlotFields = {
        teacherUserId: body.teacherUserId ?? existing.teacherUserId,
        classSectionId: body.classSectionId ?? existing.classSectionId,
        subject: body.subject !== undefined ? body.subject.trim() : existing.subject,
        weekday: body.weekday ?? existing.weekday,
        startTime: body.startTime ?? existing.startTime,
        endTime: body.endTime ?? existing.endTime,
        room: body.room !== undefined ? body.room?.trim() || null : existing.room,
      };
      const result = await resolveSlot(schoolId, fields, slotId);
      if ("error" in result) {
        return reply.code(result.error.status).send({ data: null, error: { code: result.error.code, message: result.error.message } });
      }

      const slot = await prisma.timetableSlot.update({ where: { id: slotId }, data: fields, include: slotInclude });
      return { data: slot, meta: {} };
    }
  );

  app.delete<{ Params: { schoolId: string; slotId: string } }>(
    "/schools/:schoolId/timetable-slots/:slotId",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { schoolId, slotId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;

      const existing = await prisma.timetableSlot.findFirst({ where: { id: slotId, schoolId }, select: { id: true } });
      if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Timetable slot not found" } });

      await prisma.timetableSlot.delete({ where: { id: slotId } });
      return { data: { id: slotId }, meta: {} };
    }
  );

  // --- The signed-in teacher's own view ---

  app.get("/calendar/timetable", { onRequest: scoped(app) }, async (request) => {
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId: request.schoolId, teacherUserId: request.user.sub },
      include: slotInclude,
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });
    return { data: slots, meta: {} };
  });

  // One call powers the home-screen calendar: for each day in the range, the
  // periods the timetable puts on that weekday plus the teacher's own tasks.
  app.get<{ Querystring: { from?: string; to?: string } }>("/calendar/agenda", { onRequest: scoped(app) }, async (request, reply) => {
    const from = parseDate(request.query?.from);
    const to = parseDate(request.query?.to);
    if (!from || !to || to < from) return validationError(reply, "from and to must be YYYY-MM-DD dates, with to on or after from");
    const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (dayCount > MAX_AGENDA_DAYS) return validationError(reply, `range can be at most ${MAX_AGENDA_DAYS} days`);

    const [slots, tasks] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { schoolId: request.schoolId, teacherUserId: request.user.sub },
        include: slotInclude,
        orderBy: { startTime: "asc" },
      }),
      prisma.calendarTask.findMany({
        where: { schoolId: request.schoolId, teacherUserId: request.user.sub, taskDate: { gte: from, lte: to } },
        orderBy: [{ isDone: "asc" }, { dueTime: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const days = Array.from({ length: dayCount }, (_, i) => {
      const date = new Date(from.getTime() + i * 86_400_000);
      const key = formatDate(date);
      const weekday = isoWeekday(date);
      return {
        date: key,
        periods: slots
          .filter((slot) => slot.weekday === weekday)
          .map((slot) => ({
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            subject: slot.subject,
            room: slot.room,
            className: slot.classSection.className,
            sectionName: slot.classSection.sectionName,
          })),
        tasks: tasks
          .filter((task) => formatDate(task.taskDate) === key)
          .map((task) => ({ id: task.id, title: task.title, notes: task.notes, dueTime: task.dueTime, isDone: task.isDone })),
      };
    });

    return { data: { days }, meta: {} };
  });

  app.post<{ Body: TaskBody }>("/calendar/tasks", { onRequest: scoped(app) }, async (request, reply) => {
    const body = request.body ?? {};
    const taskDate = parseDate(body.taskDate);
    if (!body.title?.trim() || !taskDate) return validationError(reply, "title and taskDate (YYYY-MM-DD) are required");
    if (body.dueTime && !TIME_RE.test(body.dueTime)) return validationError(reply, "dueTime must be 24h HH:mm");

    const task = await prisma.calendarTask.create({
      data: {
        schoolId: request.schoolId,
        teacherUserId: request.user.sub,
        title: body.title.trim(),
        notes: body.notes?.trim() || null,
        taskDate,
        dueTime: body.dueTime || null,
      },
    });
    return reply.code(201).send({ data: { id: task.id, title: task.title, notes: task.notes, taskDate: formatDate(task.taskDate), dueTime: task.dueTime, isDone: task.isDone }, meta: {} });
  });

  app.patch<{ Params: { id: string }; Body: TaskBody }>("/calendar/tasks/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const existing = await prisma.calendarTask.findFirst({ where: { id: request.params.id, teacherUserId: request.user.sub } });
    if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Task not found" } });

    const body = request.body ?? {};
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      if (!body.title.trim()) return validationError(reply, "title cannot be empty");
      data.title = body.title.trim();
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.taskDate !== undefined) {
      const taskDate = parseDate(body.taskDate);
      if (!taskDate) return validationError(reply, "taskDate must be YYYY-MM-DD");
      data.taskDate = taskDate;
    }
    if (body.dueTime !== undefined) {
      if (body.dueTime && !TIME_RE.test(body.dueTime)) return validationError(reply, "dueTime must be 24h HH:mm");
      data.dueTime = body.dueTime || null;
    }
    if (body.isDone !== undefined) {
      data.isDone = body.isDone;
      data.completedAt = body.isDone ? new Date() : null;
    }

    const task = await prisma.calendarTask.update({ where: { id: existing.id }, data });
    return { data: { id: task.id, title: task.title, notes: task.notes, taskDate: formatDate(task.taskDate), dueTime: task.dueTime, isDone: task.isDone }, meta: {} };
  });

  app.delete<{ Params: { id: string } }>("/calendar/tasks/:id", { onRequest: scoped(app) }, async (request, reply) => {
    const existing = await prisma.calendarTask.findFirst({ where: { id: request.params.id, teacherUserId: request.user.sub }, select: { id: true } });
    if (!existing) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Task not found" } });
    await prisma.calendarTask.delete({ where: { id: existing.id } });
    return { data: { id: existing.id }, meta: {} };
  });
}
