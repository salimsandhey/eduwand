-- AlterTable
ALTER TABLE "enquiry" ADD COLUMN     "admission_completed_at" TIMESTAMP(3),
ADD COLUMN     "admission_draft" JSONB,
ADD COLUMN     "admission_started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "enquiry_note" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'lead_note';
