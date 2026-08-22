import { prisma } from "../src/lib/prisma";

// One-off: populate the new per-school Subject table from whatever free-text
// subjects already exist on Topic rows, so nothing already in use vanishes
// from the new gateway/picker. Not wired into any npm script - run directly
// with `npx tsx prisma/backfill-subjects.ts`.
async function main() {
  const topics = await prisma.topic.findMany({ select: { schoolId: true, subject: true } });

  const distinctPairs = new Map<string, { schoolId: string; name: string }>();
  for (const t of topics) {
    const name = t.subject.trim();
    if (!name) continue;
    distinctPairs.set(`${t.schoolId}::${name}`, { schoolId: t.schoolId, name });
  }

  let created = 0;
  for (const { schoolId, name } of distinctPairs.values()) {
    await prisma.subject.upsert({
      where: { schoolId_name: { schoolId, name } },
      create: { schoolId, name },
      update: {},
    });
    created += 1;
  }

  console.log(`Backfilled ${created} distinct (school, subject) pair(s) from ${topics.length} topic(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
