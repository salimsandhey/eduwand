import { prisma } from "./prisma";
import { toCsv } from "./csv";
import { storage } from "./storage";

// Fixed, standard column set (FR-EG-11) - not configurable per school.
const CSV_HEADERS = [
  "full_name",
  "date_of_birth",
  "class",
  "section",
  "board",
  "guardian_name",
  "guardian_contact",
  "admission_date",
  "fee_status",
  "source_enquiry_id",
];

// Shared by the manual "Run export now" endpoint
// (backend/src/routes/exports.ts) and the worker's scheduled sweep
// (backend/src/worker.ts, FR-EG-11) - one code path either way.
export async function runCsvExport(schoolId: string, requestedByUserId: string) {
  try {
    const students = await prisma.studentStub.findMany({
      where: { schoolId },
      include: { classSection: true, school: true },
      orderBy: { admissionDate: "asc" },
    });

    const rows = students.map((s) => [
      s.fullName,
      s.dateOfBirth.toISOString().slice(0, 10),
      s.classSection.className,
      s.classSection.sectionName,
      s.school.board,
      s.guardianName,
      s.guardianContact,
      s.admissionDate.toISOString().slice(0, 10),
      s.feeStatus,
      s.sourceEnquiryId,
    ]);

    const csv = toCsv(CSV_HEADERS, rows);
    const key = `${schoolId}/${Date.now()}-admitted-students.csv`;
    const { location } = await storage.save(key, csv);

    return prisma.csvExportLog.create({
      data: {
        schoolId,
        requestedByUserId,
        runAt: new Date(),
        rowCount: rows.length,
        status: "success",
        fileLocation: location,
      },
    });
  } catch (err) {
    console.error("[export] failed for school", schoolId, err);
    return prisma.csvExportLog.create({
      data: {
        schoolId,
        requestedByUserId,
        runAt: new Date(),
        rowCount: 0,
        status: "failed",
      },
    });
  }
}
