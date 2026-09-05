-- AlterTable: stores the "Generate assignment with AI" setup params
-- (question count, difficulty mix, selected objectives, question types,
-- focus prompt) so a single question can be regenerated against the same
-- taught content later. Null for manually created assignments.
ALTER TABLE "assignment" ADD COLUMN     "ai_gen_params" JSONB;
