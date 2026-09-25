-- CreateTable
CREATE TABLE "ai_model_price" (
    "id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "input_per_mtok_usd" DOUBLE PRECISION NOT NULL,
    "output_per_mtok_usd" DOUBLE PRECISION NOT NULL,
    "cache_read_per_mtok_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cache_write_per_mtok_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "per_search_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "ai_model_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_limit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "value" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "ai_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_spend_counter" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "spent_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserved_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "reserved_tokens" INTEGER NOT NULL DEFAULT 0,
    "alerted_80" BOOLEAN NOT NULL DEFAULT false,
    "alerted_100" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_spend_counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_log" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID,
    "school_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blocked_reason" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_price_model_key" ON "ai_model_price"("model");

-- CreateIndex
CREATE UNIQUE INDEX "ai_limit_key_key" ON "ai_limit"("key");

-- CreateIndex
CREATE INDEX "ai_spend_counter_period_key_idx" ON "ai_spend_counter"("period_key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_spend_counter_scope_period_key_key" ON "ai_spend_counter"("scope", "period_key");

-- CreateIndex
CREATE INDEX "ai_call_log_created_at_idx" ON "ai_call_log"("created_at");

-- CreateIndex
CREATE INDEX "ai_call_log_teacher_user_id_created_at_idx" ON "ai_call_log"("teacher_user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_call_log_status_created_at_idx" ON "ai_call_log"("status", "created_at");

-- Starting prices (USD per million tokens). Gemini's per_search_usd is per
-- grounded prompt - check Google's current pricing page and edit in the admin
-- panel if it has changed.
INSERT INTO "ai_model_price" ("id", "model", "provider", "input_per_mtok_usd", "output_per_mtok_usd", "cache_read_per_mtok_usd", "cache_write_per_mtok_usd", "per_search_usd", "updated_at") VALUES
    (gen_random_uuid(), 'claude-sonnet-4-6', 'bedrock', 3, 15, 0.3, 3.75, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'claude-haiku-4-5', 'bedrock', 1, 5, 0.1, 1.25, 0, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'gemini-2.5-flash', 'gemini', 0.3, 2.5, 0.03, 0, 0.035, CURRENT_TIMESTAMP);

-- Safe testing defaults - all editable in the admin panel. "inr" values are rupees.
INSERT INTO "ai_limit" ("id", "key", "enabled", "value", "updated_at") VALUES
    (gen_random_uuid(), 'spend_day_global', true, 500, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'spend_month_global', true, 3000, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'spend_day_teacher', true, 50, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'requests_min_global', true, 60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'requests_min_teacher', true, 20, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'tokens_day_global', false, 3000000, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'max_input_tokens_call', true, 60000, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'max_output_tokens_call', true, 16000, CURRENT_TIMESTAMP);

INSERT INTO "platform_setting" ("id", "key", "value", "updated_at") VALUES
    (gen_random_uuid(), 'usd_inr', '88', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ai_paused', 'false', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
