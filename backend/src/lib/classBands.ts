import { prisma } from "./prisma";

// Shared with submissions.ts's computePerformanceBand (kept in sync
// manually - same small-duplicated-constant pattern as the rest of this
// codebase). Used wherever a score-band cutoff or a new objective's default
// benchmark needs the school's actual configured thresholds instead of a
// hardcoded literal.
export const DEFAULT_LEVEL_1_MIN = 80;
export const DEFAULT_LEVEL_2_MIN = 50;

export interface ClassBandThresholds {
  level1MinPercent: number;
  level2MinPercent: number;
}

export async function getClassBandThresholds(schoolId: string): Promise<ClassBandThresholds> {
  const config = await prisma.classBandConfig.findUnique({ where: { schoolId } });
  return {
    level1MinPercent: config?.level1MinPercent ?? DEFAULT_LEVEL_1_MIN,
    level2MinPercent: config?.level2MinPercent ?? DEFAULT_LEVEL_2_MIN,
  };
}
