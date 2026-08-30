import { prisma } from "./prisma";

export async function seedDefaultApprovalChain(schoolId: string) {
  await prisma.approvalChainStep.createMany({
    data: [
      { schoolId, order: 1, requiredRole: "counsellor" },
      { schoolId, order: 2, requiredRole: "admin" },
      { schoolId, order: 3, requiredRole: "principal" },
    ],
    skipDuplicates: true,
  });
}
