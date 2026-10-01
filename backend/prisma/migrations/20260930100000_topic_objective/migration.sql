-- CreateTable
CREATE TABLE "topic_objective" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "blooms_stage" TEXT,
    "benchmark_percent" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_objective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topic_objective_topic_id_text_key" ON "topic_objective"("topic_id", "text");

-- AddForeignKey
ALTER TABLE "topic_objective" ADD CONSTRAINT "topic_objective_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
