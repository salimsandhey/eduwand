-- AlterTable
ALTER TABLE "class_section" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_user_id" UUID,
ADD COLUMN "exported_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "class_section_deleted_at_idx" ON "class_section"("deleted_at");
