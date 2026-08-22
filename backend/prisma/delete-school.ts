import { prisma } from "../src/lib/prisma";

// Every table below is ON DELETE RESTRICT to school_id (directly or
// transitively through topic/class_section/assignment/enquiry) - that's why
// DELETE /schools/:id in the API 409s on a non-empty school instead of
// deleting. This walks the same dependency graph manually, leaves first,
// inside one transaction so a partial failure rolls back everything rather
// than leaving the school half-deleted.
//
// Usage:
//   npx tsx prisma/delete-school.ts                  - lists all schools with id + row counts
//   npx tsx prisma/delete-school.ts <schoolId>        - dry run: shows what would be deleted
//   npx tsx prisma/delete-school.ts <schoolId> --yes  - actually deletes

async function listSchools() {
  const schools = await prisma.school.findMany({
    select: { id: true, name: true, status: true, trust: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  if (schools.length === 0) {
    console.log("No schools in this database.");
    return;
  }
  console.log("Schools:\n");
  for (const s of schools) {
    console.log(`  ${s.id}  ${s.name}  (${s.trust.name}, ${s.status})`);
  }
  console.log("\nRun again with a school id to see what deleting it would remove.");
}

async function countDependents(schoolId: string) {
  const [
    topics,
    generations,
    observations,
    contextSources,
    attainmentReports,
    communicationMessages,
    assignments,
    submissions,
    grades,
    personalisationSuggestions,
    answerKeys,
    enquiries,
    documents,
    enquiryStageHistory,
    enquiryNotes,
    followUpTasks,
    studentStubs,
    messageTemplates,
    pipelineStages,
    csvExportLogs,
    csvExportSchedule,
    aiUsageLogs,
    userSchoolAccess,
    schoolFormatTemplates,
    classBandConfig,
    subjects,
    lessonPlans,
    researchReports,
    classSectionTeachers,
    classSections,
    academicYears,
    users,
  ] = await Promise.all([
    prisma.topic.count({ where: { schoolId } }),
    prisma.generation.count({ where: { topic: { schoolId } } }),
    prisma.observation.count({ where: { topic: { schoolId } } }),
    prisma.contextSource.count({ where: { topic: { schoolId } } }),
    prisma.attainmentReport.count({ where: { topic: { schoolId } } }),
    prisma.communicationMessage.count({ where: { schoolId } }),
    prisma.assignment.count({ where: { schoolId } }),
    prisma.submission.count({ where: { assignment: { schoolId } } }),
    prisma.grade.count({ where: { submission: { assignment: { schoolId } } } }),
    prisma.personalisationSuggestion.count({ where: { assignment: { schoolId } } }),
    prisma.answerKey.count({ where: { assignment: { schoolId } } }),
    prisma.enquiry.count({ where: { schoolId } }),
    prisma.document.count({ where: { enquiry: { schoolId } } }),
    prisma.enquiryStageHistory.count({ where: { enquiry: { schoolId } } }),
    prisma.enquiryNote.count({ where: { enquiry: { schoolId } } }),
    prisma.followUpTask.count({ where: { enquiry: { schoolId } } }),
    prisma.studentStub.count({ where: { schoolId } }),
    prisma.messageTemplate.count({ where: { schoolId } }),
    prisma.pipelineStage.count({ where: { schoolId } }),
    prisma.csvExportLog.count({ where: { schoolId } }),
    prisma.csvExportSchedule.count({ where: { schoolId } }),
    prisma.aiUsageLog.count({ where: { schoolId } }),
    prisma.userSchoolAccess.count({ where: { schoolId } }),
    prisma.schoolFormatTemplate.count({ where: { schoolId } }),
    prisma.classBandConfig.count({ where: { schoolId } }),
    prisma.subject.count({ where: { schoolId } }),
    prisma.lessonPlan.count({ where: { schoolId } }),
    prisma.researchReport.count({ where: { schoolId } }),
    prisma.classSectionTeacher.count({ where: { classSection: { academicYear: { schoolId } } } }),
    prisma.classSection.count({ where: { academicYear: { schoolId } } }),
    prisma.academicYear.count({ where: { schoolId } }),
    prisma.appUser.count({ where: { schoolId } }),
  ]);

  return {
    topics, generations, observations, contextSources, attainmentReports, communicationMessages,
    assignments, submissions, grades, personalisationSuggestions, answerKeys,
    enquiries, documents, enquiryStageHistory, enquiryNotes, followUpTasks, studentStubs,
    messageTemplates, pipelineStages, csvExportLogs, csvExportSchedule, aiUsageLogs,
    userSchoolAccess, schoolFormatTemplates, classBandConfig, subjects,
    lessonPlans, researchReports, classSectionTeachers, classSections, academicYears, users,
  };
}

async function deleteSchool(schoolId: string) {
  await prisma.$transaction(async (tx) => {
    // --- Lesson Studio (Topic-rooted) ---
    await tx.generation.deleteMany({ where: { topic: { schoolId } } }); // implicit m2m join to contextSource cleaned automatically
    await tx.observation.deleteMany({ where: { topic: { schoolId } } });
    await tx.contextSource.deleteMany({ where: { topic: { schoolId } } });
    await tx.attainmentReport.deleteMany({ where: { topic: { schoolId } } });
    await tx.communicationMessage.deleteMany({ where: { schoolId } });

    // --- Assignment Lab ---
    await tx.grade.deleteMany({ where: { submission: { assignment: { schoolId } } } });
    await tx.submission.deleteMany({ where: { assignment: { schoolId } } });
    await tx.personalisationSuggestion.deleteMany({ where: { assignment: { schoolId } } });
    await tx.answerKey.deleteMany({ where: { assignment: { schoolId } } });
    await tx.assignment.deleteMany({ where: { schoolId } });

    await tx.topic.deleteMany({ where: { schoolId } });

    // --- Enrolment Growth Engine (Enquiry-rooted) ---
    await tx.document.deleteMany({ where: { enquiry: { schoolId } } });
    await tx.enquiryStageHistory.deleteMany({ where: { enquiry: { schoolId } } });
    await tx.enquiryNote.deleteMany({ where: { enquiry: { schoolId } } });
    await tx.followUpTask.deleteMany({ where: { enquiry: { schoolId } } });
    await tx.studentStub.deleteMany({ where: { schoolId } });
    await tx.enquiry.deleteMany({ where: { schoolId } });

    await tx.messageTemplate.deleteMany({ where: { schoolId } });
    await tx.pipelineStage.deleteMany({ where: { schoolId } });
    await tx.csvExportLog.deleteMany({ where: { schoolId } });
    await tx.csvExportSchedule.deleteMany({ where: { schoolId } });
    await tx.aiUsageLog.deleteMany({ where: { schoolId } });
    await tx.userSchoolAccess.deleteMany({ where: { schoolId } });
    await tx.schoolFormatTemplate.deleteMany({ where: { schoolId } });
    await tx.classBandConfig.deleteMany({ where: { schoolId } });
    await tx.subject.deleteMany({ where: { schoolId } });
    await tx.lessonPlan.deleteMany({ where: { schoolId } });
    await tx.researchReport.deleteMany({ where: { schoolId } });

    // --- Class structure ---
    await tx.classSectionTeacher.deleteMany({ where: { classSection: { academicYear: { schoolId } } } });
    await tx.classSection.deleteMany({ where: { academicYear: { schoolId } } });
    await tx.academicYear.deleteMany({ where: { schoolId } });

    // --- Staff belonging to this school (their required FKs are all clear by now) ---
    await tx.appUser.deleteMany({ where: { schoolId } });

    // --- The school itself ---
    await tx.school.delete({ where: { id: schoolId } });
  });
}

async function main() {
  const [, , schoolId, flag] = process.argv;

  if (!schoolId) {
    await listSchools();
    return;
  }

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
  if (!school) {
    console.error(`No school with id ${schoolId}`);
    process.exit(1);
  }

  const counts = await countDependents(schoolId);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  console.log(`School: ${school.name} (${school.id})`);
  console.log(`This will permanently delete ${total} related row(s):`);
  for (const [table, count] of Object.entries(counts)) {
    if (count > 0) console.log(`  ${table}: ${count}`);
  }
  console.log(`  (and the school row itself)`);

  const trust = await prisma.trust.findUnique({
    where: { id: (await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { trustId: true } })).trustId },
    select: { id: true, name: true, _count: { select: { schools: true } } },
  });

  if (flag !== "--yes") {
    console.log(`\nTrust: ${trust!.name} (${trust!.id}) - has ${trust!._count.schools} school(s) total.`);
    if (trust!._count.schools === 1) {
      console.log(`This is its only school - the trust will also be deleted once this school is gone.`);
    } else {
      console.log(`The trust has other schools too, so it will be left in place.`);
    }
    console.log(`\nDry run only - nothing deleted. Re-run with --yes to actually delete:`);
    console.log(`  npx tsx prisma/delete-school.ts ${schoolId} --yes`);
    return;
  }

  await deleteSchool(schoolId);
  console.log(`Deleted "${school.name}" and all related data.`);

  // Only remove the trust if this was its last school - a trust can own
  // several schools, and this script only ever targets one at a time.
  const remaining = await prisma.school.count({ where: { trustId: trust!.id } });
  if (remaining === 0) {
    await prisma.trust.delete({ where: { id: trust!.id } });
    console.log(`Trust "${trust!.name}" had no schools left - deleted it too.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
