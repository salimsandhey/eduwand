-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "has_seen_onboarding_tour" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "teacher_onboarding_task" (
    "id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "task_key" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_onboarding_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_onboarding_task_teacher_user_id_task_key_key" ON "teacher_onboarding_task"("teacher_user_id", "task_key");

-- AddForeignKey
ALTER TABLE "teacher_onboarding_task" ADD CONSTRAINT "teacher_onboarding_task_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
