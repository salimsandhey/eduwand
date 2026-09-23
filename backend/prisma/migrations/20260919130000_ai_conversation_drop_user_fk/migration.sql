-- userId now holds either an AppUser id (staff) or a StudentStub id (students),
-- so it cannot be a foreign key to app_user.
ALTER TABLE "ai_conversation" DROP CONSTRAINT "ai_conversation_user_id_fkey";
