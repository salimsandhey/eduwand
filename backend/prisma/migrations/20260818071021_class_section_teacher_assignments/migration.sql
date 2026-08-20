-- CreateTable
CREATE TABLE "class_section_teacher" (
    "id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_section_teacher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_section_teacher_class_section_id_teacher_user_id_key" ON "class_section_teacher"("class_section_id", "teacher_user_id");

-- AddForeignKey
ALTER TABLE "class_section_teacher" ADD CONSTRAINT "class_section_teacher_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_section_teacher" ADD CONSTRAINT "class_section_teacher_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
