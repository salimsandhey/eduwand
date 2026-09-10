-- AlterTable
ALTER TABLE "school" ADD COLUMN     "account_type" TEXT NOT NULL DEFAULT 'institutional';

-- AlterTable
ALTER TABLE "trust" ADD COLUMN     "plan_id" UUID;

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "credits_per_teacher_seat" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_setting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_credit_account" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_credit_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entry" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "related_ai_usage_log_id" UUID,
    "note" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_change_request" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "current_subjects" TEXT[],
    "requested_subjects" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "note" TEXT,

    CONSTRAINT "subject_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_change_ticket" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "current_board" TEXT NOT NULL,
    "requested_board" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raised_by_user_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_change_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_setting_key_key" ON "platform_setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_credit_account_teacher_user_id_key" ON "teacher_credit_account"("teacher_user_id");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_teacher_user_id_created_at_idx" ON "credit_ledger_entry"("teacher_user_id", "created_at");

-- CreateIndex
CREATE INDEX "subject_change_request_teacher_user_id_decided_at_idx" ON "subject_change_request"("teacher_user_id", "decided_at");

-- CreateIndex
CREATE INDEX "board_change_ticket_school_id_created_at_idx" ON "board_change_ticket"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "trust" ADD CONSTRAINT "trust_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_credit_account" ADD CONSTRAINT "teacher_credit_account_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_related_ai_usage_log_id_fkey" FOREIGN KEY ("related_ai_usage_log_id") REFERENCES "ai_usage_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_change_request" ADD CONSTRAINT "subject_change_request_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_change_request" ADD CONSTRAINT "subject_change_request_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_change_request" ADD CONSTRAINT "subject_change_request_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_change_ticket" ADD CONSTRAINT "board_change_ticket_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_change_ticket" ADD CONSTRAINT "board_change_ticket_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_change_ticket" ADD CONSTRAINT "board_change_ticket_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
