import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma";
import { recordAuditEvent } from "../lib/audit";
import { resolveClassLimit } from "../lib/limits";
import { buildClassExportZip } from "../lib/class-export";
import {
  CLASS_DELETE_GRACE_DAYS,
  archiveClassSection,
  purgeClassSection,
  purgeDeadline,
  restoreClassSection,
} from "../lib/class-lifecycle";
import { authorizeForSchool } from "./academic-structure";

// Delete-a-class workflow: export (zip of all class data) -> delete (archive,
// restorable for CLASS_DELETE_GRACE_DAYS) -> permanent delete (immediate, or
// automatic from the worker once the grace period ends). Only callers who can
// manage the school's classes (authorizeForSchool: school admin, trust
// leadership, platform admin, or an individual teacher for their own school)
// can use any of it - an institutional teacher cannot delete a class.

type Params = { schoolId: string; classSectionId: string };
interface ConfirmBody {
  confirmName?: string;
  skipBackup?: boolean;
}

const notFound = (reply: FastifyReply) =>
  reply.code(404).send({ data: null, error: { code: "not_found", message: "Class not found for this school" } });

const badRequest = (reply: FastifyReply, code: string, message: string) =>
  reply.code(400).send({ data: null, error: { code, message } });

function classLabel(cs: { className: string; sectionName: string }): string {
  return `${cs.className} ${cs.sectionName}`.trim();
}

// The UI makes the user type the class name; enforce it here too so the API
// can't be used to delete a class by accident.
function confirmationMatches(cs: { className: string; sectionName: string }, confirmName: string | undefined): boolean {
  const normalise = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return !!confirmName && normalise(confirmName) === normalise(classLabel(cs));
}

async function audit(request: FastifyRequest, action: string, cs: { id: string; className: string; sectionName: string }, schoolId: string, metadata?: Record<string, unknown>) {
  const actor = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
  await recordAuditEvent({
    actorUserId: request.user.sub,
    actorEmail: actor?.email ?? "unknown",
    action,
    targetType: "ClassSection",
    targetId: cs.id,
    targetLabel: classLabel(cs),
    schoolId,
    metadata,
  });
}

export async function classLifecycleRoutes(app: FastifyInstance) {
  const findClass = (schoolId: string, classSectionId: string) =>
    prisma.classSection.findFirst({ where: { id: classSectionId, academicYear: { schoolId } } });

  // Classes waiting out their grace period ("Recently deleted").
  app.get<{ Params: { schoolId: string } }>(
    "/schools/:schoolId/class-sections/deleted",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { schoolId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;

      const classes = await prisma.classSection.findMany({
        where: { academicYear: { schoolId }, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        include: { academicYear: { select: { label: true } }, _count: { select: { studentStubs: true, topics: true, assignments: true } } },
      });

      return {
        data: classes.map((c) => ({
          id: c.id,
          className: c.className,
          sectionName: c.sectionName,
          academicYearLabel: c.academicYear.label,
          deletedAt: c.deletedAt,
          purgeAt: purgeDeadline(c.deletedAt!),
          exportedAt: c.exportedAt,
          studentCount: c._count.studentStubs,
          topicCount: c._count.topics,
          assignmentCount: c._count.assignments,
        })),
        meta: { graceDays: CLASS_DELETE_GRACE_DAYS },
      };
    }
  );

  // Zip of everything in the class. Works on live and archived classes.
  app.get<{ Params: Params }>(
    "/schools/:schoolId/class-sections/:classSectionId/export",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { schoolId, classSectionId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;
      const cs = await findClass(schoolId, classSectionId);
      if (!cs) return notFound(reply);

      const { buffer, fileName } = await buildClassExportZip(cs.id);
      await prisma.classSection.update({ where: { id: cs.id }, data: { exportedAt: new Date() } });
      await audit(request, "class.export", cs, schoolId, { bytes: buffer.length });

      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      reply.header("Content-Length", buffer.length);
      return reply.send(buffer);
    }
  );

  // Step 1: archive. Reversible until the grace period ends.
  app.post<{ Params: Params; Body: ConfirmBody }>(
    "/schools/:schoolId/class-sections/:classSectionId/delete",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { schoolId, classSectionId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;
      const cs = await findClass(schoolId, classSectionId);
      if (!cs) return notFound(reply);
      if (cs.deletedAt) return badRequest(reply, "already_deleted", "This class is already deleted");
      if (!confirmationMatches(cs, request.body?.confirmName)) {
        return badRequest(reply, "confirmation_mismatch", "Type the class name exactly to confirm");
      }

      await archiveClassSection(cs.id, request.user.sub);
      await audit(request, "class.delete", cs, schoolId, { exported: !!cs.exportedAt });

      const deletedAt = new Date();
      return { data: { id: cs.id, deletedAt, purgeAt: purgeDeadline(deletedAt) }, meta: { graceDays: CLASS_DELETE_GRACE_DAYS } };
    }
  );

  app.post<{ Params: Params }>(
    "/schools/:schoolId/class-sections/:classSectionId/restore",
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const { schoolId, classSectionId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;
      const cs = await findClass(schoolId, classSectionId);
      if (!cs) return notFound(reply);
      if (!cs.deletedAt) return badRequest(reply, "not_deleted", "This class is not deleted");

      // A restored class counts toward an individual account's class cap again.
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { accountType: true } });
      if (school?.accountType === "individual") {
        const [count, limit] = await Promise.all([
          prisma.classSection.count({ where: { academicYear: { schoolId }, isActive: true } }),
          resolveClassLimit(schoolId),
        ]);
        if (count >= limit) {
          return badRequest(reply, "class_cap_reached", `Individual accounts are limited to ${limit} classes. Delete or archive another class first.`);
        }
      }

      await restoreClassSection(cs.id);
      await audit(request, "class.restore", cs, schoolId);
      return { data: { id: cs.id }, meta: {} };
    }
  );

  // Step 2, on demand: irreversible. Only for a class already in "Recently
  // deleted", and only after a backup was downloaded or explicitly skipped.
  app.post<{ Params: Params; Body: ConfirmBody }>(
    "/schools/:schoolId/class-sections/:classSectionId/permanent-delete",
    { onRequest: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { schoolId, classSectionId } = request.params;
      if (!(await authorizeForSchool(request, reply, schoolId))) return;
      const cs = await findClass(schoolId, classSectionId);
      if (!cs) return notFound(reply);
      if (!cs.deletedAt) return badRequest(reply, "not_deleted", "Delete the class first, then delete it permanently");
      if (!confirmationMatches(cs, request.body?.confirmName)) {
        return badRequest(reply, "confirmation_mismatch", "Type the class name exactly to confirm");
      }
      if (!cs.exportedAt && !request.body?.skipBackup) {
        return badRequest(reply, "backup_required", "Download the class backup first, or confirm you want to delete without one");
      }

      await audit(request, "class.purge", cs, schoolId, { exported: !!cs.exportedAt, skippedBackup: !cs.exportedAt });
      await purgeClassSection(cs.id);
      return { data: { deleted: true }, meta: {} };
    }
  );
}
