-- AlterTable
ALTER TABLE "school" ADD COLUMN     "expected_student_strength" INTEGER,
ADD COLUMN     "principal_name" TEXT,
ADD COLUMN     "principal_phone" TEXT;

-- AlterTable
ALTER TABLE "trust" ADD COLUMN     "contact_person_name" TEXT,
ADD COLUMN     "contact_person_phone" TEXT,
ADD COLUMN     "expected_school_count" INTEGER,
ADD COLUMN     "gst_number" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "registered_address" TEXT,
ADD COLUMN     "trust_type" TEXT;
