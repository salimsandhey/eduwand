-- CreateTable
CREATE TABLE "billing_payment" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "gateway" TEXT NOT NULL,
    "gateway_order_id" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "method" TEXT,
    "failure_reason" TEXT,
    "buyer_state" TEXT,
    "buyer_state_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "billing_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "buyer_state" TEXT,
    "buyer_state_code" TEXT,
    "description" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "sac_code" TEXT NOT NULL,
    "gst_registered" BOOLEAN NOT NULL,
    "tax_rate_percent" DOUBLE PRECISION NOT NULL,
    "taxable_value_paise" INTEGER NOT NULL,
    "cgst_paise" INTEGER NOT NULL DEFAULT 0,
    "sgst_paise" INTEGER NOT NULL DEFAULT 0,
    "igst_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL,
    "seller" JSONB NOT NULL,

    CONSTRAINT "billing_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoice_counter" (
    "financial_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "billing_invoice_counter_pkey" PRIMARY KEY ("financial_year")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_payment_gateway_order_id_key" ON "billing_payment"("gateway_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payment_gateway_payment_id_key" ON "billing_payment"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "billing_payment_teacher_user_id_created_at_idx" ON "billing_payment"("teacher_user_id", "created_at");

-- CreateIndex
CREATE INDEX "billing_payment_status_created_at_idx" ON "billing_payment"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_number_key" ON "billing_invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_payment_id_key" ON "billing_invoice"("payment_id");

-- CreateIndex
CREATE INDEX "billing_invoice_teacher_user_id_issued_at_idx" ON "billing_invoice"("teacher_user_id", "issued_at");

-- AddForeignKey
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing_payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business details printed on invoices (edited in the admin panel). Leave the
-- GSTIN empty if you are not GST-registered: invoices are then issued without
-- tax and the price is charged as-is.
INSERT INTO "platform_setting" ("id", "key", "value", "updated_at") VALUES
    (gen_random_uuid(), 'business_legal_name', '', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'business_gstin', '', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'business_address', '', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'business_state_code', '', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'business_email', '', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'invoice_sac_code', '998439', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'invoice_gst_rate', '18', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
