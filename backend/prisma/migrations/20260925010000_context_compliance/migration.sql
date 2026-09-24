ALTER TABLE "context_source"
  ADD COLUMN "citation" TEXT;

CREATE TABLE "context_upload_log" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "teacher_user_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "context_upload_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "context_upload_log_school_id_idx" ON "context_upload_log"("school_id");

ALTER TABLE "context_upload_log" ADD CONSTRAINT "context_upload_log_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "context_upload_log" ADD CONSTRAINT "context_upload_log_teacher_user_id_fkey"
  FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
