-- CreateTable
CREATE TABLE "ai_action" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_text" TEXT,
    "result_link" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_action_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ai_message" ADD COLUMN "links" JSONB,
ADD COLUMN "action_id" UUID;

-- CreateIndex
CREATE INDEX "ai_action_conversation_id_status_idx" ON "ai_action"("conversation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_message_action_id_key" ON "ai_message"("action_id");

-- AddForeignKey
ALTER TABLE "ai_action" ADD CONSTRAINT "ai_action_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "ai_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;
