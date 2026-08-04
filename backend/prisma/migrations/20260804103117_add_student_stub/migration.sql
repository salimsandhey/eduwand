-- CreateTable
CREATE TABLE "student_stub" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "source_enquiry_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "class_section_id" UUID NOT NULL,
    "guardian_name" TEXT NOT NULL,
    "guardian_contact" TEXT NOT NULL,
    "admission_date" DATE NOT NULL,
    "fee_status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "student_stub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_stub_source_enquiry_id_key" ON "student_stub"("source_enquiry_id");

-- CreateIndex
CREATE INDEX "student_stub_school_id_idx" ON "student_stub"("school_id");

-- AddForeignKey
ALTER TABLE "student_stub" ADD CONSTRAINT "student_stub_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_stub" ADD CONSTRAINT "student_stub_source_enquiry_id_fkey" FOREIGN KEY ("source_enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_stub" ADD CONSTRAINT "student_stub_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
