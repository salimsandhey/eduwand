import { prisma } from "./prisma";

export const DEFAULT_PIPELINE_STAGES = [
  { key: "new", label: "New", order: 1, isTerminal: false, isConverted: false },
  { key: "contacted", label: "Contacted", order: 2, isTerminal: false, isConverted: false },
  { key: "visit_scheduled", label: "Visit scheduled", order: 3, isTerminal: false, isConverted: false },
  { key: "visit_done", label: "Visit done", order: 4, isTerminal: false, isConverted: false },
  { key: "application", label: "Application", order: 5, isTerminal: false, isConverted: false },
  { key: "admitted", label: "Admitted", order: 6, isTerminal: false, isConverted: true },
  { key: "enrolled", label: "Enrolled", order: 7, isTerminal: false, isConverted: true },
  { key: "lost", label: "Lost", order: 8, isTerminal: true, isConverted: false },
];

export async function seedDefaultPipelineStages(schoolId: string) {
  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ schoolId, ...stage })),
    skipDuplicates: true,
  });
}
