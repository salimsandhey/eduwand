-- AlterTable
ALTER TABLE "assignment" ADD COLUMN     "topic_id" UUID;

-- CreateTable
CREATE TABLE "topic" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_source" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "file_location" TEXT,
    "source_url" TEXT,
    "idream_k12_reference_id" TEXT,
    "extraction_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_format_template" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "applies_to" TEXT NOT NULL,
    "template_body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_format_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "output_type" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'generate',
    "class_count" INTEGER,
    "minutes_per_class" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'English',
    "custom_prompt" TEXT,
    "ai_output" TEXT NOT NULL,
    "edited_output" TEXT,
    "school_format_template_id" UUID,
    "model_used" TEXT NOT NULL,
    "model_version" TEXT,
    "prompt_version" TEXT,
    "generation_status" TEXT NOT NULL DEFAULT 'succeeded',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attainment_report" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "blooms_taxonomy_mapping" JSONB,
    "what_was_done" TEXT,
    "outcomes" TEXT,
    "improvement_notes" TEXT,
    "pdf_file_location" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attainment_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_key" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "question_index" INTEGER NOT NULL,
    "photo_submission_required" BOOLEAN NOT NULL DEFAULT false,
    "ai_answer" TEXT NOT NULL,
    "teacher_verified_answer" TEXT,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_school_id_teacher_user_id_idx" ON "topic"("school_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "topic_class_section_id_subject_idx" ON "topic"("class_section_id", "subject");

-- CreateIndex
CREATE INDEX "context_source_topic_id_idx" ON "context_source"("topic_id");

-- CreateIndex
CREATE INDEX "school_format_template_school_id_applies_to_idx" ON "school_format_template"("school_id", "applies_to");

-- CreateIndex
CREATE INDEX "observation_topic_id_idx" ON "observation"("topic_id");

-- CreateIndex
CREATE INDEX "generation_topic_id_idx" ON "generation"("topic_id");

-- CreateIndex
CREATE INDEX "generation_teacher_user_id_idx" ON "generation"("teacher_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attainment_report_topic_id_key" ON "attainment_report"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_key_assignment_id_question_index_key" ON "answer_key"("assignment_id", "question_index");

-- CreateIndex
CREATE INDEX "assignment_topic_id_idx" ON "assignment"("topic_id");

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic" ADD CONSTRAINT "topic_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_source" ADD CONSTRAINT "context_source_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_format_template" ADD CONSTRAINT "school_format_template_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation" ADD CONSTRAINT "generation_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation" ADD CONSTRAINT "generation_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation" ADD CONSTRAINT "generation_school_format_template_id_fkey" FOREIGN KEY ("school_format_template_id") REFERENCES "school_format_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attainment_report" ADD CONSTRAINT "attainment_report_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_key" ADD CONSTRAINT "answer_key_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
