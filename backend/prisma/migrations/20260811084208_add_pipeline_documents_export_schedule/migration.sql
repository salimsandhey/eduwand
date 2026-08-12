-- AlterTable
ALTER TABLE "enquiry" ADD COLUMN     "erased_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pipeline_stage" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "is_converted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_location" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_export_schedule" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csv_export_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_stage_school_id_order_idx" ON "pipeline_stage"("school_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stage_school_id_key_key" ON "pipeline_stage"("school_id", "key");

-- CreateIndex
CREATE INDEX "document_enquiry_id_idx" ON "document"("enquiry_id");

-- CreateIndex
CREATE UNIQUE INDEX "csv_export_schedule_school_id_key" ON "csv_export_schedule"("school_id");

-- AddForeignKey
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_export_schedule" ADD CONSTRAINT "csv_export_schedule_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
