-- CreateTable
CREATE TABLE "password_reset_request" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "otp_code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_request_email_idx" ON "password_reset_request"("email");
