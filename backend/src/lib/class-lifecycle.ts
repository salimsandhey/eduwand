import { prisma } from "./prisma";
import { storage } from "./storage";

// Two-step class deletion. Nothing in the schema cascades from ClassSection,
// so a hard delete has to remove every child row explicitly, in dependency
// order (purgeClassSection). "Delete" from the UI is the reversible first step
// (archiveClassSection); the worker (and "Delete permanently") does the second.

export const CLASS_DELETE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Students of an archived class can't sign in or see anything: the student
// portal only serves status "active" students, so parking them on this status
// (rather than "removed", which means the teacher removed that one student)
// hides the class from students and lets restore put exactly them back.
const STUDENT_STATUS_CLASS_DELETED = "class_deleted";

export function purgeDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + CLASS_DELETE_GRACE_DAYS * DAY_MS);
}

export async function archiveClassSection(classSectionId: string, deletedByUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.classSection.update({
      where: { id: classSectionId },
      data: { deletedAt: new Date(), deletedByUserId, isActive: false },
    });
    const students = await tx.studentStub.findMany({ where: { classSectionId, status: "active" }, select: { id: true } });
    if (students.length) {
      await tx.studentStub.updateMany({
        where: { id: { in: students.map((s) => s.id) } },
        data: { status: STUDENT_STATUS_CLASS_DELETED, tokenVersion: { increment: 1 } },
      });
    }
  });
}

export async function restoreClassSection(classSectionId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.classSection.update({
      where: { id: classSectionId },
      data: { deletedAt: null, deletedByUserId: null, isActive: true },
    });
    await tx.studentStub.updateMany({
      where: { classSectionId, status: STUDENT_STATUS_CLASS_DELETED },
      data: { status: "active" },
    });
  });
}

// Hard-deletes the class and everything that belongs to it. Irreversible.
export async function purgeClassSection(classSectionId: string): Promise<void> {
  const [students, topics, assignments] = await Promise.all([
    prisma.studentStub.findMany({ where: { classSectionId }, select: { id: true, photoLocation: true } }),
    prisma.topic.findMany({
      where: { classSectionId },
      select: {
        id: true,
        contextSources: { select: { fileLocation: true } },
        observations: { select: { photoUrl: true } },
        attainmentReport: { select: { pdfFileLocation: true } },
      },
    }),
    prisma.assignment.findMany({
      where: { classSectionId },
      select: { id: true, submissions: { select: { photoFileLocation: true } } },
    }),
  ]);

  const studentIds = students.map((s) => s.id);
  const topicIds = topics.map((t) => t.id);
  const assignmentIds = assignments.map((a) => a.id);

  // Collected up front - the rows that point at them are gone after the delete.
  const storedFiles = [
    ...students.map((s) => s.photoLocation),
    ...topics.flatMap((t) => [
      ...t.contextSources.map((c) => c.fileLocation),
      ...t.observations.map((o) => o.photoUrl),
      t.attainmentReport?.pdfFileLocation,
    ]),
    ...assignments.flatMap((a) => a.submissions.map((s) => s.photoFileLocation)),
  ].filter((location): location is string => Boolean(location));

  await prisma.$transaction(
    async (tx) => {
      const assessments = await tx.assessment.findMany({ where: { classSectionId }, select: { id: true } });
      const assessmentIds = assessments.map((a) => a.id);
      const submissions = await tx.submission.findMany({ where: { assignmentId: { in: assignmentIds } }, select: { id: true } });
      const submissionIds = submissions.map((s) => s.id);

      await tx.grade.deleteMany({ where: { submissionId: { in: submissionIds } } });
      await tx.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await tx.personalisationSuggestion.deleteMany({
        where: { OR: [{ assignmentId: { in: assignmentIds } }, { studentStubId: { in: studentIds } }] },
      });
      await tx.answerKey.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await tx.assessmentResponse.deleteMany({
        where: { OR: [{ assessmentId: { in: assessmentIds } }, { studentStubId: { in: studentIds } }] },
      });
      await tx.studentInsightCache.deleteMany({ where: { studentStubId: { in: studentIds } } });
      await tx.communicationMessage.deleteMany({
        where: {
          OR: [
            { recipientClassSectionId: classSectionId },
            { topicId: { in: topicIds } },
            { recipientStudentStubId: { in: studentIds } },
            { senderStudentStubId: { in: studentIds } },
          ],
        },
      });
      await tx.assessment.deleteMany({ where: { classSectionId } });
      await tx.assignment.deleteMany({ where: { classSectionId } });

      await tx.contextSource.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.contextResearchJob.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.savedVideo.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.observation.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.attainmentReport.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.topicObjective.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.generation.deleteMany({ where: { topicId: { in: topicIds } } });
      await tx.topic.deleteMany({ where: { classSectionId } });

      await tx.lessonPlan.deleteMany({ where: { classSectionId } });
      await tx.timetableSlot.deleteMany({ where: { classSectionId } });
      await tx.classJoinRequest.deleteMany({ where: { classSectionId } });
      await tx.classSectionTeacher.deleteMany({ where: { classSectionId } });
      await tx.studentStub.deleteMany({ where: { classSectionId } });
      await tx.classSection.delete({ where: { id: classSectionId } });
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  // After commit: a storage failure must not undo (or fail) the data delete.
  await Promise.all(storedFiles.map((location) => storage.remove(location)));
}

// Worker job: hard-delete every class whose grace period has run out.
export async function purgeExpiredClassSections(): Promise<number> {
  const cutoff = new Date(Date.now() - CLASS_DELETE_GRACE_DAYS * DAY_MS);
  const expired = await prisma.classSection.findMany({ where: { deletedAt: { lte: cutoff } }, select: { id: true } });
  let purged = 0;
  for (const { id } of expired) {
    try {
      await purgeClassSection(id);
      purged++;
    } catch (err) {
      console.error(`[worker] failed to purge class ${id}`, err);
    }
  }
  return purged;
}
