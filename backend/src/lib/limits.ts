import { prisma } from "./prisma";

// Class/subject caps for individual accounts, configurable without a code
// deploy - see Docs/superpowers/plans/2026-09-09-individual-teacher-
// onboarding-and-credits.md. Resolution order: the school's own override
// (School.classLimit/subjectLimit), else the platform default
// (PlatformSetting), else a hardcoded last-resort constant. Institutional
// schools are never subject to either cap - callers must check
// accountType === "individual" before calling these.

const FALLBACK_LIMIT = 2;
const DEFAULT_CLASS_LIMIT_KEY = "individual_default_class_limit";
const DEFAULT_SUBJECT_LIMIT_KEY = "individual_default_subject_limit";

async function resolveLimit(schoolOverride: number | null, settingKey: string): Promise<number> {
  if (schoolOverride !== null) return schoolOverride;

  const setting = await prisma.platformSetting.findUnique({ where: { key: settingKey } });
  if (setting) {
    const parsed = Number.parseInt(setting.value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }

  return FALLBACK_LIMIT;
}

export async function resolveClassLimit(schoolId: string): Promise<number> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { classLimit: true } });
  return resolveLimit(school?.classLimit ?? null, DEFAULT_CLASS_LIMIT_KEY);
}

export async function resolveSubjectLimit(schoolId: string): Promise<number> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { subjectLimit: true } });
  return resolveLimit(school?.subjectLimit ?? null, DEFAULT_SUBJECT_LIMIT_KEY);
}
