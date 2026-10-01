-- Sonnet is no longer used by any AI feature (everything runs on Haiku now) -
-- drop its stale price row so it doesn't show up in the admin panel's pricing list.
DELETE FROM "ai_model_price" WHERE "model" = 'claude-sonnet-4-6';
