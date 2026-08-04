-- DropForeignKey
ALTER TABLE "enquiry_stage_history" DROP CONSTRAINT "enquiry_stage_history_changed_by_user_id_fkey";

-- AlterTable
ALTER TABLE "enquiry_stage_history" ALTER COLUMN "changed_by_user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "enquiry_stage_history" ADD CONSTRAINT "enquiry_stage_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
