-- CreateTable
CREATE TABLE "ai_feature" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "show_on_credits" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "ai_feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_feature_key_key" ON "ai_feature"("key");

-- Starting rows, with the same costs lib/credits.ts previously hardcoded so
-- no charge changes on deploy.
INSERT INTO "ai_feature" ("id", "key", "label", "description", "icon", "cost", "show_on_credits", "sort_order", "updated_at") VALUES
    (gen_random_uuid(), 'generation', 'Lesson materials', 'Lesson plan, activity, flashcards, slides or answer key', 'sparkles-outline', 40, true, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'assignment_generation', 'AI assignments', 'Questions with model answers', 'document-text-outline', 60, true, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'assessment_generation', 'Quick check quizzes', 'In-class MCQ pulse check', 'help-circle-outline', 30, true, 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'grading', 'Graded submissions', 'AI feedback for one student', 'checkmark-done-outline', 15, true, 4, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'personalisation_suggestion', 'Personalisation', 'Per-student difficulty suggestion', 'people-outline', 20, true, 5, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'lesson_plan', 'Lesson plans (legacy)', 'Older Lesson Studio lesson plan', 'reader-outline', 40, false, 6, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'research_report', 'Research reports (legacy)', 'Older Lesson Studio research report', 'search-outline', 40, false, 7, CURRENT_TIMESTAMP);
