ALTER TABLE "generation"
  ADD COLUMN "presentation_reason" TEXT,
  ADD COLUMN "presentation_density" TEXT,
  ADD COLUMN "presentation_classes" INTEGER,
  ADD COLUMN "outline" JSONB;
