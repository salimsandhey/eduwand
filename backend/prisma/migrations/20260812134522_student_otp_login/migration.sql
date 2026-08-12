-- CreateTable
CREATE TABLE "student_otp_request" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "otp_code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_otp_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_otp_request_phone_idx" ON "student_otp_request"("phone");
