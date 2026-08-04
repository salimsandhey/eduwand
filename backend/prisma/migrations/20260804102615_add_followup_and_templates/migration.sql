-- CreateTable
CREATE TABLE "message_template" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "message_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_task" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "template_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "follow_up_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_template_school_id_channel_idx" ON "message_template"("school_id", "channel");

-- CreateIndex
CREATE INDEX "follow_up_task_assigned_to_user_id_status_idx" ON "follow_up_task"("assigned_to_user_id", "status");

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
