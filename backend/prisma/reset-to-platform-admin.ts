import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// One-off dev reset: wipe every table and leave a single platform_admin
// account to start onboarding trusts/schools from scratch. Not wired into
// any npm script - run directly with `npx tsx prisma/reset-to-platform-admin.ts`.
async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  for (const { tablename } of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE`);
  }

  const passwordHash = await bcrypt.hash("Admin@123", 10);
  const platformAdmin = await prisma.appUser.create({
    data: {
      trustId: null,
      schoolId: null,
      fullName: "EduWand Platform Admin",
      email: "admin@eduwand.com",
      role: "platform_admin",
      status: "active",
      passwordHash,
    },
  });

  console.log(`Database wiped. Only user remaining: ${platformAdmin.email} (platform_admin)`);
  console.log("Login with: admin@eduwand.com / Admin@123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
