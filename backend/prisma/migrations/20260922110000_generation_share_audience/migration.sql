-- Lets a teacher share a generation with the whole class (default, unchanged
-- behavior) or with a specific subset of students instead.
ALTER TABLE "generation" ADD COLUMN "shared_with_all" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "generation" ADD COLUMN "shared_student_stub_ids" TEXT[] NOT NULL DEFAULT '{}';
