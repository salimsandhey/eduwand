-- AlterTable: AnswerKey moves from position-keyed to question-id-keyed, so a
-- personalised student's reordered/subsetted question list can still be
-- looked up correctly (see backend/src/lib/personalisation.ts).
ALTER TABLE "answer_key" ADD COLUMN     "question_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "answer_key" ALTER COLUMN "question_id" DROP DEFAULT;

DROP INDEX IF EXISTS "answer_key_assignment_id_question_index_key";
CREATE UNIQUE INDEX "answer_key_assignment_id_question_id_key" ON "answer_key"("assignment_id", "question_id");
CREATE INDEX "answer_key_assignment_id_question_index_idx" ON "answer_key"("assignment_id", "question_index");

-- AlterTable: per-question grading breakdown, feeds class-insight item
-- analysis and the grading review screen.
ALTER TABLE "grade" ADD COLUMN     "question_details" JSONB;
