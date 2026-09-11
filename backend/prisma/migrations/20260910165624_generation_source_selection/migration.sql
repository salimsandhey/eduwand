-- AlterTable
ALTER TABLE "context_source" ADD COLUMN     "page_count" INTEGER;

-- AlterTable
ALTER TABLE "generation" ADD COLUMN     "selected_sources" JSONB;
