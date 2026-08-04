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

  const counsellor = await prisma.appUser.upsert({
    where: { email: "counsellor@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Counsellor",
      email: "counsellor@dev.eduwand.local",
      role: "counsellor",
      status: "active",
      passwordHash,
    },
  });

  const frontDesk = await prisma.appUser.upsert({
    where: { email: "frontdesk@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Front Desk",
      email: "frontdesk@dev.eduwand.local",
      role: "front_desk",
      status: "active",
      passwordHash,
    },
  });

  const teacher = await prisma.appUser.upsert({
    where: { email: "teacher@dev.eduwand.local" },
    update: {},
    create: {
      trustId: trust.id,
      schoolId: school.id,
      fullName: "Dev Teacher",
      email: "teacher@dev.eduwand.local",
      role: "teacher",
      status: "active",
      passwordHash,
    },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      schoolId: school.id,
      label: "2026-2027",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-04-30"),
      isCurrent: true,
    },
  });

  const classSection = await prisma.classSection.upsert({
    where: { id: "00000000-0000-0000-0000-000000000011" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      academicYearId: academicYear.id,
      className: "Grade 5",
      sectionName: "A",
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

  const platformAdmin = await prisma.appUser.upsert({
    where: { email: "platform@eduwand.local" },
    update: {},
    create: {
      trustId: null,
      schoolId: null,
      fullName: "EduWand Platform Admin",
      email: "platform@eduwand.local",
      role: "platform_admin",
      status: "active",
      passwordHash,
    },
  });

  console.log("Seeded:", {
    trust: trust.name,
    school: school.name,
    classSection: `${classSection.className} ${classSection.sectionName}`,
    otherSchool: otherSchool.name,
    admin: admin.email,
    counsellor: counsellor.email,
    frontDesk: frontDesk.email,
    teacher: teacher.email,
    otherSchoolAdmin: otherSchoolAdmin.email,
    trustLeadership: trustLeadership.email,
    platformAdmin: platformAdmin.email,
  });
  console.log("Login with: platform@eduwand.local / password123 (platform_admin, no trust/school)");
  console.log("Login with: admin@dev.eduwand.local / password123 (Dev School)");
  console.log("Login with: counsellor@dev.eduwand.local / password123 (Dev School, counsellor role)");
  console.log("Login with: frontdesk@dev.eduwand.local / password123 (Dev School, front_desk role)");
  console.log("Login with: teacher@dev.eduwand.local / password123 (Dev School, teacher role)");
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
