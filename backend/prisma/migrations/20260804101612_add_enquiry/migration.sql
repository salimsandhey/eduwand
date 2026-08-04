-- CreateTable
CREATE TABLE "enquiry" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT,
    "source" TEXT NOT NULL,
    "grade_interest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "lost_reason" TEXT,
    "owner_user_id" UUID,
    "notes" TEXT,
    "duplicate_of_enquiry_id" UUID,
    "consent_captured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_stage_history" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiry_school_id_status_idx" ON "enquiry"("school_id", "status");

-- CreateIndex
CREATE INDEX "enquiry_school_id_contact_phone_idx" ON "enquiry"("school_id", "contact_phone");

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry" ADD CONSTRAINT "enquiry_duplicate_of_enquiry_id_fkey" FOREIGN KEY ("duplicate_of_enquiry_id") REFERENCES "enquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_stage_history" ADD CONSTRAINT "enquiry_stage_history_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_stage_history" ADD CONSTRAINT "enquiry_stage_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
