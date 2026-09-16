-- Decouple Product purchasing from Deal: Deal becomes a pure service offering (no productId at
-- all); Product becomes a directly-purchasable CartItem/OrderItem line via a new productId FK,
-- mirroring the existing Therapist/TherapistPackage precedent. Order/OrderItem.branchId and
-- branchNameSnapshot become nullable because Product has no branch (vendor-level catalog, not
-- branch-level) — a cart made entirely of Product lines produces an Order with no branch-bearing
-- line to snapshot a "primary branch" from.
--
-- Must run AFTER 20260910091537_archive_legacy_product_deals, which already archived every
-- existing product-deal (status -> INACTIVE) and cleared transient CartItem rows referencing
-- them, so dropping Deal.productId here touches no live/visible data.

-- DropForeignKey
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_productId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_branchId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_branchId_fkey";

-- DropIndex
DROP INDEX "CartItem_cartId_dealId_dealPackageId_therapistId_therapistP_key";

-- DropIndex
DROP INDEX "Deal_productId_idx";

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "Deal" DROP COLUMN "productId";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "branchId" DROP NOT NULL,
ALTER COLUMN "branchNameSnapshot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "branchId" DROP NOT NULL,
ALTER COLUMN "branchNameSnapshot" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_dealId_dealPackageId_therapistId_therapistP_key" ON "CartItem"("cartId", "dealId", "dealPackageId", "therapistId", "therapistPackageId", "productId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
