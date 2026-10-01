-- CreateTable
CREATE TABLE "website_enquiry" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "school_name" TEXT,
    "role" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "internal_note" TEXT,
    "handled_by_user_id" UUID,
    "handled_at" TIMESTAMP(3),
    "ack_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_enquiry_status_created_at_idx" ON "website_enquiry"("status", "created_at");
