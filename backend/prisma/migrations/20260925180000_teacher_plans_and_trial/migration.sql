-- CreateTable
CREATE TABLE "billing_plan" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price_inr" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "billing_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subscription" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "credits" INTEGER NOT NULL,
    "price_inr" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "payment_id" TEXT,
    "created_by_user_id" UUID,
    "note" TEXT,
    "reminded_3d" BOOLEAN NOT NULL DEFAULT false,
    "reminded_1d" BOOLEAN NOT NULL DEFAULT false,
    "reminded_ended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_plan_key_key" ON "billing_plan"("key");

-- CreateIndex
CREATE INDEX "teacher_subscription_teacher_user_id_ends_at_idx" ON "teacher_subscription"("teacher_user_id", "ends_at");

-- CreateIndex
CREATE INDEX "teacher_subscription_status_ends_at_idx" ON "teacher_subscription"("status", "ends_at");

-- Starting plans - every value is editable in the admin panel.
INSERT INTO "billing_plan" ("id", "key", "name", "kind", "price_inr", "duration_days", "credits", "enabled", "sort_order", "updated_at") VALUES
    (gen_random_uuid(), 'trial', 'Free trial', 'trial', 0, 15, 5000, true, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'pro', 'Pro', 'paid', 499, 30, 5000, true, 2, CURRENT_TIMESTAMP);

-- Individual teachers that already exist start a fresh trial so nobody is
-- locked out by this change.
INSERT INTO "teacher_subscription" ("id", "teacher_user_id", "plan_key", "plan_name", "kind", "status", "starts_at", "ends_at", "credits", "price_inr", "source")
SELECT gen_random_uuid(), u."id", 'trial', 'Free trial', 'trial', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '15 days', 5000, 0, 'signup'
FROM "app_user" u
JOIN "school" s ON s."id" = u."school_id"
WHERE u."role" = 'teacher' AND s."account_type" = 'individual';
