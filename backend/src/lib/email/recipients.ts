import { prisma } from "../prisma";

export interface StudentRecipient {
  id: string;
  fullName: string;
  email: string;
}

// Active students in a class who have a sign-in email on file - the only ones
// we can notify. Pass studentIds to narrow it (e.g. material shared with just
// some of the class).
export async function studentRecipientsForClass(classSectionId: string, studentIds?: string[]): Promise<StudentRecipient[]> {
  const students = await prisma.studentStub.findMany({
    where: {
      classSectionId,
      status: "active",
      email: { not: null },
      ...(studentIds && studentIds.length > 0 ? { id: { in: studentIds } } : {}),
    },
    select: { id: true, fullName: true, email: true },
  });
  return students.filter((s): s is StudentRecipient => !!s.email);
}
