-- CreateTable
CREATE TABLE "school_name_change_ticket" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "current_name" TEXT NOT NULL,
    "requested_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raised_by_user_id" UUID NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_name_change_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_name_change_ticket_school_id_created_at_idx" ON "school_name_change_ticket"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "school_name_change_ticket" ADD CONSTRAINT "school_name_change_ticket_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_name_change_ticket" ADD CONSTRAINT "school_name_change_ticket_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_name_change_ticket" ADD CONSTRAINT "school_name_change_ticket_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
