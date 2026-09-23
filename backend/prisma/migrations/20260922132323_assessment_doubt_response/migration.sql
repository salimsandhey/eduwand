-- AlterTable
ALTER TABLE "assessment_response" ADD COLUMN     "is_doubt" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "selected_option_index" DROP NOT NULL,
ALTER COLUMN "is_correct" DROP NOT NULL;
