import { prisma } from "./prisma";

// PRD's model routing (Docs/Dev/EduWand_Engineering_PRD.md section 6.3) -
// recorded on every usage log even though the stub never calls a real model,
// so Admin Dashboard usage analytics (FR-AI-4) reflects the intended routing.
export const MODEL_SONNET = "claude-sonnet"; // lesson plan / research report generation
export const MODEL_HAIKU = "claude-haiku"; // grading, personalisation suggestion

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
  gradeSubmission(input: GradingInput): Promise<{ score: number; feedback: string; flagged: boolean; model: string }>;
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

    return { score, feedback, flagged, model: MODEL_HAIKU };
  }
}

export const aiProvider: AiProvider = new StubAiProvider();

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
