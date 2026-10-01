-- AlterTable
ALTER TABLE "generation" ADD COLUMN "completed_lesson_items" TEXT[] NOT NULL DEFAULT '{}';
