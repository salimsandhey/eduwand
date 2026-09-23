-- Unset until physical remotes are configured; unused by present.ts today.
ALTER TABLE "student_stub" ADD COLUMN "seat_number" INTEGER;

-- Presenting a quick check on a screen: a short-lived code stands in for
-- login on the classroom device (same pattern as class_section.join_code).
ALTER TABLE "assessment" ADD COLUMN "present_code" TEXT;
ALTER TABLE "assessment" ADD COLUMN "present_code_expires_at" TIMESTAMP(3);
ALTER TABLE "assessment" ADD COLUMN "current_question_index" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assessment" ADD COLUMN "current_question_revealed" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "assessment_present_code_key" ON "assessment"("present_code");
