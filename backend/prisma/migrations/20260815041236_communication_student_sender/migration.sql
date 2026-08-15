-- AlterTable
ALTER TABLE "communication_message" ADD COLUMN     "sender_student_stub_id" UUID,
ALTER COLUMN "delivery_status" SET DEFAULT 'sent';

-- CreateIndex
CREATE INDEX "communication_message_sender_student_stub_id_idx" ON "communication_message"("sender_student_stub_id");

-- AddForeignKey
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_sender_student_stub_id_fkey" FOREIGN KEY ("sender_student_stub_id") REFERENCES "student_stub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
