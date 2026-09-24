import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stubProvider,
  GenerationInput,
  AssignmentGenInput,
  GradingQuestion,
  settleMcqQuestions,
  expandDifficultyMix,
  heuristicAssignmentQuestions,
  normaliseGeneratedQuestions,
  ROLE_SEQUENCES,
  ROLE_LAYOUTS,
} from "./ai";

// Test the offline stub directly - it is the dev default and the offline
// fallback, and the frontend's parseGenerationContent relies on this JSON shape.
const aiProvider = stubProvider;

const baseInput: Omit<GenerationInput, "outputType"> = {
  topicName: "Photosynthesis",
  subject: "Biology",
  board: "CBSE",
  classCount: 2,
  minutesPerClass: 45,
  language: "English",
};

test("stub describeImageForContext returns empty text (nothing to store)", async () => {
  const result = await aiProvider.describeImageForContext({ fileLocation: "x.png" });
  assert.equal(result.text, "");
});

test("stub generateContent(lesson_plan) is JSON the frontend parser accepts", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "lesson_plan" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.objectives));
  assert.equal(parsed.structureType, "5e");
  assert.ok(Array.isArray(parsed.stages));
  assert.equal(parsed.stages.length, 5);
  assert.deepEqual(
    parsed.stages.map((s: { stage: string }) => s.stage),
    ["Engage", "Explore", "Explain", "Elaborate", "Evaluate"]
  );
  for (const stage of parsed.stages) {
    assert.ok(Array.isArray(stage.activities));
  }
  assert.equal(parsed.durationMinutes, 90);
});

test("stub generateContent(flashcards) is JSON with a cards array", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "flashcards" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.cards));
  assert.ok(parsed.cards.length > 0);
});

test("stub generateContent(presentation) is JSON with a slides array", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "presentation" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.slides));
});

test("stub generateContent(custom_activity_report) has objectives + activities + reportFormat", async () => {
  const { content } = await aiProvider.generateContent({ ...baseInput, outputType: "custom_activity_report" });
  const parsed = JSON.parse(content);
  assert.ok(Array.isArray(parsed.objectives) && parsed.objectives.length > 0);
  assert.ok(Array.isArray(parsed.activities));
  assert.ok(Array.isArray(parsed.reportFormat));
});

// --- generateAssignmentFromTopic -------------------------------------------

const baseAssignmentInput: AssignmentGenInput = {
  taughtContent: "Photosynthesis converts light energy into chemical energy stored in glucose.",
  objectives: ["[Understand] Explain photosynthesis", "[Apply] Apply the concept to a real plant"],
  questionCount: 4,
  difficultyMix: { easy: 1, medium: 2, hard: 1 },
  questionTypes: ["short_answer"],
  focusPrompt: null,
  subject: "Biology",
  board: "CBSE",
  classLabel: "Grade 8 A",
  schoolFormatInstructions: null,
};

test("stub generateAssignmentFromTopic returns the requested count with a model answer each", async () => {
  const { questions } = await aiProvider.generateAssignmentFromTopic(baseAssignmentInput);
  assert.equal(questions.length, 4);
  for (const q of questions) {
    assert.ok(q.prompt.length > 0);
    assert.ok(q.modelAnswer.length > 0);
    assert.equal(q.type, "short_answer");
  }
});

test("stub generateAssignmentFromTopic(mcq) produces valid options and a correct index", async () => {
  const { questions } = await aiProvider.generateAssignmentFromTopic({ ...baseAssignmentInput, questionTypes: ["mcq"] });
  for (const q of questions) {
    assert.equal(q.type, "mcq");
    assert.ok(Array.isArray(q.options) && q.options.length >= 2);
    assert.ok(typeof q.correctOptionIndex === "number" && q.correctOptionIndex >= 0 && q.correctOptionIndex < q.options!.length);
  }
});

test("expandDifficultyMix pads/truncates to exactly questionCount", () => {
  assert.deepEqual(expandDifficultyMix({ easy: 1, medium: 2, hard: 1 }, 4), ["easy", "medium", "medium", "hard"]);
  assert.equal(expandDifficultyMix({ easy: 0, medium: 0, hard: 0 }, 3).length, 3);
});

test("heuristicAssignmentQuestions falls back to generic seeds when there are no objectives", () => {
  const questions = heuristicAssignmentQuestions({ ...baseAssignmentInput, objectives: [], questionCount: 3 });
  assert.equal(questions.length, 3);
  assert.ok(questions.every((q) => q.prompt.includes("Biology")));
});

test("normaliseGeneratedQuestions drops rows with no prompt and defaults a missing model answer", () => {
  const rows = [{ prompt: "What is X?" }, { prompt: "" }, { prompt: "Explain Y", modelAnswer: "Because Z" }];
  const out = normaliseGeneratedQuestions(rows, ["easy", "medium", "hard"], ["short_answer"]);
  assert.equal(out.length, 2);
  assert.equal(out[0].modelAnswer, "Teacher review required before use.");
  assert.equal(out[1].modelAnswer, "Because Z");
});

test("normaliseGeneratedQuestions in mcq mode requires >=2 options or falls back to short-answer", () => {
  const rows = [
    { prompt: "Pick one", type: "mcq", options: ["A", "B", "C"], correctOptionIndex: 1, modelAnswer: "B" },
    { prompt: "Not enough options", type: "mcq", options: ["only one"] },
  ];
  const out = normaliseGeneratedQuestions(rows, ["easy", "medium"], ["mcq"]);
  assert.equal(out[0].type, "mcq");
  assert.equal(out[0].correctOptionIndex, 1);
  assert.equal(out[1].type, "short_answer");
});

// --- MCQ grading -------------------------------------------------------------

const mcqQuestion: GradingQuestion = {
  id: "q1",
  prompt: "2 + 2 = ?",
  type: "mcq",
  options: ["3", "4", "5"],
  correctOptionIndex: 1,
};
const shortAnswerQuestion: GradingQuestion = { id: "q2", prompt: "Explain photosynthesis." };

test("settleMcqQuestions grades a correct option, an incorrect one, and a blank", () => {
  const { mcqDetails, shortAnswerQuestions } = settleMcqQuestions(
    [mcqQuestion, shortAnswerQuestion],
    { q1: "4", q2: "It converts light to energy." }
  );
  assert.equal(shortAnswerQuestions.length, 1);
  assert.equal(shortAnswerQuestions[0].id, "q2");
  assert.equal(mcqDetails.length, 1);
  assert.equal(mcqDetails[0].correct, true);
  assert.equal(mcqDetails[0].marksAwarded, 1);
});

test("settleMcqQuestions marks a wrong option incorrect with zero marks", () => {
  const { mcqDetails } = settleMcqQuestions([mcqQuestion], { q1: "3" });
  assert.equal(mcqDetails[0].correct, false);
  assert.equal(mcqDetails[0].marksAwarded, 0);
});

test("settleMcqQuestions treats a blank MCQ answer as incorrect, not unknown", () => {
  const { mcqDetails } = settleMcqQuestions([mcqQuestion], {});
  assert.equal(mcqDetails[0].correct, false);
  assert.equal(mcqDetails[0].marksAwarded, 0);
});

test("settleMcqQuestions respects the answer key's marks for that question", () => {
  const { mcqDetails } = settleMcqQuestions([mcqQuestion], { q1: "4" }, [
    { questionId: "q1", verifiedAnswer: "4", marks: 3 },
  ]);
  assert.equal(mcqDetails[0].marksAwarded, 3);
});

test("settleMcqQuestions grades true_false the same way as mcq", () => {
  const trueFalseQuestion: GradingQuestion = { id: "q4", prompt: "The sky is blue.", type: "true_false", options: ["True", "False"], correctOptionIndex: 0 };
  const { mcqDetails } = settleMcqQuestions([trueFalseQuestion], { q4: "True" });
  assert.equal(mcqDetails[0].correct, true);
  assert.equal(mcqDetails[0].marksAwarded, 1);
});

test("settleMcqQuestions gives match_following partial credit for partially-correct pairing", () => {
  const matchingQuestion: GradingQuestion = {
    id: "q5",
    prompt: "Match the terms",
    type: "match_following",
    pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }, { left: "C", right: "3" }],
  };
  // left[0] and left[2] correctly matched (submitted index === position), left[1] swapped with left[2].
  const { mcqDetails } = settleMcqQuestions([matchingQuestion], { q5: "0,2,1" }, [{ questionId: "q5", verifiedAnswer: "", marks: 3 }]);
  assert.equal(mcqDetails[0].correct, false);
  assert.equal(mcqDetails[0].marksAwarded, 1); // 1 of 3 pairs correct * 3 marks
});

test("settleMcqQuestions grades sequencing as fully correct only when every position matches", () => {
  const sequencingQuestion: GradingQuestion = { id: "q6", prompt: "Order the steps", type: "sequencing", items: ["First", "Second", "Third"] };
  const correct = settleMcqQuestions([sequencingQuestion], { q6: "0,1,2" });
  assert.equal(correct.mcqDetails[0].correct, true);
  assert.equal(correct.mcqDetails[0].marksAwarded, 1);

  const partial = settleMcqQuestions([sequencingQuestion], { q6: "1,0,2" });
  assert.equal(partial.mcqDetails[0].correct, false);
  const partialMarks = partial.mcqDetails[0].marksAwarded ?? 0;
  assert.ok(partialMarks > 0 && partialMarks < 1);
});

test("normaliseGeneratedQuestions falls back match_following/sequencing to short_answer when the shape is too thin", () => {
  const rows = [
    { prompt: "Match these", type: "match_following", pairs: [{ left: "A", right: "1" }], modelAnswer: "A - 1" },
    { prompt: "Order these", type: "sequencing", items: ["Only one"], modelAnswer: "Only one" },
  ];
  const out = normaliseGeneratedQuestions(rows, ["easy", "medium"], ["match_following", "sequencing"]);
  assert.equal(out[0].type, "short_answer");
  assert.equal(out[1].type, "short_answer");
});

test("stub gradeSubmission grades an all-MCQ submission without touching the completeness heuristic", async () => {
  const result = await aiProvider.gradeSubmission({
    questions: [mcqQuestion, { ...mcqQuestion, id: "q3", correctOptionIndex: 2 }],
    answers: { q1: "4", q3: "3" },
  });
  assert.equal(result.score, 50);
  assert.equal(result.questionDetails.find((d) => d.questionId === "q1")?.correct, true);
  assert.equal(result.questionDetails.find((d) => d.questionId === "q3")?.correct, false);
});

test("stub gradeSubmission grades a mixed MCQ + short-answer submission and keeps question order", async () => {
  const result = await aiProvider.gradeSubmission({
    questions: [shortAnswerQuestion, mcqQuestion],
    answers: { q2: "Chlorophyll absorbs light and produces glucose.", q1: "4" },
  });
  assert.deepEqual(
    result.questionDetails.map((d) => d.questionId),
    ["q2", "q1"]
  );
  assert.equal(result.questionDetails.find((d) => d.questionId === "q1")?.correct, true);
});

test("stub generatePresentationOutline returns one outline entry per role in the sequence", async () => {
  const outline = await aiProvider.generatePresentationOutline({
    topicName: "Photosynthesis",
    subject: "Science",
    board: "CBSE",
    gradeLevel: "7",
    roleSequence: ROLE_SEQUENCES.concept_deck.map((role) => ({ role, classIndex: 0 })),
    contextText: null,
    language: "English",
  });
  assert.equal(outline.length, ROLE_SEQUENCES.concept_deck.length);
  for (const entry of outline) {
    assert.equal(typeof entry.title, "string");
    assert.ok(entry.title.length > 0);
    assert.equal(typeof entry.oneLiner, "string");
  }
});

test("stub fillPresentationContent fills every outline entry with a layout valid for its role", async () => {
  const outline = [
    { role: "title" as const, classIndex: 0, title: "Photosynthesis", oneLiner: "Intro" },
    { role: "define" as const, classIndex: 0, title: "What is photosynthesis?", oneLiner: "The core term" },
  ];
  const slides = await aiProvider.fillPresentationContent({
    topicName: "Photosynthesis",
    subject: "Science",
    board: "CBSE",
    gradeLevel: "7",
    outline,
    density: "balanced",
    reason: "concept_deck",
    contextText: null,
    language: "English",
  });
  assert.equal(slides.length, 2);
  assert.ok(ROLE_LAYOUTS.title.includes(slides[0].layout!));
  assert.ok(ROLE_LAYOUTS.define.includes(slides[1].layout!));
});
