-- CreateTable
CREATE TABLE "csv_export_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "schedule" TEXT,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "file_location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "csv_export_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "csv_export_log_school_id_idx" ON "csv_export_log"("school_id");

-- AddForeignKey
ALTER TABLE "csv_export_log" ADD CONSTRAINT "csv_export_log_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_export_log" ADD CONSTRAINT "csv_export_log_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
