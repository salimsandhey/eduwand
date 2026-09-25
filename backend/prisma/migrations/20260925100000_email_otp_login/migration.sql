-- Student login moves from guardian phone + SMS OTP to the student's own
-- email + OTP. Pending phone OTPs are short-lived and meaningless as emails,
-- so they are discarded before the column is renamed.
DELETE FROM "student_otp_request";
ALTER TABLE "student_otp_request" RENAME COLUMN "phone" TO "email";
ALTER INDEX "student_otp_request_phone_idx" RENAME TO "student_otp_request_email_idx";

-- AlterTable
ALTER TABLE "student_stub" ADD COLUMN "email" TEXT;
CREATE INDEX "student_stub_email_idx" ON "student_stub"("email");

-- AlterTable
ALTER TABLE "class_join_request" ADD COLUMN "student_email" TEXT;

-- CreateTable
CREATE TABLE "signup_otp_request" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "otp_code_hash" TEXT NOT NULL,
    "pending_data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_otp_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "signup_otp_request_email_idx" ON "signup_otp_request"("email");
