-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
