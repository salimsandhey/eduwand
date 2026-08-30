-- CreateTable
CREATE TABLE "user_role_grant" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_role_grant_user_id_idx" ON "user_role_grant"("user_id");

-- AddForeignKey
ALTER TABLE "user_role_grant" ADD CONSTRAINT "user_role_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
