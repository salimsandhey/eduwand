-- School.board is the single source of truth for the board; topics no longer carry their own copy.
ALTER TABLE "topic" DROP COLUMN "board";
