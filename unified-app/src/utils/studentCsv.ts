// Shared CSV parsing for student bulk-upload (StudentsScreen.tsx). CSV, not
// real .xlsx - opens fine in Excel/Sheets and needs no new native
// dependencies (a real binary .xlsx would need expo-file-system,
// expo-sharing, and an xlsx library, none of which are installed). See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

export const STUDENT_CSV_TEMPLATE =
  "full_name,date_of_birth,guardian_name,guardian_contact,email\nJohn Doe,2015-04-12,Jane Doe,+911234567890,john@example.com\n";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (char === "\r") {
      i += 1;
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface StudentCsvRow {
  fullName: string;
  dateOfBirth: string;
  guardianName: string;
  guardianContact: string;
  email: string;
}

export function rowsToStudentRows(csvRows: string[][]): StudentCsvRow[] {
  if (csvRows.length === 0) return [];
  const header = csvRows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const nameIdx = col("full_name");
  const dobIdx = col("date_of_birth");
  const guardianNameIdx = col("guardian_name");
  const guardianContactIdx = col("guardian_contact");
  const emailIdx = col("email");

  return csvRows.slice(1).map((r) => ({
    fullName: r[nameIdx]?.trim() ?? "",
    dateOfBirth: r[dobIdx]?.trim() ?? "",
    guardianName: r[guardianNameIdx]?.trim() ?? "",
    guardianContact: r[guardianContactIdx]?.trim() ?? "",
    email: r[emailIdx]?.trim() ?? "",
  }));
}
