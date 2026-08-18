import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { seedDefaultPipelineStages } from "../src/lib/pipeline-stages";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const trust = await prisma.trust.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Dev Trust",
      status: "active",
    },
  });

  const school = await prisma.school.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      trustId: trust.id,
      name: "Dev School",
      board: "CBSE",
      status: "active",
    },
  });

  const admin = await prisma.appUser.upsert({
    where: { email: "admin@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Admin",
      email: "admin@dev.eduwand.local",
      role: "admin",
      status: "active",
      passwordHash,
    },
  });

  const counsellor = await prisma.appUser.upsert({
    where: { email: "counsellor@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Counsellor",
      email: "counsellor@dev.eduwand.local",
      role: "counsellor",
      status: "active",
      passwordHash,
    },
  });

  const frontDesk = await prisma.appUser.upsert({
    where: { email: "frontdesk@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Front Desk",
      email: "frontdesk@dev.eduwand.local",
      role: "front_desk",
      status: "active",
      passwordHash,
    },
  });

  const teacher = await prisma.appUser.upsert({
    where: { email: "teacher@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Teacher",
      email: "teacher@dev.eduwand.local",
      role: "teacher",
      status: "active",
      passwordHash,
    },
  });

  await seedDefaultPipelineStages(school.id);

  const academicYear = await prisma.academicYear.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      schoolId: school.id,
      label: "2026-2027",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-04-30"),
      isCurrent: true,
    },
  });

  const classSection = await prisma.classSection.upsert({
    where: { id: "00000000-0000-0000-0000-000000000011" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      academicYearId: academicYear.id,
      className: "Grade 5",
      sectionName: "A",
    },
  });

  const studentEnquiry = await prisma.enquiry.upsert({
    where: { id: "00000000-0000-0000-0000-000000000012" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000012",
      schoolId: school.id,
      contactName: "Dev Guardian",
      contactPhone: "+911234567890",
      source: "walk_in",
      status: "enrolled",
      consentCaptured: true,
    },
  });

  const student = await prisma.studentStub.upsert({
    where: { sourceEnquiryId: studentEnquiry.id },
    update: {},
    create: {
      schoolId: school.id,
      sourceEnquiryId: studentEnquiry.id,
      fullName: "Dev Student",
      dateOfBirth: new Date("2016-04-10"),
      classSectionId: classSection.id,
      guardianName: "Dev Guardian",
      guardianContact: "+911234567890",
      admissionDate: new Date("2026-06-01"),
    },
  });

  // Demo content so the student panel's Home/Materials/Results screens show
  // something real instead of empty states - all five student screens are
  // already fully built and wired, this just gives them data to display.
  const topic = await prisma.topic.upsert({
    where: { id: "00000000-0000-0000-0000-000000000013" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000013",
      schoolId: school.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      subject: "Science",
      name: "Photosynthesis",
      board: "CBSE",
      status: "active",
    },
  });

  await prisma.generation.upsert({
    where: { id: "00000000-0000-0000-0000-000000000014" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000014",
      topicId: topic.id,
      teacherUserId: teacher.id,
      outputType: "lesson_plan",
      aiOutput:
        "Photosynthesis converts light energy into chemical energy. Plants use sunlight, water, and carbon dioxide to produce glucose and oxygen. Key stages: light-dependent reactions and the Calvin cycle.",
      modelUsed: "claude-sonnet",
      generationStatus: "succeeded",
    },
  });

  // Not yet submitted - lets the demo student actually exercise the submit flow.
  const openAssignment = await prisma.assignment.upsert({
    where: { id: "00000000-0000-0000-0000-000000000015" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000015",
      schoolId: school.id,
      topicId: topic.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      title: "Fractions Practice",
      questions: [
        { id: "q1", prompt: "What is 3/4 + 1/8?" },
        { id: "q2", prompt: "Simplify 6/8 to its lowest terms." },
      ],
      status: "published",
      publishedAt: new Date(),
    },
  });

  // Already submitted and graded - lets Home/Results show a released grade immediately.
  const gradedAssignment = await prisma.assignment.upsert({
    where: { id: "00000000-0000-0000-0000-000000000016" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000016",
      schoolId: school.id,
      topicId: topic.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      title: "Photosynthesis Quiz",
      questions: [
        { id: "q1", prompt: "What gas do plants absorb during photosynthesis?" },
        { id: "q2", prompt: "Name the two main stages of photosynthesis." },
      ],
      status: "published",
      publishedAt: new Date(),
    },
  });

  const gradedSubmission = await prisma.submission.upsert({
    where: { assignmentId_studentStubId: { assignmentId: gradedAssignment.id, studentStubId: student.id } },
    update: {},
    create: {
      assignmentId: gradedAssignment.id,
      studentStubId: student.id,
      answers: { q1: "Carbon dioxide", q2: "Light-dependent reactions and the Calvin cycle" },
      submissionType: "online",
    },
  });

  await prisma.grade.upsert({
    where: { submissionId: gradedSubmission.id },
    update: {},
    create: {
      submissionId: gradedSubmission.id,
      aiScore: 90,
      aiFeedback: "Strong answers, both key terms correctly identified.",
      finalScore: 90,
      finalFeedback: "Great work! Fully correct.",
      performanceBand: "level_1",
      status: "released",
      releasedToStudent: true,
      releasedAt: new Date(),
    },
  });

  // teacher_to_class, not teacher_to_student - exercises the class-broadcast channel.
  await prisma.communicationMessage.upsert({
    where: { id: "00000000-0000-0000-0000-000000000017" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000017",
      schoolId: school.id,
      channel: "teacher_to_class",
      senderUserId: teacher.id,
      recipientClassSectionId: classSection.id,
      body: "Welcome back! Don't forget to submit the Fractions Practice assignment by Friday.",
      deliveryStatus: "sent",
      sentAt: new Date(),
    },
  });

  const otherSchool = await prisma.school.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      trustId: trust.id,
      name: "Dev School 2",
      board: "ICSE",
      status: "active",
    },
  });

  await seedDefaultPipelineStages(otherSchool.id);

  const otherSchoolAdmin = await prisma.appUser.upsert({
    where: { email: "admin2@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: otherSchool.id,
      fullName: "Dev Admin 2",
      email: "admin2@dev.eduwand.local",
      role: "admin",
      status: "active",
      passwordHash,
    },
  });

  const trustLeadership = await prisma.appUser.upsert({
    where: { email: "leadership@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: null,
      fullName: "Dev Trust Leadership",
      email: "leadership@dev.eduwand.local",
      role: "leadership",
      status: "active",
      passwordHash,
    },
  });

  const platformAdmin = await prisma.appUser.upsert({
    where: { email: "platform@eduwand.local" },
    update: {},
    create: {
      trustId: null,
      schoolId: null,
      fullName: "EduWand Platform Admin",
      email: "platform@eduwand.local",
      role: "platform_admin",
      status: "active",
      passwordHash,
    },
  });

  console.log("Seeded:", {
    trust: trust.name,
    school: school.name,
    classSection: `${classSection.className} ${classSection.sectionName}`,
    student: student.fullName,
    otherSchool: otherSchool.name,
    admin: admin.email,
    counsellor: counsellor.email,
    frontDesk: frontDesk.email,
    teacher: teacher.email,
    otherSchoolAdmin: otherSchoolAdmin.email,
    trustLeadership: trustLeadership.email,
    platformAdmin: platformAdmin.email,
  });
  console.log("Login with: platform@eduwand.local / password123 (platform_admin, no trust/school)");
  console.log("Login with: admin@dev.eduwand.local / password123 (Dev School)");
  console.log("Login with: counsellor@dev.eduwand.local / password123 (Dev School, counsellor role)");
  console.log("Login with: frontdesk@dev.eduwand.local / password123 (Dev School, front_desk role)");
  console.log("Login with: teacher@dev.eduwand.local / password123 (Dev School, teacher role)");
  console.log("Login with: admin2@dev.eduwand.local / password123 (Dev School 2)");
  console.log("Login with: leadership@dev.eduwand.local / password123 (trust-scoped, no school_id)");
  console.log("Student login: phone +911234567890 (Dev Student, Grade 5 A) via /auth/student/request-otp");
  console.log(`Student demo content: "${openAssignment.title}" (open, not submitted), "${gradedAssignment.title}" (graded 90/100), 1 material, 1 class broadcast`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
