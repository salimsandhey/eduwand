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

  const otherSchool = await prisma.school.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      trustId: trust.id,
      name: "Dev School 2",
      board: "ICSE",
      status: "active",
    },
  });

  const otherSchoolAdmin = await prisma.appUser.upsert({
    where: { email: "admin2@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: otherSchool.id,
      fullName: "Dev Admin 2",
      email: "admin2@dev.eduwand.local",
      role: "admin",
      status: "active",
      passwordHash,
    },
  });

  const trustLeadership = await prisma.appUser.upsert({
    where: { email: "leadership@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: null,
      fullName: "Dev Trust Leadership",
      email: "leadership@dev.eduwand.local",
      role: "leadership",
      status: "active",
      passwordHash,
    },
  });

  console.log("Seeded:", {
    trust: trust.name,
    school: school.name,
    otherSchool: otherSchool.name,
    admin: admin.email,
    otherSchoolAdmin: otherSchoolAdmin.email,
    trustLeadership: trustLeadership.email,
  });
  console.log("Login with: admin@dev.eduwand.local / password123 (Dev School)");
  console.log("Login with: admin2@dev.eduwand.local / password123 (Dev School 2)");
  console.log("Login with: leadership@dev.eduwand.local / password123 (trust-scoped, no school_id)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
