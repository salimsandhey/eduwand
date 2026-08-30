import { prisma } from "./prisma";

// Default form definitions seeded for every new school (Docs/Dev/
// GrowthEngine_Rebuild_Plan.md Phase 2), mirroring lib/pipeline-stages.ts's
// seedDefaultPipelineStages so existing behavior (a working intake/admission/
// document flow out of the box) is unchanged even before a school customizes
// its forms.

interface DefaultFieldSeed {
  key: string;
  label: string;
  fieldType: string;
  options?: unknown;
  isRequired?: boolean;
  requiredAtStage?: string | null;
}

// contactName/contactPhone/contactEmail/gradeInterest/source are already real
// Enquiry columns (schema.prisma), not dynamic fields - not duplicated here.
// purposeOfVisit is a single illustrative extra field demonstrating the
// dynamic-field mechanism without re-modelling fixed columns.
const ENQUIRY_INTAKE_FIELDS: DefaultFieldSeed[] = [
  { key: "purposeOfVisit", label: "Purpose of Visit", fieldType: "textarea", isRequired: false },
];

// fullName/dateOfBirth/classSectionId/guardianName/guardianContact/
// admissionDate are the existing fixed ADMISSION_DRAFT_FIELDS
// (lib/enquiries.ts) and stay as-is - these are the new dynamic fields
// layered on top. All become required once the Admission tab unlocks
// (status: "application" - see ADMISSION_UNLOCKED_STATUSES in
// routes/enquiries.ts).
const ADMISSION_DETAIL_FIELDS: DefaultFieldSeed[] = [
  { key: "studentGender", label: "Student Gender", fieldType: "select", options: ["male", "female", "other"], isRequired: true, requiredAtStage: "application" },
  { key: "studentNationality", label: "Student Nationality", fieldType: "text", isRequired: true, requiredAtStage: "application" },
  { key: "studentReligion", label: "Student Religion", fieldType: "text", isRequired: false, requiredAtStage: "application" },
  { key: "guardianOccupation", label: "Guardian Occupation", fieldType: "text", isRequired: true, requiredAtStage: "application" },
  { key: "previousSchoolName", label: "Previous School Name", fieldType: "text", isRequired: false, requiredAtStage: "application" },
  { key: "previousClassAttended", label: "Previous Class Attended", fieldType: "text", isRequired: false, requiredAtStage: "application" },
  { key: "reasonForLeaving", label: "Reason for Leaving", fieldType: "textarea", isRequired: false, requiredAtStage: "application" },
  { key: "permanentAddress", label: "Permanent Address", fieldType: "textarea", isRequired: true, requiredAtStage: "application" },
  { key: "currentAddress", label: "Current Address", fieldType: "textarea", isRequired: true, requiredAtStage: "application" },
  { key: "emergencyContactName", label: "Emergency Contact Name", fieldType: "text", isRequired: true, requiredAtStage: "application" },
  { key: "emergencyContactNumber", label: "Emergency Contact Number", fieldType: "text", isRequired: true, requiredAtStage: "application" },
  { key: "medicalAllergiesOrConditions", label: "Medical Allergies or Conditions", fieldType: "textarea", isRequired: false, requiredAtStage: "application" },
  { key: "declarationConfirmed", label: "Declaration Confirmed", fieldType: "checkbox", isRequired: true, requiredAtStage: "application" },
];

const DOCUMENT_CHECKLIST_FIELDS: DefaultFieldSeed[] = [
  { key: "birthCertificate", label: "Birth Certificate", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "aadhaarCard", label: "Aadhaar Card", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "previousReportCard", label: "Previous School Report Card", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "transferCertificate", label: "Transfer Certificate (TC)", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "addressProof", label: "Address Proof", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "photographs", label: "Passport-size Photographs", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "casteOrIncomeCertificate", label: "Caste or Income Certificate", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
  { key: "medicalCertificate", label: "Medical Certificate", fieldType: "checkbox", isRequired: true, requiredAtStage: null },
];

const DEFAULT_FORM_DEFINITIONS: { purpose: string; name: string; fields: DefaultFieldSeed[] }[] = [
  { purpose: "enquiry_intake", name: "Enquiry Intake", fields: ENQUIRY_INTAKE_FIELDS },
  { purpose: "admission_detail", name: "Admission Detail", fields: ADMISSION_DETAIL_FIELDS },
  { purpose: "document_checklist", name: "Document Checklist", fields: DOCUMENT_CHECKLIST_FIELDS },
];

export async function seedDefaultFormDefinitions(schoolId: string) {
  for (const def of DEFAULT_FORM_DEFINITIONS) {
    await prisma.formDefinition.create({
      data: {
        schoolId,
        purpose: def.purpose,
        name: def.name,
        isActive: true,
        fields: {
          create: def.fields.map((field, index) => ({
            key: field.key,
            label: field.label,
            fieldType: field.fieldType,
            options: field.options ?? undefined,
            order: index + 1,
            isRequired: field.isRequired ?? false,
            requiredAtStage: field.requiredAtStage ?? null,
          })),
        },
      },
    });
  }
}
