// One-off demo-data seeder for the "Student report insights" feature -
// creates objective-tagged questions, an assignment, and graded submissions
// with deliberately varied per-objective/difficulty performance across a few
// students, so the Performance report's Student report has something real
// (and interesting) to show for the salimsandhey@gmail.com teacher account.
// Run once with: npx tsx scripts/seed-student-insight-demo.ts
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const TEACHER_EMAIL = "salimsandhey@gmail.com";

interface QuestionSpec {
  id: string;
  prompt: string;
  type: "mcq" | "short_answer";
  difficulty: "easy" | "medium" | "hard";
  objectiveKey: "dalton" | "structure" | "molecules";
  options?: string[];
  correctOptionIndex?: number;
  modelAnswer: string;
}

const QUESTIONS: QuestionSpec[] = [
  {
    id: "q1",
    prompt: "Which of these is a postulate of Dalton's Atomic Theory?",
    type: "mcq",
    difficulty: "easy",
    objectiveKey: "dalton",
    options: ["Atoms can be divided infinitely", "All matter is made of tiny indivisible atoms", "Atoms of different elements are identical", "Atoms are visible to the naked eye"],
    correctOptionIndex: 1,
    modelAnswer: "All matter is made of tiny indivisible atoms",
  },
  {
    id: "q2",
    prompt: "State one limitation of Dalton's Atomic Theory that was later disproved.",
    type: "short_answer",
    difficulty: "medium",
    objectiveKey: "dalton",
    modelAnswer: "Atoms are not actually indivisible - they contain protons, neutrons and electrons.",
  },
  {
    id: "q3",
    prompt: "Which subatomic particle carries a negative charge?",
    type: "mcq",
    difficulty: "easy",
    objectiveKey: "structure",
    options: ["Proton", "Neutron", "Electron", "Nucleus"],
    correctOptionIndex: 2,
    modelAnswer: "Electron",
  },
  {
    id: "q4",
    prompt: "Explain why an atom is electrically neutral even though it contains charged particles.",
    type: "short_answer",
    difficulty: "hard",
    objectiveKey: "structure",
    modelAnswer: "The number of protons (positive) equals the number of electrons (negative), so their charges cancel out.",
  },
  {
    id: "q5",
    prompt: "Which of these is a molecule rather than a single atom?",
    type: "mcq",
    difficulty: "medium",
    objectiveKey: "molecules",
    options: ["Na", "O2", "Fe", "He"],
    correctOptionIndex: 1,
    modelAnswer: "O2",
  },
  {
    id: "q6",
    prompt: "Differentiate between an atom and a molecule, with one example of each.",
    type: "short_answer",
    difficulty: "hard",
    objectiveKey: "molecules",
    modelAnswer: "An atom (e.g. a single oxygen atom, O) is the smallest unit of an element; a molecule (e.g. O2 or H2O) is two or more atoms bonded together.",
  },
];

const OBJECTIVES: Record<QuestionSpec["objectiveKey"], { text: string; bloomsStage: string; benchmarkPercent: number }> = {
  dalton: { text: "Explain the postulates of Dalton's Atomic Theory", bloomsStage: "Understand", benchmarkPercent: 75 },
  structure: { text: "Describe the structure of an atom (protons, neutrons, electrons)", bloomsStage: "Understand", benchmarkPercent: 75 },
  molecules: { text: "Differentiate between atoms and molecules", bloomsStage: "Analyze", benchmarkPercent: 70 },
};

// Per student, per question id: whether they got it right (marksAwarded 1) or wrong (0).
// Deliberately varied so the insights have something real to say:
// - Salim: strong on atomic-theory questions, weak on the molecules objective.
// - Ananya: strong all round, the "strongest" student.
// - Rohit: struggles especially on hard questions, the "needs support" student.
const STUDENT_PERFORMANCE: Record<string, Record<string, boolean>> = {
  Salim: { q1: true, q2: true, q3: true, q4: false, q5: false, q6: false },
  "Ananya Sharma": { q1: true, q2: true, q3: true, q4: true, q5: true, q6: false },
  "Rohit Verma": { q1: true, q2: false, q3: true, q4: false, q5: false, q6: false },
};

async function main() {
  const teacher = await prisma.appUser.findFirst({ where: { email: TEACHER_EMAIL } });
  if (!teacher) throw new Error(`No AppUser found with email ${TEACHER_EMAIL}`);

  const topic = await prisma.topic.findFirst({
    where: { schoolId: teacher.schoolId, name: "Atoms" },
    include: { classSection: true },
  });
  if (!topic) throw new Error('No "Atoms" topic found for this teacher\'s school - create one first.');

  console.log(`Seeding demo data for teacher ${teacher.fullName} (${teacher.email}), topic "${topic.name}" (${topic.classSection.className} ${topic.classSection.sectionName})`);

  // 1. Materialize the three objectives with real benchmarks.
  const objectiveIdByKey: Record<string, string> = {};
  for (const [key, o] of Object.entries(OBJECTIVES)) {
    const row = await prisma.topicObjective.upsert({
      where: { topicId_text: { topicId: topic.id, text: o.text } },
      create: { topicId: topic.id, text: o.text, bloomsStage: o.bloomsStage, benchmarkPercent: o.benchmarkPercent },
      update: { bloomsStage: o.bloomsStage },
    });
    objectiveIdByKey[key] = row.id;
    console.log(`  objective "${o.text}" -> ${row.id} (benchmark ${o.benchmarkPercent}%)`);
  }

  // 2. Build the stored question JSON, each tagged with its objectiveId.
  const storedQuestions = QUESTIONS.map((q) => {
    const base: Record<string, unknown> = {
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      difficulty: q.difficulty,
      objectiveId: objectiveIdByKey[q.objectiveKey],
    };
    if (q.type === "mcq") {
      base.options = q.options;
      base.correctOptionIndex = q.correctOptionIndex;
    }
    return base;
  });

  // 3. Create (or reuse) a published assignment carrying these questions.
  const existing = await prisma.assignment.findFirst({ where: { topicId: topic.id, title: "Atoms - Structure & Theory Quiz" } });
  const assignment = existing
    ? await prisma.assignment.update({
        where: { id: existing.id },
        data: { questions: storedQuestions, status: "published", publishedAt: existing.publishedAt ?? new Date() },
      })
    : await prisma.assignment.create({
        data: {
          schoolId: teacher.schoolId,
          topicId: topic.id,
          teacherUserId: teacher.id,
          classSectionId: topic.classSectionId,
          title: "Atoms - Structure & Theory Quiz",
          questions: storedQuestions,
          status: "published",
          publishedAt: new Date(),
        },
      });
  console.log(`  assignment "${assignment.title}" -> ${assignment.id}`);

  for (const q of QUESTIONS) {
    await prisma.answerKey.upsert({
      where: { assignmentId_questionId: { assignmentId: assignment.id, questionId: q.id } },
      create: {
        assignmentId: assignment.id,
        questionId: q.id,
        questionIndex: QUESTIONS.indexOf(q),
        aiAnswer: q.modelAnswer,
        teacherVerifiedAnswer: q.modelAnswer,
        marks: 1,
      },
      update: { teacherVerifiedAnswer: q.modelAnswer },
    });
  }

  // 4. Ensure the demo students exist in this class.
  const studentByName: Record<string, string> = {};
  for (const fullName of Object.keys(STUDENT_PERFORMANCE)) {
    const found = await prisma.studentStub.findFirst({ where: { classSectionId: topic.classSectionId, fullName } });
    const student =
      found ??
      (await prisma.studentStub.create({
        data: {
          schoolId: teacher.schoolId,
          fullName,
          dateOfBirth: new Date("2012-04-15"),
          admissionDate: new Date("2026-04-01"),
          classSectionId: topic.classSectionId,
          guardianName: `${fullName}'s Guardian`,
          guardianContact: "9999999999",
        },
      }));
    studentByName[fullName] = student.id;
    console.log(`  student "${fullName}" -> ${student.id}${found ? " (existing)" : " (created)"}`);
  }

  // 5. Create a submission + grade per student, with per-question detail
  // matching STUDENT_PERFORMANCE above.
  for (const [fullName, studentId] of Object.entries(studentByName)) {
    const performance = STUDENT_PERFORMANCE[fullName];
    const answers: Record<string, string> = {};
    for (const q of QUESTIONS) {
      answers[q.id] = performance[q.id] ? q.modelAnswer : "I'm not fully sure about this one.";
    }

    const submission = await prisma.submission.upsert({
      where: { assignmentId_studentStubId: { assignmentId: assignment.id, studentStubId: studentId } },
      create: { assignmentId: assignment.id, studentStubId: studentId, answers, submittedAt: new Date() },
      update: { answers },
    });

    const questionDetails = QUESTIONS.map((q) => ({
      questionId: q.id,
      correct: performance[q.id],
      marksAwarded: performance[q.id] ? 1 : 0,
      note: performance[q.id] ? "Correct." : "Needs review.",
    }));
    const correctCount = questionDetails.filter((d) => d.correct).length;
    const finalScore = Math.round((100 * correctCount) / QUESTIONS.length);

    await prisma.grade.upsert({
      where: { submissionId: submission.id },
      create: {
        submissionId: submission.id,
        aiScore: finalScore,
        aiFeedback: `Scored ${correctCount} of ${QUESTIONS.length} on this quiz.`,
        aiNextStep: "Review the missed questions together before the next assessment.",
        questionDetails,
        finalScore,
        finalFeedback: `Scored ${correctCount} of ${QUESTIONS.length} on this quiz.`,
        status: "released",
        releasedToStudent: true,
      },
      update: { questionDetails, finalScore, aiScore: finalScore },
    });
    console.log(`  ${fullName}: ${correctCount}/${QUESTIONS.length} (${finalScore}%)`);
  }

  // 6. A couple of teacher observations, so the Attainment Report's Notes
  // section isn't empty either.
  const observationBodies = [
    "Most students grasped Dalton's postulates quickly after the flashcard review.",
    "Several students still confuse 'atom' and 'molecule' - worth a quick recap before the next topic.",
  ];
  for (const body of observationBodies) {
    const already = await prisma.observation.findFirst({ where: { topicId: topic.id, body } });
    if (!already) {
      await prisma.observation.create({ data: { topicId: topic.id, authorUserId: teacher.id, body } });
    }
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
