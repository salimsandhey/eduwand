-- AlterTable
ALTER TABLE "enquiry" ADD COLUMN     "avatar_key" TEXT,
ADD COLUMN     "guardian_relation" TEXT,
ADD COLUMN     "photo_location" TEXT,
ADD COLUMN     "photo_mime_type" TEXT,
ADD COLUMN     "student_date_of_birth" DATE,
ADD COLUMN     "student_name" TEXT;
