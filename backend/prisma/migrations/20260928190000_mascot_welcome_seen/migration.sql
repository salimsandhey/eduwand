-- AlterTable
-- Default true so every pre-existing account is backfilled as "already
-- seen" - the mascot welcome animation must only ever play for a genuinely
-- new registration, never replay for an existing account.
ALTER TABLE "app_user" ADD COLUMN "has_seen_mascot_welcome" BOOLEAN NOT NULL DEFAULT true;
