-- AlterTable
ALTER TABLE "grade" ADD COLUMN     "ai_next_step" TEXT,
ADD COLUMN     "performance_band" TEXT,
ADD COLUMN     "released_to_student" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "submission" ADD COLUMN     "ocr_confidence" DOUBLE PRECISION,
ADD COLUMN     "ocr_extracted_text" TEXT,
ADD COLUMN     "photo_file_location" TEXT,
ADD COLUMN     "submission_type" TEXT NOT NULL DEFAULT 'online';

-- CreateTable
CREATE TABLE "class_band_config" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "level_1_min_percent" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "level_2_min_percent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_band_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "sender_user_id" UUID,
    "recipient_student_stub_id" UUID,
    "recipient_class_section_id" UUID,
    "topic_id" UUID,
    "body" TEXT NOT NULL,
    "delivery_mechanism" TEXT,
    "delivery_status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_band_config_school_id_key" ON "class_band_config"("school_id");

-- CreateIndex
CREATE INDEX "communication_message_school_id_channel_idx" ON "communication_message"("school_id", "channel");

-- CreateIndex
CREATE INDEX "communication_message_recipient_student_stub_id_idx" ON "communication_message"("recipient_student_stub_id");

-- AddForeignKey
ALTER TABLE "class_band_config" ADD CONSTRAINT "class_band_config_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_recipient_student_stub_id_fkey" FOREIGN KEY ("recipient_student_stub_id") REFERENCES "student_stub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_recipient_class_section_id_fkey" FOREIGN KEY ("recipient_class_section_id") REFERENCES "class_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message" ADD CONSTRAINT "communication_message_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
