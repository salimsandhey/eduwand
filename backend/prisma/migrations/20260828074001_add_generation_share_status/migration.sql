-- AlterTable
ALTER TABLE "generation" ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "share_status" TEXT NOT NULL DEFAULT 'draft';
