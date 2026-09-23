-- CreateTable
CREATE TABLE "timetable_slot" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_task" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "task_date" DATE NOT NULL,
    "due_time" TEXT,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_slot_school_id_teacher_user_id_weekday_idx" ON "timetable_slot"("school_id", "teacher_user_id", "weekday");

-- CreateIndex
CREATE INDEX "calendar_task_teacher_user_id_task_date_idx" ON "calendar_task"("teacher_user_id", "task_date");

-- AddForeignKey
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_task" ADD CONSTRAINT "calendar_task_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_task" ADD CONSTRAINT "calendar_task_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
