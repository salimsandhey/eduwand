import { prisma } from "./prisma";

// The CurrentUser shape the mobile app gets for a signed-in student - shared
// by GET /auth/me (auth.ts) and the student branch of the profile-picture
// endpoints (auth-me.ts), so a photo/avatar change returns exactly what a
// fresh /auth/me would. Students have no AppUser row, so the staff-only
// fields are fixed values.
export async function loadStudentMe(studentId: string) {
  const student = await prisma.studentStub.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, schoolId: true, classSectionId: true, photoMimeType: true, avatarKey: true },
  });
  if (!student) return null;
  return {
    id: student.id,
    fullName: student.fullName,
    email: "",
    phone: null,
    role: "student",
    schoolId: student.schoolId,
    trustId: null,
    status: "active",
    classSectionId: student.classSectionId,
    photoMimeType: student.photoMimeType,
    avatarKey: student.avatarKey,
    accountType: null,
    board: null,
    hasSeenOnboardingTour: true,
    hasDismissedProfilePrompt: true,
  };
}
