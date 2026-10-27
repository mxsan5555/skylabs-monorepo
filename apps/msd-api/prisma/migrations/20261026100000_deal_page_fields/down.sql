-- Manual rollback of 20261026100000_deal_page_fields. The approval backfill is not reversed:
-- the previous PENDING / REJECTED values are not kept (rejected deals stay INACTIVE).
-- Packages that differ only by people would break the old unique key: keep the 1-person one.
DELETE FROM "DealPackage" p USING "DealPackage" q
 WHERE p."dealId" = q."dealId" AND p."durationMinutes" = q."durationMinutes" AND p."persons" > q."persons";

ALTER TABLE "DealFaq" DROP CONSTRAINT "DealFaq_dealId_fkey";
DROP TABLE "DealFaq";

DROP INDEX "Vendor_businessName_trgm_idx";
DROP INDEX "Deal_title_trgm_idx";

DROP INDEX "DealPackage_dealId_durationMinutes_persons_key";
ALTER TABLE "DealPackage" DROP COLUMN "inclusions", DROP COLUMN "name", DROP COLUMN "persons";
CREATE UNIQUE INDEX "DealPackage_dealId_durationMinutes_key" ON "DealPackage"("dealId", "durationMinutes");

ALTER TABLE "DealImage" DROP COLUMN "altText";
ALTER TABLE "Branch" DROP COLUMN "addressLine2";

ALTER TABLE "Deal" DROP COLUMN "bookingRequired",
DROP COLUMN "cancellationNote",
DROP COLUMN "cancellationPolicy",
DROP COLUMN "eligibility",
DROP COLUMN "highlights",
DROP COLUMN "limitPerCustomer",
DROP COLUMN "previousSlugs",
DROP COLUMN "publishedAt",
DROP COLUMN "validityDays";
ALTER TABLE "Deal" RENAME COLUMN "bookingInstructions" TO "notes";

DROP TYPE "DealCancellationPolicy";
-- pg_trgm is left installed (other objects may use it).
