-- Rename vendor-specific ownership fields to generic staff "created by" ownership, now
-- reused by Vendor/Sales/Data Operator (Driver) and Company/Sales (Booking) — see
-- `applyRoleBaselineOnce`/`driverOwnerScope`/`bookingOwnerScope`.

ALTER TABLE "Driver" DROP CONSTRAINT "Driver_vendorUserId_fkey";
ALTER TABLE "Driver" RENAME COLUMN "vendorUserId" TO "createdByUserId";
ALTER INDEX "Driver_vendorUserId_idx" RENAME TO "Driver_createdByUserId_idx";
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking" DROP CONSTRAINT "Booking_companyUserId_fkey";
ALTER TABLE "Booking" RENAME COLUMN "companyUserId" TO "createdByUserId";
ALTER INDEX "Booking_companyUserId_idx" RENAME TO "Booking_createdByUserId_idx";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
