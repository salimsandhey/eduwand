import { prisma } from "../src/lib/prisma";
import { seedDefaultFormDefinitions } from "../src/lib/form-definitions";

// One-off: seedDefaultFormDefinitions (src/lib/form-definitions.ts) only runs
// on school creation (routes/schools.ts), so every School row that existed
// before the form-builder feature shipped has zero FormDefinition rows.
// Without this, document uploads for any type other than "other" 400 for
// those schools, and any non-empty formResponses/admissionDraft is rejected
// as an unknown field. Mirrors prisma/backfill-subjects.ts's convention: not
// wired into any npm script - run directly with `npx tsx prisma/backfill-form-definitions.ts`.
async function main() {
  const schoolsMissingForms = await prisma.school.findMany({
    where: { formDefinitions: { none: {} } },
    select: { id: true, name: true },
  });

  for (const school of schoolsMissingForms) {
    await seedDefaultFormDefinitions(school.id);
    console.log(`Seeded default form definitions for ${school.name} (${school.id})`);
  }

  console.log(`Backfilled ${schoolsMissingForms.length} school(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
