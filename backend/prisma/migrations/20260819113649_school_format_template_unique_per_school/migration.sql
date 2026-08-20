-- DropIndex
DROP INDEX "school_format_template_school_id_applies_to_idx";

-- CreateIndex
CREATE UNIQUE INDEX "school_format_template_school_id_applies_to_key" ON "school_format_template"("school_id", "applies_to");
