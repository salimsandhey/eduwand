import { GenerationInput } from "../src/lib/ai";

/**
 * Topic metadata for each fixture, shared between run-grounding.ts and
 * run-rubric.ts so both scripts describe the same topic the same way.
 * Mirrors what's in tracker/fixtures-register.csv.
 */
export const FIXTURE_META: Record<
  string,
  Omit<GenerationInput, "outputType" | "contextText" | "customPrompt" | "schoolFormatInstructions">
> = {
  "t1-photosynthesis": {
    topicName: "Photosynthesis",
    subject: "Biology",
    board: "CBSE",
    classCount: 1,
    minutesPerClass: 45,
    language: "English",
    classLabel: "Class 11",
  },
  "t2-newtons-laws": {
    topicName: "Newton's Laws of Motion",
    subject: "Physics",
    board: "CBSE",
    classCount: 1,
    minutesPerClass: 45,
    language: "English",
    classLabel: "Class 9",
  },
  "t3-water-cycle": {
    topicName: "The Water Cycle",
    subject: "EVS",
    board: "ICSE",
    classCount: 1,
    minutesPerClass: 40,
    language: "English",
    classLabel: "Class 4",
  },
  "t4-digestive-system": {
    topicName: "Human Digestive System",
    subject: "Biology",
    board: "CBSE",
    classCount: 1,
    minutesPerClass: 45,
    language: "English",
    classLabel: "Class 10",
  },
};
