import { prisma } from "./prisma";
import { storage } from "./storage";
import { MAX_EXTRACTED_CHARS } from "./extraction";

// PRD's model routing (Docs/Dev/EduWand_Engineering_PRD.md section 6.3) -
// recorded on every usage log even though the stub never calls a real model,
// so Admin Dashboard usage analytics (FR-AI-4) reflects the intended routing.
export const MODEL_SONNET = "claude-sonnet"; // lesson plan / research report generation
export const MODEL_HAIKU = "claude-haiku"; // grading, personalisation suggestion
export const MODEL_GEMINI_FLASH = "gemini-2.5-flash"; // Lesson Studio content generation

// Model routing here reflects the pre-rebuild scope (Docs/Dev/EduWand_Engineering_PRD.md
// section 6.3) and has not been reconfirmed against the expanded 7-component
// AI module - see section 6.7, Q-02/Q-03. Treat as provisional.

export type GenerationOutputType =
  | "lesson_plan"
  | "custom_activity_report"
  | "flashcards"
  | "presentation"
  | "explanatory_video";

export interface GenerationInput {
  topicName: string;
  subject: string;
  board: string;
  outputType: GenerationOutputType;
  classCount: number;
  minutesPerClass: number;
  language: string;
  customPrompt?: string | null;
  classLabel?: string;
  // Extracted text from the topic's uploaded context sources (backend/src/lib/
  // extraction.ts), pre-capped by the caller. Only GeminiAiProvider uses this -
  // StubAiProvider ignores it, since the stub never calls a real model.
  contextText?: string | null;
  // The school's format/style instructions (SchoolFormatTemplate, appliesTo:
  // "generation"), free text - e.g. letterhead line, heading conventions, a
  // closing disclaimer. Only GeminiAiProvider uses this, same as contextText.
  schoolFormatInstructions?: string | null;
}

export interface AnswerKeyQuestionInput {
  index: number;
  prompt: string;
  marks: number;
}

export interface OcrInput {
  fileLocation: string;
}

export interface LessonPlanInput {
  topic: string;
  board: string;
  format: string; // "lesson_plan" | "learning_material"
  classLabel?: string;
}

export interface ResearchReportInput {
  topic: string;
  board: string;
}

export interface PersonalisationInput {
  studentName: string;
  avgScore: number | null;
  submissionCount: number;
}

export interface GradingQuestion {
  id: string;
  prompt: string;
}

export interface GradingInput {
  questions: GradingQuestion[];
  answers: Record<string, string>;
}

export interface AiProvider {
  generateLessonPlan(input: LessonPlanInput): Promise<{ content: string; model: string }>;
  generateResearchReport(input: ResearchReportInput): Promise<{ content: string; model: string }>;
  generatePersonalisationSuggestion(
    input: PersonalisationInput
  ): Promise<{ suggestedMix: Record<string, number>; reasoning: string; model: string }>;
  gradeSubmission(
    input: GradingInput
  ): Promise<{ score: number; feedback: string; flagged: boolean; nextStep: string; model: string }>;

  // Phase 2 (Docs/Dev/AI_Module_Rebuild_Plan.md) - Topic-scoped generation
  // covering all 5 output types the client doc specifies for Lesson Studio.
  generateContent(input: GenerationInput): Promise<{ content: string; model: string }>;
  // Phase 3 - draft answer key alongside assignment questions. The teacher's
  // verified version, never this one, is authoritative once reviewed.
  generateAnswerKey(questions: AnswerKeyQuestionInput[]): Promise<{ answers: Record<number, string>; model: string }>;
  // Phase 3 - stub OCR. No OCR provider is configured yet (same situation as
  // Bedrock below) - never fabricate a plausible-looking fake transcription,
  // always return a clearly-marked placeholder so it can't be mistaken for a
  // real extraction in testing.
  extractTextFromPhoto(input: OcrInput): Promise<{ text: string; confidence: number }>;
}

// No Bedrock/Anthropic credentials are configured yet (same situation as
// backend/src/lib/messaging.ts). This stub template-generates real, structured
// content from the actual inputs - not random text - so every Module 2
// workflow (generate -> review -> approve -> grade -> release) is genuinely
// exercisable end-to-end. Swap the aiProvider export below for a real
// BedrockAiProvider once credentials exist - callers only depend on the
// AiProvider interface, not this implementation.
class StubAiProvider implements AiProvider {
  async generateLessonPlan({ topic, board, format, classLabel }: LessonPlanInput) {
    const audience = classLabel ? `${classLabel} students` : "students";
    const content =
      format === "learning_material"
        ? [
            `# ${topic} — Learning Material (${board})`,
            "",
            "## Key Concepts",
            `- What ${topic} is, and why it matters within the ${board} curriculum`,
            `- The core terms ${audience} need before moving to practice problems`,
            `- Common misconceptions about ${topic}`,
            "",
            "## Worked Example",
            `A step-by-step walkthrough of a typical ${topic} problem, annotated for ${audience}.`,
            "",
            "## Practice Prompts",
            `1. Define ${topic} in your own words.`,
            `2. Apply ${topic} to a real-world scenario relevant to your board's syllabus.`,
            `3. Explain one common mistake students make with ${topic} and how to avoid it.`,
          ].join("\n")
        : [
            `# Lesson Plan: ${topic}`,
            `**Board:** ${board}${classLabel ? `  |  **Class:** ${classLabel}` : ""}`,
            "",
            "## Learning Objectives",
            `- Understand the core principles of ${topic}`,
            `- Apply ${topic} concepts to examples appropriate for ${board}`,
            `- Build confidence discussing ${topic} in class`,
            "",
            "## Materials Needed",
            "- Whiteboard or projector",
            `- Printed handouts on ${topic}`,
            "- Board-prescribed textbook chapter covering this topic",
            "",
            "## Lesson Structure (45 minutes)",
            `1. **Warm-up (5 min)** — Ask ${audience} what they already know about ${topic}`,
            `2. **Direct instruction (15 min)** — Introduce ${topic} with guided notes`,
            "3. **Guided practice (15 min)** — Work through 2-3 examples together",
            `4. **Independent practice (7 min)** — Short worksheet on ${topic}`,
            `5. **Wrap-up (3 min)** — Exit ticket: one question on ${topic}`,
            "",
            "## Assessment",
            "Exit ticket responses and worksheet accuracy indicate readiness for the next lesson.",
          ].join("\n");

    return { content, model: MODEL_SONNET };
  }

  async generateResearchReport({ topic, board }: ResearchReportInput) {
    const content = [
      `# Research Report: ${topic}`,
      `**Board context:** ${board}`,
      "",
      "## Overview",
      `This report summarises the current understanding of ${topic}, structured for classroom use.`,
      "",
      "## Key Findings",
      `1. ${topic} is foundational to the broader curriculum area it sits within.`,
      `2. Common misconceptions about ${topic} typically arise from oversimplified prior teaching.`,
      `3. Real-world applications of ${topic} improve retention.`,
      "",
      "## Suggested Classroom Use",
      `Use this report as background reading before building a lesson plan on ${topic}, or share a simplified excerpt as supplementary material.`,
      "",
      "## Sources",
      `Generated summary — verify against the ${board} prescribed textbook before distributing to students.`,
    ].join("\n");

    return { content, model: MODEL_SONNET };
  }

  // Recommendation only - nothing here is "applied" to a student. The only
  // code path that may apply a mix is PATCH /personalisation-suggestions/:id
  // (backend/src/routes/assignments.ts), per PRD section 6.4.
  async generatePersonalisationSuggestion({ studentName, avgScore, submissionCount }: PersonalisationInput) {
    let suggestedMix: Record<string, number>;
    let basis: string;

    if (avgScore === null) {
      suggestedMix = { easy: 2, medium: 2, hard: 1 };
      basis = "no prior graded work yet, so a balanced default mix is suggested";
    } else if (avgScore >= 80) {
      suggestedMix = { easy: 1, medium: 2, hard: 2 };
      basis = `a strong average of ${avgScore.toFixed(0)}% across ${submissionCount} prior submission(s)`;
    } else if (avgScore >= 50) {
      suggestedMix = { easy: 2, medium: 2, hard: 1 };
      basis = `a moderate average of ${avgScore.toFixed(0)}% across ${submissionCount} prior submission(s)`;
    } else {
      suggestedMix = { easy: 3, medium: 2, hard: 0 };
      basis = `an average of ${avgScore.toFixed(0)}% across ${submissionCount} prior submission(s), suggesting more foundational practice first`;
    }

    return {
      suggestedMix,
      reasoning: `${studentName} has ${basis}. This is a recommendation only — review before applying.`,
      model: MODEL_HAIKU,
    };
  }

  async gradeSubmission({ questions, answers }: GradingInput) {
    const total = Math.max(1, questions.length);
    let answered = 0;
    let totalLength = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (a && a.trim().length > 0) {
        answered += 1;
        totalLength += a.trim().length;
      }
    }
    const completeness = answered / total;
    const avgLength = answered > 0 ? totalLength / answered : 0;
    const depth = Math.min(1, avgLength / 80);
    const score = Math.round((completeness * 0.6 + depth * 0.4) * 100);
    const flagged = completeness < 0.5 || score < 40;
    const feedback = flagged
      ? `This submission leaves ${total - answered} of ${total} question(s) unanswered or very brief. Recommend reviewing with the student before releasing.`
      : `Solid attempt across ${answered} of ${total} question(s). Consider adding more supporting detail on shorter answers to strengthen the response.`;
    const nextStep = flagged
      ? "Revisit the unanswered/brief questions with the student one-to-one before the next assignment on this topic."
      : "Ready for a slightly harder question set on this topic next time.";

    return { score, feedback, flagged, nextStep, model: MODEL_HAIKU };
  }

  // Phase 2: replaces generateLessonPlan/generateResearchReport for new
  // Topic-scoped generations. Follows the same "real structured content from
  // real inputs" pattern as the methods above, extended to flashcards,
  // presentation, and explanatory_video output types.
  async generateContent({
    topicName,
    subject,
    board,
    outputType,
    classCount,
    minutesPerClass,
    language,
    customPrompt,
    classLabel,
  }: GenerationInput) {
    const audience = classLabel ? `${classLabel} students` : "students";
    const custom = customPrompt ? `\n\n## Teacher's custom instructions\n${customPrompt}` : "";
    const header = `# ${topicName} (${subject}, ${board})\n**Language:** ${language}  |  **Classes covered:** ${classCount}  |  **Minutes per class:** ${minutesPerClass}`;

    let body: string;
    switch (outputType) {
      case "flashcards":
        body = [
          "## Flashcards",
          `1. **Front:** What is ${topicName}? **Back:** A core concept in ${subject} for ${board}.`,
          `2. **Front:** Why does ${topicName} matter? **Back:** It underpins later ${subject} topics.`,
          `3. **Front:** Common mistake with ${topicName}? **Back:** Confusing it with a related but distinct idea.`,
        ].join("\n");
        break;
      case "presentation":
        body = [
          "## Presentation Outline",
          `**Slide 1:** Introducing ${topicName}`,
          `**Slide 2:** Key ideas ${audience} need to know`,
          `**Slide 3:** Worked example`,
          `**Slide 4:** Practice question for ${audience}`,
          "**Slide 5:** Summary and next steps",
        ].join("\n");
        break;
      case "explanatory_video":
        body = [
          "## Explanatory Video Script",
          `**Hook (0:00):** Why ${topicName} matters to ${audience}.`,
          `**Explanation (0:20):** Walk through ${topicName} step by step.`,
          `**Example (1:00):** Apply ${topicName} to a ${board}-relevant scenario.`,
          "**Recap (1:40):** Restate the key takeaway.",
        ].join("\n");
        break;
      case "custom_activity_report":
        body = [
          "## Custom Activity",
          `**Objective:** [Apply] ${audience} demonstrate understanding of ${topicName}.`,
          `**Activity:** A ${minutesPerClass}-minute in-class task applying ${topicName}.`,
          "**Report format:** what was attempted, what was observed, what to reinforce next class.",
        ].join("\n");
        break;
      case "lesson_plan":
      default:
        body = [
          "## Learning Objectives",
          `- [Understand] Understand the core principles of ${topicName}`,
          `- [Apply] Apply ${topicName} concepts to examples appropriate for ${board}`,
          "",
          `## Lesson Structure (${minutesPerClass} minutes x ${classCount} class(es))`,
          `1. **Warm-up** — Ask ${audience} what they already know about ${topicName}`,
          "2. **Direct instruction** — Introduce the topic with guided notes",
          "3. **Guided practice** — Work through examples together",
          "4. **Independent practice** — Short worksheet",
          "5. **Wrap-up** — Exit ticket",
        ].join("\n");
        break;
    }

    return { content: `${header}\n\n${body}${custom}`, model: MODEL_SONNET };
  }

  async generateAnswerKey(questions: AnswerKeyQuestionInput[]) {
    const answers: Record<number, string> = {};
    for (const q of questions) {
      answers[q.index] = `Draft answer for: "${q.prompt}" — worth ${q.marks} mark(s). Teacher review required before use.`;
    }
    return { answers, model: MODEL_HAIKU };
  }

  async extractTextFromPhoto(_input: OcrInput) {
    // Placeholder only - no OCR provider configured. confidence: 0 signals
    // "not a real extraction" to callers, distinct from a genuine low-confidence
    // read, so nothing downstream mistakes this for real handwriting OCR.
    return {
      text: "[OCR not yet configured — placeholder extraction, do not treat as real submission content]",
      confidence: 0,
    };
  }
}

const stubProvider = new StubAiProvider();

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

const OCR_NO_TEXT_SENTINEL = "NO_TEXT_FOUND";

const OUTPUT_TYPE_INSTRUCTIONS: Record<GenerationOutputType, string> = {
  lesson_plan:
    "Produce a full lesson plan in Markdown: learning objectives, materials needed, a " +
    "step-by-step lesson structure with timing that fits the given number of classes and " +
    "minutes per class, and an assessment/exit-ticket section.",
  custom_activity_report:
    "Produce a custom classroom activity in Markdown: the objective, the activity itself " +
    "(sized to the minutes per class), and a report format the teacher can fill in afterwards " +
    "covering what was attempted, what was observed, and what to reinforce next class.",
  flashcards:
    "Produce a set of at least 8 flashcards in Markdown as a numbered list, each with a " +
    "**Front:** question and **Back:** answer, covering the key concepts of the topic.",
  presentation:
    "Produce a slide-by-slide presentation outline in Markdown, each slide labelled " +
    "**Slide N:** with a short title and the key points/notes for that slide.",
  explanatory_video:
    "Produce an explanatory video script in Markdown with timestamped sections: a hook, the " +
    "main explanation broken into clear steps, a worked example, and a recap.",
};

// Real Gemini-backed generation for Lesson Studio (backend/src/routes/generations.ts)
// and image OCR for Lesson Studio context sources (backend/src/routes/topics.ts).
// Every other AiProvider method still delegates to the stub, matching the
// existing swap-in pattern used in backend/src/lib/messaging.ts. Swap those in
// one at a time in later passes.
class GeminiAiProvider implements AiProvider {
  generateLessonPlan = stubProvider.generateLessonPlan.bind(stubProvider);
  generateResearchReport = stubProvider.generateResearchReport.bind(stubProvider);
  generatePersonalisationSuggestion = stubProvider.generatePersonalisationSuggestion.bind(stubProvider);
  gradeSubmission = stubProvider.gradeSubmission.bind(stubProvider);
  generateAnswerKey = stubProvider.generateAnswerKey.bind(stubProvider);

  // Reused by Lesson Studio's image context sources today. Not yet wired into
  // any grading path (Assignment Lab submissions still use the stub) - the
  // client doc explicitly flags submission-grading OCR as the higher-risk
  // piece, since a wrong grade reaches a parent quickly. confidence here is a
  // binary "the model found and returned text" signal, not a calibrated
  // accuracy score - real accuracy needs measurement against a labelled
  // sample before this is trusted for anything grading-adjacent.
  async extractTextFromPhoto({ fileLocation }: OcrInput): Promise<{ text: string; confidence: number }> {
    const buffer = await storage.readBuffer(fileLocation);
    const ext = (fileLocation.split(".").pop() ?? "").toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext] ?? "image/jpeg";
    const base64 = buffer.toString("base64");

    const prompt =
      "Transcribe all readable text from this image exactly as written, preserving structure " +
      "(headings, bullet points, paragraphs) where possible. Do not translate - transcribe in " +
      `the original language. If the image has no readable text, respond with exactly: ${OCR_NO_TEXT_SENTINEL}`;

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Gemini OCR request failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text || text === OCR_NO_TEXT_SENTINEL) {
      return { text: "", confidence: 0 };
    }
    return { text: text.slice(0, MAX_EXTRACTED_CHARS), confidence: 1 };
  }

  async generateContent({
    topicName,
    subject,
    board,
    outputType,
    classCount,
    minutesPerClass,
    language,
    customPrompt,
    classLabel,
    contextText,
    schoolFormatInstructions,
  }: GenerationInput): Promise<{ content: string; model: string }> {
    const audience = classLabel ? `${classLabel} students` : "students";
    const instructions = OUTPUT_TYPE_INSTRUCTIONS[outputType] ?? OUTPUT_TYPE_INSTRUCTIONS.lesson_plan;
    const prompt = [
      `You are an experienced ${board} curriculum teacher writing material for ${audience}.`,
      `Topic: ${topicName}`,
      `Subject: ${subject}`,
      `Board: ${board}`,
      `Classes covered: ${classCount}`,
      `Minutes per class: ${minutesPerClass}`,
      `Output language: ${language}`,
      "",
      instructions,
      "",
      "Write in Markdown. Start with a level-1 heading naming the topic. Do not include any " +
        "preamble or closing remarks outside the material itself.",
      "Wherever you state learning objectives or outcomes, label each one with its Bloom's " +
        "Taxonomy level in square brackets immediately before the objective (e.g., " +
        "\"[Understand] Explain why...\"). Use only these levels: Remember, Understand, Apply, " +
        "Analyze, Evaluate, Create.",
      customPrompt ? `\nAdditional instructions from the teacher: ${customPrompt}` : "",
      contextText
        ? `\nBase the material on the following source content the teacher provided, prioritising ` +
          `its accuracy and specifics over general knowledge. Do not simply repeat it verbatim - ` +
          `use it to ground the material you write.\n"""\n${contextText}\n"""`
        : "",
      schoolFormatInstructions
        ? `\nThe school this is for requires the following output format/style - follow it exactly:\n"""\n${schoolFormatInstructions}\n"""`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Gemini API request failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini API returned no generated text");
    }

    return { content: text, model: MODEL_GEMINI_FLASH };
  }
}

export const aiProvider: AiProvider = process.env.GEMINI_API_KEY ? new GeminiAiProvider() : stubProvider;

// Written by every route that calls aiProvider above (API Specification section
// 7: "All AI generation calls should write to ai_usage_log ... for cost
// tracking"). Feeds the Admin Dashboard's AI Usage Analytics screen (FR-AI-4).
export async function logAiUsage(params: {
  schoolId: string;
  teacherUserId: string;
  feature: string;
  model: string;
  status?: string;
  durationMs?: number;
}) {
  await prisma.aiUsageLog.create({
    data: {
      schoolId: params.schoolId,
      teacherUserId: params.teacherUserId,
      feature: params.feature,
      model: params.model,
      status: params.status ?? "success",
      durationMs: params.durationMs,
    },
  });
}
