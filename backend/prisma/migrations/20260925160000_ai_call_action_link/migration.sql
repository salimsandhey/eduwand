-- AlterTable
ALTER TABLE "ai_call_log" ADD COLUMN "ai_usage_log_id" UUID,
ADD COLUMN "feature" TEXT;

-- CreateIndex
CREATE INDEX "ai_call_log_ai_usage_log_id_idx" ON "ai_call_log"("ai_usage_log_id");

-- CreateIndex
CREATE INDEX "ai_call_log_feature_created_at_idx" ON "ai_call_log"("feature", "created_at");

-- Pricing inputs for the AI Costs page: rupees one credit is worth, and the
-- multiple of provider cost a feature should be priced at (covers GST, gateway
-- fees, failed calls and margin).
INSERT INTO "platform_setting" ("id", "key", "value", "updated_at") VALUES
    (gen_random_uuid(), 'ai_credit_value_inr', '0.10', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ai_target_margin', '3', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
