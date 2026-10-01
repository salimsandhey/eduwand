-- CreateTable
CREATE TABLE "student_insight_cache" (
    "id" UUID NOT NULL,
    "student_stub_id" UUID NOT NULL,
    "scope_key" TEXT NOT NULL,
    "graded_submission_count" INTEGER NOT NULL,
    "ai_summary" TEXT NOT NULL,
    "ai_next_step" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_insight_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_insight_cache_student_stub_id_scope_key_key" ON "student_insight_cache"("student_stub_id", "scope_key");

-- AddForeignKey
ALTER TABLE "student_insight_cache" ADD CONSTRAINT "student_insight_cache_student_stub_id_fkey" FOREIGN KEY ("student_stub_id") REFERENCES "student_stub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
