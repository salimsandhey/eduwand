// One-off backfill for the credits system (Docs/superpowers/plans/2026-09-
// 09-individual-teacher-onboarding-and-credits.md, Phase 4). Institutional
// teachers created before this system shipped have no TeacherCreditAccount
// at all. Run this in the SAME deploy as the credit-gating logic - gating
// without this backfill would instantly reject AI usage for every existing
// institutional teacher.
//
// Usage: npm run backfill:teacher-credits
import { prisma } from "../src/lib/prisma";
import { grantInitialCredits } from "../src/lib/credits";

async function main() {
  const teachersWithoutAccount = await prisma.appUser.findMany({
    where: { role: "teacher", creditAccount: null },
    select: { id: true, trustId: true, fullName: true, email: true },
  });

  console.log(`Found ${teachersWithoutAccount.length} teacher(s) without a credit account.`);

  for (const teacher of teachersWithoutAccount) {
    await grantInitialCredits(prisma, teacher.id, teacher.trustId);
    console.log(`Granted initial credits to ${teacher.fullName} <${teacher.email}>`);
  }

  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
