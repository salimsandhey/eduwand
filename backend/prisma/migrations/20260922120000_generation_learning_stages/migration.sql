-- Lets a teacher constrain an activity report's objectives to specific
-- Learning Stage(s) (Bloom's Taxonomy) at creation time.
ALTER TABLE "generation" ADD COLUMN "learning_stages" TEXT[] NOT NULL DEFAULT '{}';
