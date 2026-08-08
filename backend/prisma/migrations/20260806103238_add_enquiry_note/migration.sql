-- CreateTable
CREATE TABLE "enquiry_note" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "author_user_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiry_note_enquiry_id_created_at_idx" ON "enquiry_note"("enquiry_id", "created_at");

-- AddForeignKey
ALTER TABLE "enquiry_note" ADD CONSTRAINT "enquiry_note_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_note" ADD CONSTRAINT "enquiry_note_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: carry over any existing free-text notes into the new notes list
-- before the column is dropped, so historical notes aren't lost.
INSERT INTO "enquiry_note" ("id", "enquiry_id", "author_user_id", "body", "created_at")
SELECT gen_random_uuid(), "id", "created_by", "notes", "created_at"
FROM "enquiry"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';

-- AlterTable
ALTER TABLE "enquiry" DROP COLUMN "notes";
