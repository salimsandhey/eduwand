-- CreateTable
CREATE TABLE "ai_prompt_template" (
    "id" UUID NOT NULL,
    "output_type" TEXT NOT NULL,
    "prompt_body" TEXT NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompt_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_template_output_type_key" ON "ai_prompt_template"("output_type");
