-- Brute-force lockout and session revocation for staff accounts.
ALTER TABLE "app_user" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "locked_until" TIMESTAMP(3),
ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Session revocation for students.
ALTER TABLE "student_stub" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Separate secret for controlling a live present session.
ALTER TABLE "assessment" ADD COLUMN "present_control_key" TEXT;
