-- Teacher-reported "I taught this class period" progress for a lesson plan
-- that spans multiple classes (Generation.classCount > 1). See the
-- "sessions" tag on each stage in the lesson_plan content JSON.
ALTER TABLE "generation" ADD COLUMN "completed_sessions" INTEGER[] NOT NULL DEFAULT '{}';
