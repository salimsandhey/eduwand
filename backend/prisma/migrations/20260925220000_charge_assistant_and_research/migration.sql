-- The assistant chat and web research used to be free. Starting prices are set
-- from measured cost (assistant about Rs 0.10 a message, research about Rs 3.50
-- a search) at Rs 0.10 per credit and 3x cost - editable in the admin panel
-- (Platform Settings, or Apply a suggestion on the AI Costs page).
INSERT INTO "ai_feature" ("id", "key", "label", "description", "icon", "cost", "show_on_credits", "sort_order", "updated_at") VALUES
    (gen_random_uuid(), 'assistant', 'AI assistant', 'One message to the assistant', 'chatbubbles-outline', 5, true, 8, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'context_research', 'Web research', 'Find sources on the web for a topic', 'search-outline', 100, true, 9, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
