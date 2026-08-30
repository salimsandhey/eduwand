-- AlterTable
ALTER TABLE "enquiry" ADD COLUMN     "form_responses" JSONB;

-- CreateTable
CREATE TABLE "form_definition" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "form_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_field" (
    "id" UUID NOT NULL,
    "form_definition_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "options" JSONB,
    "order" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "required_at_stage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_definition_school_id_purpose_is_active_idx" ON "form_definition"("school_id", "purpose", "is_active");

-- CreateIndex
CREATE INDEX "form_field_form_definition_id_order_idx" ON "form_field"("form_definition_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "form_field_form_definition_id_key_key" ON "form_field"("form_definition_id", "key");

-- AddForeignKey
ALTER TABLE "form_definition" ADD CONSTRAINT "form_definition_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_form_definition_id_fkey" FOREIGN KEY ("form_definition_id") REFERENCES "form_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
