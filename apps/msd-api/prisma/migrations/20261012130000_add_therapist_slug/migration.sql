-- AlterTable
ALTER TABLE "Therapist" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_slug_key" ON "Therapist"("slug");
