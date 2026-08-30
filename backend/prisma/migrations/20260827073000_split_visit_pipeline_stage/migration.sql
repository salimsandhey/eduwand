-- Existing Visit leads are conservatively treated as scheduled: there is no
-- reliable historical signal that proves the visit already took place.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH moved_enquiries AS (
    UPDATE "enquiry"
    SET "status" = 'visit_scheduled'
    WHERE "status" = 'visit'
    RETURNING "id"
)
INSERT INTO "enquiry_stage_history" ("id", "enquiry_id", "from_status", "to_status", "changed_by_user_id", "changed_at")
SELECT gen_random_uuid(), "id", 'visit', 'visit_scheduled', NULL, CURRENT_TIMESTAMP
FROM moved_enquiries;

UPDATE "pipeline_stage" stage
SET "order" = stage."order" + 1
WHERE stage."order" >= 4
  AND EXISTS (
    SELECT 1 FROM "pipeline_stage" visit_stage
    WHERE visit_stage."school_id" = stage."school_id" AND visit_stage."key" = 'visit'
  );

UPDATE "pipeline_stage"
SET "key" = 'visit_scheduled', "label" = 'Visit scheduled', "order" = 3
WHERE "key" = 'visit';

INSERT INTO "pipeline_stage" ("id", "school_id", "key", "label", "order", "is_terminal", "is_converted", "created_at", "updated_at")
SELECT gen_random_uuid(), scheduled."school_id", 'visit_done', 'Visit done', 4, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "pipeline_stage" scheduled
WHERE scheduled."key" = 'visit_scheduled'
  AND NOT EXISTS (
    SELECT 1 FROM "pipeline_stage" existing
    WHERE existing."school_id" = scheduled."school_id" AND existing."key" = 'visit_done'
  );
