-- TherapistPackage becomes independent of Deal: durationMinutes moves onto TherapistPackage
-- itself (backfilled from the currently-linked Deal), unique(therapistId, durationMinutes)
-- replaces unique(dealId, therapistId). See TherapistPackage's schema doc comment.

-- ── 1. Add durationMinutes, nullable first for backfill ─────────────────────────
ALTER TABLE "TherapistPackage" ADD COLUMN "durationMinutes" INTEGER;

-- ── 2. Backfill from the Deal each row currently points at ──────────────────────
UPDATE "TherapistPackage" tp
SET "durationMinutes" = d."durationMinutes"
FROM "Deal" d
WHERE tp."dealId" = d.id;

-- ── 3. Dedupe: unique(dealId, therapistId) never guaranteed unique(therapistId,
--     durationMinutes) — e.g. one therapist priced on two different Deals that happen to
--     share a duration. Keep the most-recently-created row per (therapistId, durationMinutes),
--     drop the rest (nothing production-critical: TherapistPackage rows are only ever
--     referenced by id, snapshotted immutably into Booking.priceSnapshot at booking time).
DELETE FROM "TherapistPackage" a
USING "TherapistPackage" b
WHERE a."therapistId" = b."therapistId"
  AND a."durationMinutes" = b."durationMinutes"
  AND a."createdAt" < b."createdAt";

-- ── 4. Now safe to require it ────────────────────────────────────────────────────
ALTER TABLE "TherapistPackage" ALTER COLUMN "durationMinutes" SET NOT NULL;

-- ── 5. Drop the old Deal relationship ─────────────────────────────────────────────
ALTER TABLE "TherapistPackage" DROP CONSTRAINT "TherapistPackage_dealId_fkey";
DROP INDEX "TherapistPackage_dealId_idx";
DROP INDEX "TherapistPackage_dealId_therapistId_key";
ALTER TABLE "TherapistPackage" DROP COLUMN "dealId";

-- ── 6. New uniqueness: one active-or-not package per therapist per duration ──────
CREATE UNIQUE INDEX "TherapistPackage_therapistId_durationMinutes_key" ON "TherapistPackage"("therapistId", "durationMinutes");
