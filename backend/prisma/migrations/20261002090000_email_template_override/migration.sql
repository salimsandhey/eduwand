-- CreateTable
CREATE TABLE "email_template_override" (
    "key" TEXT NOT NULL,
    "copy" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "email_template_override_pkey" PRIMARY KEY ("key")
);
