-- Therapist becomes an independent, directly browsable/bookable customer-facing entity.
-- See Therapist/Booking/OrderItem/TherapistPackage's own schema doc comments for the full
-- rationale.

-- ── 1. Therapist: split the single `name` into therapistType (service/role label) + personName
--     (actual staff member) — a pure rename for personName (zero data loss, every existing
--     row's value carries over unchanged), a new column with a safe generic backfill default
--     for therapistType (never a fabricated specific guess), and a new nullable gender column
--     (no safe default exists for pre-existing rows). ──────────────────────────────────────────
ALTER TABLE "Therapist" RENAME COLUMN "name" TO "personName";
ALTER TABLE "Therapist" ADD COLUMN "therapistType" TEXT NOT NULL DEFAULT 'Therapist';
ALTER TABLE "Therapist" ADD COLUMN "gender" TEXT;

-- ── 2. Booking: dealId becomes optional — a Therapist may now be booked directly, with no Deal
--     involved at all (exactly one of dealId/therapistId is always set, enforced at the
--     application layer, same discipline as Deal's own "exactly one of serviceId/productId"). ──
ALTER TABLE "Booking" ALTER COLUMN "dealId" DROP NOT NULL;

-- ── 3. OrderItem: same for dealId, plus new therapist/therapistPackage traceability columns
--     mirroring Booking's own pattern, so a Therapist-only order item never needs a fake Deal. ──
ALTER TABLE "OrderItem" ALTER COLUMN "dealId" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "therapistId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "therapistPackageId" TEXT;

CREATE INDEX "OrderItem_therapistId_idx" ON "OrderItem"("therapistId");
CREATE INDEX "OrderItem_therapistPackageId_idx" ON "OrderItem"("therapistPackageId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_therapistPackageId_fkey" FOREIGN KEY ("therapistPackageId") REFERENCES "TherapistPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
