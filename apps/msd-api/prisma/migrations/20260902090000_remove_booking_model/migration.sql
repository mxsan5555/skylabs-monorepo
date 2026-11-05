-- Removes the Booking model entirely — Cart/CartItem and Order/OrderItem alone now represent
-- every purchase (Deal, Product, Therapist), per the "no separate Booking flow" architecture
-- already documented on CartItem/OrderItem in schema.prisma.
--
-- NOTE: this dev DB currently also has AboutPage/AboutPageImage/BlogPost/BlogPostImage/
-- CareerListing/ContactPage tables and a CmsStatus enum that are NOT modeled in this branch's
-- schema.prisma (drift from a concurrent branch/session sharing this dev DB — same class of
-- issue documented in 20260901110000_fix_vendor_offers_flags's own comment). This migration
-- deliberately does NOT touch any of those — only Booking/CartItem/Order changes, which is the
-- actual scope of this change. Reconciling the CMS drift is a separate, unrelated concern.

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_branchId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_customerId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_dealId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_dealPackageId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_therapistId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_therapistPackageId_fkey";
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_vendorId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_bookingId_fkey";
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_dealId_fkey";

-- DropIndex
DROP INDEX "CartItem_cartId_dealId_key";
DROP INDEX "Order_bookingId_key";

-- AlterTable: CartItem now supports a Product line (dealId only), a Service-Deal line
-- (dealId + dealPackageId), or a Therapist line (therapistId + therapistPackageId).
ALTER TABLE "CartItem"
  ADD COLUMN "dealPackageId" TEXT,
  ADD COLUMN "therapistId" TEXT,
  ADD COLUMN "therapistPackageId" TEXT,
  ALTER COLUMN "dealId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "bookingId";

-- DropTable
DROP TABLE "Booking";

-- DropEnum
DROP TYPE "BookingStatus";

-- CreateIndex
CREATE INDEX "CartItem_dealPackageId_idx" ON "CartItem"("dealPackageId");
CREATE INDEX "CartItem_therapistId_idx" ON "CartItem"("therapistId");
CREATE INDEX "CartItem_therapistPackageId_idx" ON "CartItem"("therapistPackageId");
CREATE UNIQUE INDEX "CartItem_cartId_dealId_dealPackageId_therapistId_therapistP_key" ON "CartItem"("cartId", "dealId", "dealPackageId", "therapistId", "therapistPackageId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_dealPackageId_fkey" FOREIGN KEY ("dealPackageId") REFERENCES "DealPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_therapistPackageId_fkey" FOREIGN KEY ("therapistPackageId") REFERENCES "TherapistPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
