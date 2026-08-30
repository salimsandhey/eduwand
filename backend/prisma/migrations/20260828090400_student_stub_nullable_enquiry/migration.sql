-- DropForeignKey
ALTER TABLE "student_stub" DROP CONSTRAINT "student_stub_source_enquiry_id_fkey";

-- AlterTable
ALTER TABLE "student_stub" ALTER COLUMN "source_enquiry_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "student_stub" ADD CONSTRAINT "student_stub_source_enquiry_id_fkey" FOREIGN KEY ("source_enquiry_id") REFERENCES "enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
