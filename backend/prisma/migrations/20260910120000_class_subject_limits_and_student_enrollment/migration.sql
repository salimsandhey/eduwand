-- AlterTable: class_section - add is_active (safe default) and join_code
-- (added nullable first, backfilled, then made required - matches the 19
-- existing rows that predate this column).
ALTER TABLE "class_section" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "join_code" TEXT;

UPDATE "class_section" SET "join_code" = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20) WHERE "join_code" IS NULL;

ALTER TABLE "class_section" ALTER COLUMN "join_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "school" ADD COLUMN     "class_limit" INTEGER,
ADD COLUMN     "subject_limit" INTEGER;

-- CreateTable
CREATE TABLE "class_change_request" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "change_type" TEXT NOT NULL,
    "target_class_section_id" UUID,
    "requested_class_name" TEXT NOT NULL,
    "requested_section_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "note" TEXT,

    CONSTRAINT "class_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_join_request" (
    "id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "student_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "guardian_name" TEXT NOT NULL,
    "guardian_contact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "created_student_stub_id" UUID,
    "note" TEXT,

    CONSTRAINT "class_join_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_change_request_teacher_user_id_decided_at_idx" ON "class_change_request"("teacher_user_id", "decided_at");

-- CreateIndex
CREATE INDEX "class_join_request_class_section_id_status_idx" ON "class_join_request"("class_section_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "class_section_join_code_key" ON "class_section"("join_code");

-- AddForeignKey
ALTER TABLE "class_change_request" ADD CONSTRAINT "class_change_request_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_change_request" ADD CONSTRAINT "class_change_request_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_change_request" ADD CONSTRAINT "class_change_request_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_join_request" ADD CONSTRAINT "class_join_request_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_join_request" ADD CONSTRAINT "class_join_request_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
