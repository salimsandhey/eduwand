-- CreateTable
CREATE TABLE "assessment" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'capturing',
    "completed_at" TIMESTAMP(3),
    "results_released_to_students" BOOLEAN NOT NULL DEFAULT false,
    "results_released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_response" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "student_stub_id" UUID NOT NULL,
    "selected_option_index" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_school_id_class_section_id_idx" ON "assessment"("school_id", "class_section_id");

-- CreateIndex
CREATE INDEX "assessment_topic_id_idx" ON "assessment"("topic_id");

-- CreateIndex
CREATE INDEX "assessment_response_assessment_id_idx" ON "assessment_response"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_response_assessment_id_question_id_student_stub__key" ON "assessment_response"("assessment_id", "question_id", "student_stub_id");

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_response" ADD CONSTRAINT "assessment_response_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_response" ADD CONSTRAINT "assessment_response_student_stub_id_fkey" FOREIGN KEY ("student_stub_id") REFERENCES "student_stub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
