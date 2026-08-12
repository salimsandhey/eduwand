-- CreateTable
CREATE TABLE "lesson_plan" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "class_section_id" UUID,
    "topic" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'lesson_plan',
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_report" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "personalisation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personalisation_suggestion" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_stub_id" UUID NOT NULL,
    "suggested_mix" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "applied_mix" JSONB,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personalisation_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_stub_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "ai_score" DOUBLE PRECISION,
    "ai_feedback" TEXT,
    "final_score" DOUBLE PRECISION,
    "final_feedback" TEXT,
    "flagged_for_attention" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "overridden_by_user_id" UUID,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_log" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'success',
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_plan_school_id_teacher_user_id_idx" ON "lesson_plan"("school_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "research_report_school_id_teacher_user_id_idx" ON "research_report"("school_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "assignment_school_id_class_section_id_idx" ON "assignment"("school_id", "class_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "personalisation_suggestion_assignment_id_student_stub_id_key" ON "personalisation_suggestion"("assignment_id", "student_stub_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_assignment_id_student_stub_id_key" ON "submission"("assignment_id", "student_stub_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_submission_id_key" ON "grade"("submission_id");

-- CreateIndex
CREATE INDEX "ai_usage_log_school_id_created_at_idx" ON "ai_usage_log"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_log_school_id_teacher_user_id_idx" ON "ai_usage_log"("school_id", "teacher_user_id");

-- AddForeignKey
ALTER TABLE "lesson_plan" ADD CONSTRAINT "lesson_plan_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan" ADD CONSTRAINT "lesson_plan_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan" ADD CONSTRAINT "lesson_plan_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report" ADD CONSTRAINT "research_report_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report" ADD CONSTRAINT "research_report_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalisation_suggestion" ADD CONSTRAINT "personalisation_suggestion_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalisation_suggestion" ADD CONSTRAINT "personalisation_suggestion_student_stub_id_fkey" FOREIGN KEY ("student_stub_id") REFERENCES "student_stub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalisation_suggestion" ADD CONSTRAINT "personalisation_suggestion_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_student_stub_id_fkey" FOREIGN KEY ("student_stub_id") REFERENCES "student_stub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade" ADD CONSTRAINT "grade_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade" ADD CONSTRAINT "grade_overridden_by_user_id_fkey" FOREIGN KEY ("overridden_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
