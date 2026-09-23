-- CreateTable
CREATE TABLE "saved_video" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel_title" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_video_topic_id_video_id_key" ON "saved_video"("topic_id", "video_id");

-- AddForeignKey
ALTER TABLE "saved_video" ADD CONSTRAINT "saved_video_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
