-- Deal page rework (docs/msd/PLANNING.md §2.7, DATABASE.md §12.2 S18 to S21, S23, S24; decisions
-- D6, D32 to D35). Expand step only: `policy`, `images` and `approvalStatus` are kept until the
-- contract step. Requires 20261018100000_state_sliders_banners.

-- Trigram search (title and member name). Available on Neon and PostgreSQL 16.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "DealCancellationPolicy" AS ENUM ('FREE_24H', 'FREE_48H', 'NON_REFUNDABLE');

-- Deal: rename `notes` in place so existing text is kept
ALTER TABLE "Deal" RENAME COLUMN "notes" TO "bookingInstructions";

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "bookingRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancellationPolicy" "DealCancellationPolicy" NOT NULL DEFAULT 'FREE_24H',
ADD COLUMN     "eligibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "limitPerCustomer" INTEGER,
ADD COLUMN     "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "validityDays" INTEGER;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "addressLine2" TEXT;

-- AlterTable
ALTER TABLE "DealImage" ADD COLUMN     "altText" TEXT;

-- DealPackage: name, people, inclusions; uniqueness now includes people
DROP INDEX "DealPackage_dealId_durationMinutes_key";
ALTER TABLE "DealPackage" ADD COLUMN     "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "name" TEXT,
ADD COLUMN     "persons" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "DealPackage_dealId_durationMinutes_persons_key" ON "DealPackage"("dealId", "durationMinutes", "persons");

-- CreateTable
CREATE TABLE "DealFaq" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealFaq_dealId_sortOrder_idx" ON "DealFaq"("dealId", "sortOrder");
CREATE INDEX "Deal_title_trgm_idx" ON "Deal" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Vendor_businessName_trgm_idx" ON "Vendor" USING GIN ("businessName" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "DealFaq" ADD CONSTRAINT "DealFaq_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (S23): old free-text policy becomes the cancellation note; live deals count as published
UPDATE "Deal" SET "cancellationNote" = "policy" WHERE "policy" IS NOT NULL AND btrim("policy") <> '';
UPDATE "Deal" SET "publishedAt" = "updatedAt" WHERE "status" = 'ACTIVE';

-- No approval step (D6, P3-15): every deal counts as approved. Rejected deals were already set
-- INACTIVE when rejected, so none goes live by this update.
UPDATE "Deal" SET "approvalStatus" = 'APPROVED', "approvalRejectionReason" = NULL WHERE "approvalStatus" <> 'APPROVED';
