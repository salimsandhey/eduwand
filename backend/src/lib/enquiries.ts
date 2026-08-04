import { prisma } from "./prisma";

// Duplicate detection (FR-EG-7): flags other, not-already-merged enquiries in the
// same school sharing the same contact phone number.
export async function findPossibleDuplicates(schoolId: string, contactPhone: string, excludeId?: string) {
  return prisma.enquiry.findMany({
    where: {
      schoolId,
      contactPhone,
      duplicateOfEnquiryId: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, contactName: true, status: true, createdAt: true },
  });
}
