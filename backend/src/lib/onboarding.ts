import { prisma } from "./prisma";

// Fixed set of "getting started" tasks for teachers (mobile, teacher role
// only). Order here is also the display order in the app.
export const TEACHER_ONBOARDING_TASKS = [
  { key: "first_class", label: "Create your first class", badge: "Class starter" },
  { key: "first_lesson", label: "Create your first lesson", badge: "Lesson planner" },
  { key: "first_assignment", label: "Create your first assignment", badge: "Assignment pro" },
  { key: "first_student", label: "Add your first student", badge: "Roster builder" },
] as const;

export type TeacherOnboardingTaskKey = (typeof TEACHER_ONBOARDING_TASKS)[number]["key"];

// Idempotent - safe to call from every relevant creation route without
// checking "is this the first one" first. Silently no-ops on repeat calls
// because of the @@unique([teacherUserId, taskKey]) constraint.
export async function markOnboardingTaskComplete(teacherUserId: string, taskKey: TeacherOnboardingTaskKey) {
  await prisma.teacherOnboardingTask.upsert({
    where: { teacherUserId_taskKey: { teacherUserId, taskKey } },
    update: {},
    create: { teacherUserId, taskKey },
  });
}
