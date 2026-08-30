CREATE TABLE "interview_record" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "conducted_by_user_id" UUID NOT NULL,
    "interview_date" TIMESTAMP(3) NOT NULL,
    "score" DECIMAL(6,2),
    "max_score" DECIMAL(6,2),
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_record_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_plan" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fee_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_chain_step" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "required_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approval_chain_step_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enquiry_approval" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enquiry_approval_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "enquiry" ADD COLUMN "fee_plan_id" UUID;
ALTER TABLE "enquiry" ADD COLUMN "approval_chain_snapshot" JSONB;
ALTER TABLE "follow_up_task" ADD COLUMN "outcome" TEXT;
ALTER TABLE "follow_up_task" ADD COLUMN "next_follow_up_at" TIMESTAMP(3);
ALTER TABLE "follow_up_task" ADD COLUMN "escalated_at" TIMESTAMP(3);

CREATE INDEX "interview_record_enquiry_id_interview_date_idx" ON "interview_record"("enquiry_id", "interview_date");
CREATE INDEX "fee_plan_school_id_academic_year_id_is_active_idx" ON "fee_plan"("school_id", "academic_year_id", "is_active");
CREATE UNIQUE INDEX "approval_chain_step_school_id_order_key" ON "approval_chain_step"("school_id", "order");
CREATE UNIQUE INDEX "enquiry_approval_enquiry_id_step_order_key" ON "enquiry_approval"("enquiry_id", "step_order");
CREATE INDEX "enquiry_fee_plan_id_idx" ON "enquiry"("fee_plan_id");

ALTER TABLE "interview_record" ADD CONSTRAINT "interview_record_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interview_record" ADD CONSTRAINT "interview_record_conducted_by_user_id_fkey" FOREIGN KEY ("conducted_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_plan" ADD CONSTRAINT "fee_plan_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_plan" ADD CONSTRAINT "fee_plan_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_chain_step" ADD CONSTRAINT "approval_chain_step_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enquiry_approval" ADD CONSTRAINT "enquiry_approval_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enquiry_approval" ADD CONSTRAINT "enquiry_approval_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_fee_plan_id_fkey" FOREIGN KEY ("fee_plan_id") REFERENCES "fee_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
INSERT INTO "approval_chain_step" ("id", "school_id", "order", "required_role", "created_at", "updated_at")
SELECT gen_random_uuid(), school."id", defaults."order", defaults."required_role", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "school" school
CROSS JOIN (VALUES (1, 'counsellor'), (2, 'admin'), (3, 'principal')) AS defaults("order", "required_role")
WHERE NOT EXISTS (SELECT 1 FROM "approval_chain_step" step WHERE step."school_id" = school."id");
