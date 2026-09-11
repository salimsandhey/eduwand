-- CreateTable
CREATE TABLE "context_research_job" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stage" TEXT NOT NULL DEFAULT 'searching',
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_research_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "context_research_job_topic_id_idx" ON "context_research_job"("topic_id");

-- AddForeignKey
ALTER TABLE "context_research_job" ADD CONSTRAINT "context_research_job_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
