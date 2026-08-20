-- AlterTable
ALTER TABLE "context_source" ADD COLUMN     "extracted_text" TEXT,
ADD COLUMN     "extraction_error" TEXT,
ADD COLUMN     "original_filename" TEXT;

-- CreateTable
CREATE TABLE "_ContextSourceToGeneration" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ContextSourceToGeneration_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ContextSourceToGeneration_B_index" ON "_ContextSourceToGeneration"("B");

-- AddForeignKey
ALTER TABLE "_ContextSourceToGeneration" ADD CONSTRAINT "_ContextSourceToGeneration_A_fkey" FOREIGN KEY ("A") REFERENCES "context_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContextSourceToGeneration" ADD CONSTRAINT "_ContextSourceToGeneration_B_fkey" FOREIGN KEY ("B") REFERENCES "generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
