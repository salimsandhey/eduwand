-- CreateTable
CREATE TABLE "family" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "primary_contact_name" TEXT NOT NULL,
    "primary_contact_phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_pkey" PRIMARY KEY ("id")
);

-- Add columns as nullable first so existing enquiries can be safely backfilled.
ALTER TABLE "enquiry" ADD COLUMN "academic_year_id" UUID;
ALTER TABLE "enquiry" ADD COLUMN "family_id" UUID;

-- Legacy schools with enquiries but no academic year receive an explicit
-- current legacy year. This keeps the new foreign key required without
-- silently leaving historical leads outside an intake cycle.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
INSERT INTO "academic_year" ("id", "school_id", "label", "start_date", "end_date", "is_current", "created_at", "updated_at")
SELECT gen_random_uuid(), s."id", 'Legacy intake', DATE '1970-01-01', DATE '9999-12-31', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "school" s
WHERE EXISTS (SELECT 1 FROM "enquiry" e WHERE e."school_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "academic_year" ay WHERE ay."school_id" = s."id");

-- A pre-existing school may have years but none marked current. Select its
-- most recently ending year as the deterministic legacy/current cycle.
UPDATE "academic_year" ay
SET "is_current" = true
WHERE NOT ay."is_current"
  AND NOT EXISTS (
    SELECT 1 FROM "academic_year" current_ay
    WHERE current_ay."school_id" = ay."school_id" AND current_ay."is_current"
  )
  AND ay."id" = (
    SELECT candidate."id"
    FROM "academic_year" candidate
    WHERE candidate."school_id" = ay."school_id"
    ORDER BY candidate."end_date" DESC, candidate."created_at" DESC
    LIMIT 1
  );

UPDATE "enquiry" e
SET "academic_year_id" = (
  SELECT ay."id"
  FROM "academic_year" ay
  WHERE ay."school_id" = e."school_id" AND ay."is_current"
  ORDER BY ay."updated_at" DESC
  LIMIT 1
)
WHERE e."academic_year_id" IS NULL;

ALTER TABLE "enquiry" ALTER COLUMN "academic_year_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "enquiry_school_id_academic_year_id_status_idx" ON "enquiry"("school_id", "academic_year_id", "status");
CREATE INDEX "family_school_id_primary_contact_phone_idx" ON "family"("school_id", "primary_contact_phone");

-- AddForeignKey
ALTER TABLE "family" ADD CONSTRAINT "family_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
