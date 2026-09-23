import { prisma } from "./prisma";

// Single source of truth for the boards the platform supports. School.board is
// the only stored board - topics, generations, assignments etc. all read it
// from the school rather than carrying their own copy.
export const BOARDS = ["CBSE", "ICSE", "IB"] as const;

export function isValidBoard(value: unknown): value is (typeof BOARDS)[number] {
  return typeof value === "string" && (BOARDS as readonly string[]).includes(value);
}

export async function getSchoolBoard(schoolId: string): Promise<string> {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { board: true } });
  return school.board;
}
