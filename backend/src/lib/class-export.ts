import JSZip from "jszip";
import { prisma } from "./prisma";
import { storage } from "./storage";
import { toCsv } from "./csv";
import { parseGenerationContent } from "./generation-content";

// Full-data backup of one class as a zip - what a teacher/admin downloads
// before deleting the class (see lib/class-lifecycle.ts). Everything that
// hangs off ClassSection is included: students, topics (generations,
// observations, objectives, attainment report, sources, videos), assignments
// (answer keys, submissions, grades), assessments (responses), lesson plans,
// communications, timetable and join requests. Every table gets a CSV and/or
// JSON so the data is usable without this app; generations and assignments
// also get a readable Markdown copy.

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 150 * 1024 * 1024;

function slug(value: string, fallback = "item"): string {
  const s = value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return s || fallback;
}

function iso(date: Date | null | undefined): string {
  return date ? date.toISOString() : "";
}

function extensionOf(location: string, fallback: string): string {
  const path = location.split("?")[0];
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}

function joinLines(items: string[] | string | undefined): string {
  if (!items) return "";
  return Array.isArray(items) ? items.join("; ") : items;
}

function generationToMarkdown(outputType: string, raw: string): string {
  const content = parseGenerationContent(outputType, raw);
  if (!content) return raw;

  const out: string[] = [];
  if (content.type === "lesson_plan") {
    out.push(`## Overview\n\n${content.overview}\n`);
    out.push(`## Objectives\n\n${content.objectives.map((o) => `- ${o}`).join("\n")}\n`);
    if (content.stages?.length) {
      out.push("## Lesson stages\n");
      for (const stage of content.stages) {
        out.push(`### ${stage.stage} (${stage.durationMinutes} min)\n\n${stage.summary}\n`);
        for (const a of stage.activities) {
          out.push(`- **${a.title}**: ${joinLines(a.description)}${a.materials?.length ? ` _(Materials: ${a.materials.join(", ")})_` : ""}`);
        }
        out.push("");
      }
    } else {
      if (content.lessonFlow?.length) {
        out.push(`## Lesson flow\n\n${content.lessonFlow.map((f) => `- ${f.label} (${f.durationMinutes} min)`).join("\n")}\n`);
      }
      if (content.activities?.length) {
        out.push("## Activities\n");
        for (const a of content.activities) out.push(`- **${a.title}** (${a.durationMinutes} min): ${joinLines(a.description)}`);
        out.push("");
      }
    }
    out.push(`## Assessment\n\n${content.assessment}\n`);
  } else if (content.type === "custom_activity_report") {
    const objectives = content.objectives ?? (content.objective ? [content.objective] : []);
    out.push(`## Objectives\n\n${objectives.map((o) => `- ${o}`).join("\n")}\n`);
    out.push("## Activities\n");
    for (const a of content.activities) out.push(`- **${a.title}** (${a.durationMinutes} min): ${joinLines(a.description)}`);
    out.push(`\n## Report format\n\n${joinLines(content.reportFormat)}\n`);
  } else if (content.type === "flashcards") {
    content.cards.forEach((c, i) => out.push(`${i + 1}. **${c.front}**\n   ${c.back}\n`));
  } else if (content.type === "presentation") {
    content.slides.forEach((s, i) => out.push(`### Slide ${i + 1}: ${s.title}\n\n${s.bullets.map((b) => `- ${b}`).join("\n")}\n`));
  }
  return out.join("\n");
}

interface AnyQuestion {
  id?: string;
  prompt?: string;
  type?: string;
  difficulty?: string;
  options?: string[];
  correctOptionIndex?: number;
  pairs?: { left: string; right: string }[];
  items?: string[];
  modelAnswer?: string;
}

function questionsToMarkdown(questions: unknown, answerByQuestionId: Map<string, string>): string {
  if (!Array.isArray(questions)) return "";
  return (questions as AnyQuestion[])
    .map((q, i) => {
      const lines = [`### Q${i + 1}. ${q.prompt ?? ""}`, "", `_Type: ${q.type ?? "n/a"}${q.difficulty ? ` · ${q.difficulty}` : ""}_`];
      if (q.options?.length) lines.push("", ...q.options.map((o, oi) => `${oi === q.correctOptionIndex ? "- [x]" : "- [ ]"} ${o}`));
      if (q.pairs?.length) lines.push("", ...q.pairs.map((p) => `- ${p.left} → ${p.right}`));
      if (q.items?.length) lines.push("", ...q.items.map((item, ii) => `${ii + 1}. ${item}`));
      const answer = (q.id && answerByQuestionId.get(q.id)) || q.modelAnswer;
      if (answer) lines.push("", `**Answer:** ${answer}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

class FileBudget {
  private total = 0;
  readonly skipped: string[] = [];

  async fetch(location: string, label: string): Promise<Buffer | null> {
    if (this.total >= MAX_TOTAL_FILE_BYTES) {
      this.skipped.push(`${label} (size budget reached): ${location}`);
      return null;
    }
    try {
      const buffer = await storage.readBuffer(location);
      if (buffer.length > MAX_FILE_BYTES) {
        this.skipped.push(`${label} (over ${MAX_FILE_BYTES / 1024 / 1024} MB): ${location}`);
        return null;
      }
      this.total += buffer.length;
      return buffer;
    } catch {
      this.skipped.push(`${label} (no longer available): ${location}`);
      return null;
    }
  }
}

export interface ClassExportResult {
  buffer: Buffer;
  fileName: string;
}

export async function buildClassExportZip(classSectionId: string): Promise<ClassExportResult> {
  const classSection = await prisma.classSection.findUniqueOrThrow({
    where: { id: classSectionId },
    include: {
      academicYear: { include: { school: { select: { name: true } } } },
      teacherAssignments: { include: { teacher: { select: { fullName: true, email: true } } } },
    },
  });

  const [students, topics, assignments, assessments, lessonPlans, timetableSlots, joinRequests] = await Promise.all([
    prisma.studentStub.findMany({ where: { classSectionId }, orderBy: { fullName: "asc" } }),
    prisma.topic.findMany({
      where: { classSectionId },
      orderBy: { createdAt: "asc" },
      include: {
        generations: { orderBy: { generatedAt: "asc" } },
        observations: { orderBy: { recordedAt: "asc" } },
        objectives: true,
        attainmentReport: true,
        contextSources: { select: { sourceType: true, originalFilename: true, sourceUrl: true, citation: true, attribution: true, createdAt: true } },
        savedVideos: true,
      },
    }),
    prisma.assignment.findMany({
      where: { classSectionId },
      orderBy: { createdAt: "asc" },
      include: {
        topic: { select: { name: true, subject: true } },
        answerKeys: { orderBy: { questionIndex: "asc" } },
        submissions: { include: { grade: true, studentStub: { select: { fullName: true, seatNumber: true } } } },
      },
    }),
    prisma.assessment.findMany({
      where: { classSectionId },
      orderBy: { createdAt: "asc" },
      include: {
        topic: { select: { name: true, subject: true } },
        responses: { include: { studentStub: { select: { fullName: true, seatNumber: true } } } },
      },
    }),
    prisma.lessonPlan.findMany({ where: { classSectionId }, orderBy: { createdAt: "asc" } }),
    prisma.timetableSlot.findMany({ where: { classSectionId }, include: { teacher: { select: { fullName: true } } } }),
    prisma.classJoinRequest.findMany({ where: { classSectionId }, orderBy: { submittedAt: "asc" } }),
  ]);

  const studentIds = students.map((s) => s.id);
  const topicIds = topics.map((t) => t.id);
  const messages = await prisma.communicationMessage.findMany({
    where: {
      OR: [
        { recipientClassSectionId: classSectionId },
        { topicId: { in: topicIds } },
        { recipientStudentStubId: { in: studentIds } },
        { senderStudentStubId: { in: studentIds } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: {
      recipientStudentStub: { select: { fullName: true } },
      senderStudentStub: { select: { fullName: true } },
      sender: { select: { fullName: true } },
    },
  });

  const school = classSection.academicYear.school.name;
  const className = `${classSection.className} ${classSection.sectionName}`;
  const rootName = `${slug(className, "class")}-${slug(classSection.academicYear.label, "year")}-export`;
  const zip = new JSZip();
  const root = zip.folder(rootName)!;
  const files = new FileBudget();
  const exportedAt = new Date();

  // --- class + people ---
  root.file(
    "class.json",
    JSON.stringify(
      {
        school,
        className: classSection.className,
        sectionName: classSection.sectionName,
        academicYear: classSection.academicYear.label,
        createdAt: classSection.createdAt,
        teachers: classSection.teacherAssignments.map((t) => ({ name: t.teacher.fullName, email: t.teacher.email })),
        exportedAt,
      },
      null,
      2
    )
  );

  root.file(
    "students.csv",
    toCsv(
      ["Name", "Date of birth", "Email", "Guardian", "Guardian contact", "Admission date", "Seat number", "Status"],
      students.map((s) => [
        s.fullName,
        iso(s.dateOfBirth).slice(0, 10),
        s.email ?? "",
        s.guardianName,
        s.guardianContact,
        iso(s.admissionDate).slice(0, 10),
        s.seatNumber?.toString() ?? "",
        s.status,
      ])
    )
  );

  root.file(
    "join-requests.csv",
    toCsv(
      ["Student", "Date of birth", "Guardian", "Guardian contact", "Email", "Status", "Submitted", "Note"],
      joinRequests.map((r) => [r.studentName, iso(r.dateOfBirth).slice(0, 10), r.guardianName, r.guardianContact, r.studentEmail ?? "", r.status, iso(r.submittedAt), r.note ?? ""])
    )
  );

  root.file(
    "timetable.csv",
    toCsv(
      ["Weekday (1=Mon)", "Start", "End", "Subject", "Teacher", "Room"],
      timetableSlots.map((t) => [t.weekday.toString(), t.startTime, t.endTime, t.subject, t.teacher.fullName, t.room ?? ""])
    )
  );

  root.file(
    "communications.csv",
    toCsv(
      ["Date", "Channel", "From", "To", "Message", "Delivery status"],
      messages.map((m) => [
        iso(m.createdAt),
        m.channel,
        m.sender?.fullName ?? m.senderStudentStub?.fullName ?? "",
        m.recipientStudentStub?.fullName ?? (m.recipientClassSectionId ? "Whole class" : ""),
        m.body,
        m.deliveryStatus,
      ])
    )
  );

  // --- topics ---
  const topicsDir = root.folder("topics")!;
  for (const [ti, topic] of topics.entries()) {
    const dir = topicsDir.folder(`${String(ti + 1).padStart(2, "0")}-${slug(topic.subject)}-${slug(topic.name)}`)!;
    dir.file("topic.json", JSON.stringify({ subject: topic.subject, name: topic.name, status: topic.status, createdAt: topic.createdAt }, null, 2));

    for (const [gi, g] of topic.generations.entries()) {
      const base = `generations/${String(gi + 1).padStart(2, "0")}-${g.outputType}`;
      const text = g.editedOutput ?? g.aiOutput;
      dir.file(`${base}.md`, `# ${topic.name} - ${g.outputType}\n\n_Generated ${iso(g.generatedAt)}_\n\n${generationToMarkdown(g.outputType, text)}\n`);
      dir.file(`${base}.json`, text);
    }

    if (topic.observations.length) {
      const lines: string[] = [];
      for (const [oi, o] of topic.observations.entries()) {
        let photoNote = "";
        if (o.photoUrl) {
          const buf = await files.fetch(o.photoUrl, `Observation photo (${topic.name})`);
          if (buf) {
            const name = `observation-photos/${oi + 1}.${extensionOf(o.photoUrl, "jpg")}`;
            dir.file(name, buf);
            photoNote = `\n\n![photo](${name})`;
          }
        }
        lines.push(`## ${iso(o.recordedAt)}\n\n${o.body}${photoNote}`);
      }
      dir.file("observations.md", lines.join("\n\n"));
    }

    if (topic.objectives.length) {
      dir.file("objectives.csv", toCsv(["Objective", "Bloom's stage", "Benchmark %"], topic.objectives.map((o) => [o.text, o.bloomsStage ?? "", o.benchmarkPercent.toString()])));
    }

    if (topic.attainmentReport) {
      const r = topic.attainmentReport;
      dir.file(
        "attainment-report.md",
        `# Attainment report - ${topic.name}\n\n## What was done\n\n${r.whatWasDone ?? ""}\n\n## Outcomes\n\n${r.outcomes ?? ""}\n\n## Improvement notes\n\n${r.improvementNotes ?? ""}\n`
      );
      if (r.bloomsTaxonomyMapping) dir.file("attainment-blooms.json", JSON.stringify(r.bloomsTaxonomyMapping, null, 2));
      if (r.pdfFileLocation) {
        const buf = await files.fetch(r.pdfFileLocation, `Attainment report PDF (${topic.name})`);
        if (buf) dir.file("attainment-report.pdf", buf);
      }
    }

    if (topic.contextSources.length) {
      dir.file(
        "sources.csv",
        toCsv(
          ["Type", "File name", "URL", "Citation", "Attribution", "Added"],
          topic.contextSources.map((s) => [s.sourceType, s.originalFilename ?? "", s.sourceUrl ?? "", s.citation ?? "", s.attribution ?? "", iso(s.createdAt)])
        )
      );
    }
    if (topic.savedVideos.length) {
      dir.file("videos.csv", toCsv(["Title", "Channel", "Video ID"], topic.savedVideos.map((v) => [v.title, v.channelTitle, v.videoId])));
    }
  }

  // --- assignments ---
  const assignmentsDir = root.folder("assignments")!;
  const summaryRows: Record<string, Map<string, string>> = {};
  const assignmentTitles: string[] = [];
  for (const [ai, a] of assignments.entries()) {
    const title = a.title;
    assignmentTitles.push(title);
    const dir = assignmentsDir.folder(`${String(ai + 1).padStart(2, "0")}-${slug(title, "assignment")}`)!;
    const answerByQuestionId = new Map(a.answerKeys.map((k) => [k.questionId, k.teacherVerifiedAnswer ?? k.aiAnswer]));

    dir.file(
      "assignment.md",
      `# ${title}\n\n_Topic: ${a.topic?.name ?? "n/a"} · Status: ${a.status} · Created ${iso(a.createdAt)}_\n\n${questionsToMarkdown(a.questions, answerByQuestionId)}\n`
    );
    dir.file(
      "assignment.json",
      JSON.stringify({ title, status: a.status, publishedAt: a.publishedAt, questions: a.questions, answerKey: a.answerKeys.map((k) => ({ questionId: k.questionId, answer: k.teacherVerifiedAnswer ?? k.aiAnswer, marks: k.marks })) }, null, 2)
    );

    dir.file(
      "submissions.csv",
      toCsv(
        ["Student", "Submitted", "Type", "Score", "Band", "Feedback", "Released to student"],
        a.submissions.map((s) => [
          s.studentStub.fullName,
          iso(s.submittedAt),
          s.submissionType,
          (s.grade?.finalScore ?? s.grade?.aiScore)?.toString() ?? "",
          s.grade?.performanceBand ?? "",
          s.grade?.finalFeedback ?? s.grade?.aiFeedback ?? "",
          s.grade?.releasedToStudent ? "yes" : "no",
        ])
      )
    );
    dir.file("submissions.json", JSON.stringify(a.submissions.map((s) => ({ student: s.studentStub.fullName, answers: s.answers, ocrExtractedText: s.ocrExtractedText, grade: s.grade })), null, 2));

    for (const s of a.submissions) {
      const score = s.grade?.finalScore ?? s.grade?.aiScore;
      (summaryRows[s.studentStubId] ??= new Map()).set(a.id, score?.toString() ?? "");
      if (s.photoFileLocation) {
        const buf = await files.fetch(s.photoFileLocation, `Submission photo (${s.studentStub.fullName}, ${title})`);
        if (buf) dir.file(`submission-photos/${slug(s.studentStub.fullName)}.${extensionOf(s.photoFileLocation, "jpg")}`, buf);
      }
    }
  }

  if (assignments.length) {
    root.file(
      "grades-summary.csv",
      toCsv(
        ["Student", ...assignmentTitles],
        students.map((s) => [s.fullName, ...assignments.map((a) => summaryRows[s.id]?.get(a.id) ?? "")])
      )
    );
  }

  // --- in-class assessments ---
  const assessmentsDir = root.folder("assessments")!;
  for (const [ai, a] of assessments.entries()) {
    const dir = assessmentsDir.folder(`${String(ai + 1).padStart(2, "0")}-${slug(a.title, "assessment")}`)!;
    dir.file("assessment.md", `# ${a.title}\n\n_Topic: ${a.topic.name} · Status: ${a.status} · Created ${iso(a.createdAt)}_\n\n${questionsToMarkdown(a.questions, new Map())}\n`);
    dir.file("assessment.json", JSON.stringify({ title: a.title, status: a.status, completedAt: a.completedAt, questions: a.questions }, null, 2));
    dir.file(
      "responses.csv",
      toCsv(
        ["Student", "Question ID", "Selected option (0-based)", "Correct", "Doubt", "Recorded"],
        a.responses.map((r) => [r.studentStub.fullName, r.questionId, r.selectedOptionIndex?.toString() ?? "", r.isCorrect === null ? "" : r.isCorrect ? "yes" : "no", r.isDoubt ? "yes" : "no", iso(r.recordedAt)])
      )
    );
  }

  // --- legacy lesson plans ---
  if (lessonPlans.length) {
    const dir = root.folder("lesson-plans")!;
    lessonPlans.forEach((p, i) => dir.file(`${String(i + 1).padStart(2, "0")}-${slug(p.topic)}.txt`, `${p.topic} (${p.board}, ${p.format})\n\n${p.content}\n`));
  }

  root.file(
    "README.txt",
    [
      `EduWand class export`,
      `School: ${school}`,
      `Class: ${className} (${classSection.academicYear.label})`,
      `Exported: ${exportedAt.toISOString()}`,
      ``,
      `students.csv, join-requests.csv, timetable.csv, communications.csv  - class-level records`,
      `grades-summary.csv                                                  - one row per student, one column per assignment`,
      `topics/     - per topic: generated lesson content (.md readable + .json raw), observations, objectives, attainment report, sources`,
      `assignments/ - per assignment: questions + answer key, submissions, grades, student photo submissions`,
      `assessments/ - per in-class quiz: questions and per-student responses`,
      ``,
      `Uploaded reference files are removed from EduWand 24 hours after upload (copyright policy), so they are not part of this export - sources.csv lists what was used.`,
      ...(files.skipped.length ? [``, `Files that could not be included:`, ...files.skipped.map((s) => `  - ${s}`)] : []),
    ].join("\n")
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer, fileName: `${rootName}.zip` };
}
