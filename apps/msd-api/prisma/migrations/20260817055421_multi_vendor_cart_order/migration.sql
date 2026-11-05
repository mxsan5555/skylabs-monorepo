-- Multi-vendor cart/order support
-- 1. Drop Cart's single-vendor lock (vendorId/branchId) — CartItem's own deal.vendorId/branchId
--    is now authoritative; a cart may freely hold items from any number of vendors.
-- 2. Give OrderItem its own vendorId/branchId/vendorNameSnapshot/branchNameSnapshot so a
--    multi-vendor checkout can create ONE Order with per-line vendor/branch, while Order's own
--    vendorId/branchId/vendorNameSnapshot/branchNameSnapshot become the "primary vendor" for
--    backward-compatible single-vendor display. Existing OrderItem rows are backfilled from
--    their parent Order — for every pre-existing (necessarily single-vendor) order this is a
--    byte-identical copy, so nothing about any existing order changes.

-- ── Cart: drop single-vendor lock ──────────────────────────────────────────────
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_vendorId_fkey";
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_branchId_fkey";
ALTER TABLE "Cart" DROP COLUMN "vendorId";
ALTER TABLE "Cart" DROP COLUMN "branchId";

-- ── OrderItem: add per-line vendor/branch, nullable first for backfill ─────────
ALTER TABLE "OrderItem" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "branchId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "vendorNameSnapshot" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "branchNameSnapshot" TEXT;

UPDATE "OrderItem" oi
SET "vendorId" = o."vendorId",
    "branchId" = o."branchId",
    "vendorNameSnapshot" = o."vendorNameSnapshot",
    "branchNameSnapshot" = o."branchNameSnapshot"
FROM "Order" o
WHERE oi."orderId" = o.id;

ALTER TABLE "OrderItem" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "vendorNameSnapshot" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "branchNameSnapshot" SET NOT NULL;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OrderItem_vendorId_idx" ON "OrderItem"("vendorId");
