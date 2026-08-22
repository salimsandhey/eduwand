import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// Safe to run on a fresh DB or one that already has real data - upserts a
// single platform_admin by email and touches nothing else (unlike
// reset-to-platform-admin.ts, which truncates every table). Run with
// `npx tsx prisma/ensure-platform-admin.ts`.
async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@eduwand.com";
  const password = process.env.ADMIN_PASSWORD ?? "Admin@123";
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.appUser.upsert({
    where: { email },
    update: { role: "platform_admin", status: "active", passwordHash },
    create: {
      trustId: null,
      schoolId: null,
      fullName: "EduWand Platform Admin",
      email,
      role: "platform_admin",
      status: "active",
      passwordHash,
    },
  });

  console.log(`platform_admin ready: ${admin.email}`);
  console.log(`Login with: ${email} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
