import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { seedDefaultPipelineStages } from "../src/lib/pipeline-stages";

async function main() {
  const passwordHash = await bcrypt.hash("Admin@123", 10);

  // Individual-teacher onboarding + credits/billing
  // (Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-credits.md).
  // Credit resolution order at seat-creation: Trust.planId's Plan, else the
  // Plan with isDefault true, else this PlatformSetting as a last-resort
  // numeric fallback - so the platform never has zero source of truth for
  // the grant amount even before a Plan row exists.
  const defaultPlan = await prisma.plan.upsert({
    where: { id: "00000000-0000-0000-0000-000000000030" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000030",
      name: "Standard",
      creditsPerTeacherSeat: 5000,
      isDefault: true,
    },
  });

  await prisma.platformSetting.upsert({
    where: { key: "individual_default_credits" },
    update: {},
    create: { key: "individual_default_credits", value: "5000" },
  });

  await prisma.platformSetting.upsert({
    where: { key: "individual_default_class_limit" },
    update: {},
    create: { key: "individual_default_class_limit", value: "2" },
  });

  await prisma.platformSetting.upsert({
    where: { key: "individual_default_subject_limit" },
    update: {},
    create: { key: "individual_default_subject_limit", value: "2" },
  });

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

  const standardSubjects = [
    "Mathematics",
    "Science",
    "English",
    "Social Studies",
    "Environmental Studies (EVS)",
    "Hindi",
    "Computer Science",
  ];
  for (const name of standardSubjects) {
    await prisma.subject.upsert({
      where: { schoolId_name: { schoolId: school.id, name } },
      update: {},
      create: { schoolId: school.id, name },
    });
  }

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

  await prisma.teacherCreditAccount.upsert({
    where: { teacherUserId: teacher.id },
    update: {},
    create: { teacherUserId: teacher.id, balance: defaultPlan.creditsPerTeacherSeat },
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

  // Without this, the dev teacher would see zero classes in Lesson Studio's
  // "My Classes" screen after teacher-to-class assignment became a real gate.
  await prisma.classSectionTeacher.upsert({
    where: { classSectionId_teacherUserId: { classSectionId: classSection.id, teacherUserId: teacher.id } },
    update: {},
    create: { classSectionId: classSection.id, teacherUserId: teacher.id },
  });

  const studentEnquiry = await prisma.enquiry.upsert({
    where: { id: "00000000-0000-0000-0000-000000000012" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000012",
      schoolId: school.id,
      academicYearId: academicYear.id,
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

  // Assignment Lab demo content - gives the teacher app's Assignment Lab
  // home, detail, answer key, personalisation, and grading review screens
  // real variety to show instead of one lonely assignment each. Named after
  // the Figma reference set (Aarav Sharma / Ananya Singh / Rohan Mehta) so
  // the seeded data visually matches what the screens were designed against.
  const [aarav, ananya, rohan, kavya] = await Promise.all([
    prisma.studentStub.upsert({
      where: { id: "00000000-0000-0000-0000-000000000018" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000018",
        schoolId: school.id,
        fullName: "Aarav Sharma",
        dateOfBirth: new Date("2016-02-14"),
        classSectionId: classSection.id,
        guardianName: "Meera Sharma",
        guardianContact: "+911234500018",
        admissionDate: new Date("2026-06-01"),
      },
    }),
    prisma.studentStub.upsert({
      where: { id: "00000000-0000-0000-0000-000000000019" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000019",
        schoolId: school.id,
        fullName: "Ananya Singh",
        dateOfBirth: new Date("2016-07-22"),
        classSectionId: classSection.id,
        guardianName: "Rakesh Singh",
        guardianContact: "+911234500019",
        admissionDate: new Date("2026-06-01"),
      },
    }),
    prisma.studentStub.upsert({
      where: { id: "00000000-0000-0000-0000-000000000020" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000020",
        schoolId: school.id,
        fullName: "Rohan Mehta",
        dateOfBirth: new Date("2016-11-03"),
        classSectionId: classSection.id,
        guardianName: "Sunita Mehta",
        guardianContact: "+911234500020",
        admissionDate: new Date("2026-06-01"),
      },
    }),
    prisma.studentStub.upsert({
      where: { id: "00000000-0000-0000-0000-000000000021" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000021",
        schoolId: school.id,
        fullName: "Kavya Nair",
        dateOfBirth: new Date("2016-05-30"),
        classSectionId: classSection.id,
        guardianName: "Anil Nair",
        guardianContact: "+911234500021",
        admissionDate: new Date("2026-06-01"),
      },
    }),
  ]);

  const cellStructureTopic = await prisma.topic.upsert({
    where: { id: "00000000-0000-0000-0000-000000000026" },
    update: { teacherUserId: teacher.id },
    create: {
      id: "00000000-0000-0000-0000-000000000026",
      schoolId: school.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      subject: "Biology",
      name: "Cell Structure",
      board: "CBSE",
      status: "active",
    },
  });

  const bodySystemsTopic = await prisma.topic.upsert({
    where: { id: "00000000-0000-0000-0000-000000000022" },
    update: { teacherUserId: teacher.id },
    create: {
      id: "00000000-0000-0000-0000-000000000022",
      schoolId: school.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      subject: "Biology",
      name: "Human Body Systems",
      board: "CBSE",
      status: "active",
    },
  });

  // 1. A draft, never published - populates the "Drafts" filter on the
  // Assignment Lab home screen and exercises Edit/Delete on the detail
  // screen. Pre-seeded with a partially-verified answer key so the Answer
  // Key screen has real content without needing a live AI call.
  const cellStructureDraft = await prisma.assignment.upsert({
    where: { id: "00000000-0000-0000-0000-000000000023" },
    update: { teacherUserId: teacher.id, topicId: cellStructureTopic.id },
    create: {
      id: "00000000-0000-0000-0000-000000000023",
      schoolId: school.id,
      topicId: cellStructureTopic.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      title: "Cell Structure Quiz",
      questions: [
        { id: "q1", prompt: "What is the powerhouse of the cell?", difficulty: "easy" },
        { id: "q2", prompt: "Name the organelle that controls the cell's activities.", difficulty: "easy" },
        { id: "q3", prompt: "What is the function of the cell membrane?", difficulty: "medium" },
        { id: "q4", prompt: "How do plant cells differ from animal cells?", difficulty: "medium" },
        { id: "q5", prompt: "Explain the role of ribosomes in protein synthesis.", difficulty: "hard" },
        { id: "q6", prompt: "Describe how the endoplasmic reticulum supports the cell.", difficulty: "hard" },
      ],
      personalisationEnabled: true,
      status: "draft",
    },
  });

  const cellStructureAnswers: { questionId: string; aiAnswer: string; verified: boolean; marks: number }[] = [
    { questionId: "q1", aiAnswer: "The mitochondria - it produces the cell's energy (ATP).", verified: true, marks: 1 },
    { questionId: "q2", aiAnswer: "The nucleus.", verified: true, marks: 1 },
    { questionId: "q3", aiAnswer: "It controls what enters and leaves the cell.", verified: true, marks: 1 },
    { questionId: "q4", aiAnswer: "Plant cells have a cell wall, chloroplasts, and a large vacuole; animal cells don't.", verified: false, marks: 2 },
    { questionId: "q5", aiAnswer: "Ribosomes read mRNA and assemble amino acids into proteins.", verified: false, marks: 2 },
    { questionId: "q6", aiAnswer: "It transports proteins and lipids made in the cell.", verified: false, marks: 2 },
  ];
  await Promise.all(
    cellStructureAnswers.map((a, index) =>
      prisma.answerKey.upsert({
        where: { assignmentId_questionId: { assignmentId: cellStructureDraft.id, questionId: a.questionId } },
        update: {},
        create: {
          assignmentId: cellStructureDraft.id,
          questionId: a.questionId,
          questionIndex: index,
          aiAnswer: a.aiAnswer,
          teacherVerifiedAnswer: a.verified ? a.aiAnswer : null,
          marks: a.marks,
        },
      })
    )
  );

  // 2. Published, no personalisation, submissions spanning every grading
  // state - populates Grading Review's stat header, filter chips, and
  // per-question detail all at once.
  const respirationAssignment = await prisma.assignment.upsert({
    where: { id: "00000000-0000-0000-0000-000000000024" },
    update: { teacherUserId: teacher.id },
    create: {
      id: "00000000-0000-0000-0000-000000000024",
      schoolId: school.id,
      topicId: bodySystemsTopic.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      title: "Human Respiration Quiz",
      questions: [
        { id: "q1", prompt: "What is the main organ of the respiratory system?" },
        { id: "q2", prompt: "What gas do we breathe in, and what do we breathe out?" },
        { id: "q3", prompt: "Describe the path air takes from the nose to the lungs." },
        { id: "q4", prompt: "Why do muscles need oxygen during exercise?" },
      ],
      status: "published",
      publishedAt: new Date(),
    },
  });

  await Promise.all(
    ["q1", "q2"].map((questionId, index) =>
      prisma.answerKey.upsert({
        where: { assignmentId_questionId: { assignmentId: respirationAssignment.id, questionId } },
        update: {},
        create: {
          assignmentId: respirationAssignment.id,
          questionId,
          questionIndex: index,
          aiAnswer: questionId === "q1" ? "The lungs." : "We breathe in oxygen and breathe out carbon dioxide.",
          teacherVerifiedAnswer: questionId === "q1" ? "The lungs." : "We breathe in oxygen and breathe out carbon dioxide.",
          marks: 1,
        },
      })
    )
  );

  // Ananya: submitted, not yet graded.
  const ananyaSubmission = await prisma.submission.upsert({
    where: { assignmentId_studentStubId: { assignmentId: respirationAssignment.id, studentStubId: ananya.id } },
    update: {},
    create: {
      assignmentId: respirationAssignment.id,
      studentStubId: ananya.id,
      answers: { q1: "The lungs.", q2: "Oxygen in, carbon dioxide out.", q3: "Nose, throat, windpipe, then lungs.", q4: "To release energy from food." },
      submissionType: "online",
    },
  });
  await prisma.grade.upsert({
    where: { submissionId: ananyaSubmission.id },
    update: {},
    create: { submissionId: ananyaSubmission.id, status: "pending" },
  });

  // Rohan: AI-graded and flagged for review (weak, partly-blank answers).
  const rohanSubmission = await prisma.submission.upsert({
    where: { assignmentId_studentStubId: { assignmentId: respirationAssignment.id, studentStubId: rohan.id } },
    update: {},
    create: {
      assignmentId: respirationAssignment.id,
      studentStubId: rohan.id,
      answers: { q1: "The lungs", q2: "", q3: "Not sure", q4: "" },
      submissionType: "online",
    },
  });
  await prisma.grade.upsert({
    where: { submissionId: rohanSubmission.id },
    update: {},
    create: {
      submissionId: rohanSubmission.id,
      aiScore: 32,
      aiFeedback: "Two of four questions were left blank or unclear. Recommend reviewing with the student before releasing.",
      aiNextStep: "Revisit q2 and q4 with Rohan one-to-one before the next respiration assessment.",
      questionDetails: [
        { questionId: "q1", correct: true, marksAwarded: 1, note: "Correctly identifies the lungs." },
        { questionId: "q2", correct: false, marksAwarded: 0, note: "Left blank." },
        { questionId: "q3", correct: false, marksAwarded: 0, note: "\"Not sure\" - no attempt at the actual pathway." },
        { questionId: "q4", correct: false, marksAwarded: 0, note: "Left blank." },
      ] satisfies Prisma.InputJsonValue,
      performanceBand: "level_3",
      flaggedForAttention: true,
      status: "ai_graded",
    },
  });

  // Kavya: graded and released - shows the "released to student" end state.
  const kavyaSubmission = await prisma.submission.upsert({
    where: { assignmentId_studentStubId: { assignmentId: respirationAssignment.id, studentStubId: kavya.id } },
    update: {},
    create: {
      assignmentId: respirationAssignment.id,
      studentStubId: kavya.id,
      answers: {
        q1: "The lungs.",
        q2: "We breathe in oxygen and breathe out carbon dioxide.",
        q3: "Air goes through the nose, down the trachea, and into the lungs through the bronchi.",
        q4: "Muscles need oxygen to release energy from glucose during exercise.",
      },
      submissionType: "online",
    },
  });
  await prisma.grade.upsert({
    where: { submissionId: kavyaSubmission.id },
    update: {},
    create: {
      submissionId: kavyaSubmission.id,
      aiScore: 88,
      aiFeedback: "Clear, complete answers across all four questions.",
      aiNextStep: "Ready for a slightly harder question set on this topic next time.",
      questionDetails: [
        { questionId: "q1", correct: true, marksAwarded: 1, note: "Correct." },
        { questionId: "q2", correct: true, marksAwarded: 1, note: "Correct." },
        { questionId: "q3", correct: true, marksAwarded: 1, note: "Accurately describes the pathway." },
        { questionId: "q4", correct: true, marksAwarded: 1, note: "Correctly explains the link to energy release." },
      ] satisfies Prisma.InputJsonValue,
      performanceBand: "level_1",
      finalScore: 88,
      finalFeedback: "Excellent work, Kavya - fully correct and well explained.",
      status: "released",
      releasedToStudent: true,
      releasedAt: new Date(),
    },
  });
  // Aarav has no submission yet on this assignment - deliberately left as
  // the "not submitted" case in the Grading Review stat header.

  // 3. Published, personalisation enabled, decisions spanning pending /
  // approved / opted-out - populates the Personalisation Review screen.
  const bodySystemsAssignment = await prisma.assignment.upsert({
    where: { id: "00000000-0000-0000-0000-000000000025" },
    update: { teacherUserId: teacher.id },
    create: {
      id: "00000000-0000-0000-0000-000000000025",
      schoolId: school.id,
      topicId: bodySystemsTopic.id,
      teacherUserId: teacher.id,
      classSectionId: classSection.id,
      title: "Human Body Systems Practice",
      questions: [
        { id: "q1", prompt: "Name one organ in the digestive system.", difficulty: "easy" },
        { id: "q2", prompt: "What does the heart do?", difficulty: "easy" },
        { id: "q3", prompt: "Explain how blood circulates through the body.", difficulty: "medium" },
        { id: "q4", prompt: "What is the role of the skeletal system?", difficulty: "medium" },
        { id: "q5", prompt: "Explain how the nervous and muscular systems work together.", difficulty: "hard" },
      ],
      personalisationEnabled: true,
      status: "published",
      publishedAt: new Date(),
    },
  });

  await prisma.personalisationSuggestion.upsert({
    where: { assignmentId_studentStubId: { assignmentId: bodySystemsAssignment.id, studentStubId: aarav.id } },
    update: {},
    create: {
      assignmentId: bodySystemsAssignment.id,
      studentStubId: aarav.id,
      suggestedMix: { easy: 1, medium: 3, hard: 1 },
      reasoning: "Aarav has a moderate average of 65% across 3 prior submissions on this topic.",
      status: "pending",
    },
  });
  await prisma.personalisationSuggestion.upsert({
    where: { assignmentId_studentStubId: { assignmentId: bodySystemsAssignment.id, studentStubId: ananya.id } },
    update: {},
    create: {
      assignmentId: bodySystemsAssignment.id,
      studentStubId: ananya.id,
      suggestedMix: { easy: 2, medium: 2, hard: 1 },
      reasoning: "Ananya has a strong average of 84% across 4 prior submissions on this topic.",
      status: "approved",
      appliedMix: { easy: 2, medium: 2, hard: 1 },
      decidedByUserId: teacher.id,
      decidedAt: new Date(),
    },
  });
  await prisma.personalisationSuggestion.upsert({
    where: { assignmentId_studentStubId: { assignmentId: bodySystemsAssignment.id, studentStubId: rohan.id } },
    update: {},
    create: {
      assignmentId: bodySystemsAssignment.id,
      studentStubId: rohan.id,
      suggestedMix: { easy: 3, medium: 1, hard: 1 },
      reasoning: "Rohan has no prior graded work on this topic yet, so a balanced default mix is suggested.",
      status: "opted_out",
      appliedMix: Prisma.DbNull,
      decidedByUserId: teacher.id,
      decidedAt: new Date(),
    },
  });
  // Kavya has no suggestion at all - she'll show up in the "Personalisation
  // unavailable" section since she has no prior graded work on this topic.

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
    defaultPlan: `${defaultPlan.name} (${defaultPlan.creditsPerTeacherSeat} credits/seat)`,
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
  console.log("Login with: platform@eduwand.local / Admin@123 (platform_admin, no trust/school)");
  console.log("Login with: admin@dev.eduwand.local / Admin@123 (Dev School)");
  console.log("Login with: counsellor@dev.eduwand.local / Admin@123 (Dev School, counsellor role)");
  console.log("Login with: frontdesk@dev.eduwand.local / Admin@123 (Dev School, front_desk role)");
  console.log("Login with: teacher@dev.eduwand.local / Admin@123 (Dev School, teacher role)");
  console.log("Login with: admin2@dev.eduwand.local / Admin@123 (Dev School 2)");
  console.log("Login with: leadership@dev.eduwand.local / Admin@123 (trust-scoped, no school_id)");
  console.log("Student login: phone +911234567890 (Dev Student, Grade 5 A) via /auth/student/request-otp");
  console.log(`Student demo content: "${openAssignment.title}" (open, not submitted), "${gradedAssignment.title}" (graded 90/100), 1 material, 1 class broadcast`);
  console.log(
    `Assignment Lab demo content: "${cellStructureDraft.title}" (draft, partial answer key), ` +
      `"${respirationAssignment.title}" (published - 1 ungraded, 1 flagged, 1 released, 1 not submitted), ` +
      `"${bodySystemsAssignment.title}" (published, personalisation pending/approved/opted-out). ` +
      `Students: ${aarav.fullName}, ${ananya.fullName}, ${rohan.fullName}, ${kavya.fullName}.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
