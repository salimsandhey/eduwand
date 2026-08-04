import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const trust = await prisma.trust.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Dev Trust",
      status: "active",
    },
  });

  const school = await prisma.school.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      trustId: trust.id,
      name: "Dev School",
      board: "CBSE",
      status: "active",
    },
  });

  const admin = await prisma.appUser.upsert({
    where: { email: "admin@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Admin",
      email: "admin@dev.eduwand.local",
      role: "admin",
      status: "active",
      passwordHash,
    },
  });

  console.log("Seeded:", { trust: trust.name, school: school.name, admin: admin.email });
  console.log("Login with: admin@dev.eduwand.local / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
