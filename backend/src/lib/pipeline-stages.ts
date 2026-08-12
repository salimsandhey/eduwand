import { prisma } from "./prisma";

// The 7 stages every school got for free before the pipeline became configurable
// (FR-EG-3) - seeded onto every new school so existing behavior is unchanged out
// of the box. isConverted marks a stage that counts toward the conversion rate;
// isTerminal marks a non-sequential outcome excluded from the funnel's ramp.
export const DEFAULT_PIPELINE_STAGES = [
  { key: "new", label: "New", order: 1, isTerminal: false, isConverted: false },
  { key: "contacted", label: "Contacted", order: 2, isTerminal: false, isConverted: false },
  { key: "visit", label: "Visit", order: 3, isTerminal: false, isConverted: false },
  { key: "application", label: "Application", order: 4, isTerminal: false, isConverted: false },
  { key: "admitted", label: "Admitted", order: 5, isTerminal: false, isConverted: true },
  { key: "enrolled", label: "Enrolled", order: 6, isTerminal: false, isConverted: true },
  { key: "lost", label: "Lost", order: 7, isTerminal: true, isConverted: false },
];

// skipDuplicates so this stays safe to call from the idempotent dev seed script,
// which re-runs against the same school ids every time.
export async function seedDefaultPipelineStages(schoolId: string) {
  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ schoolId, ...stage })),
    skipDuplicates: true,
  });
}
