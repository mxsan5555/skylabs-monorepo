-- AlterTable: Driver vendor ownership
ALTER TABLE "Driver" ADD COLUMN     "vendorUserId" TEXT;
CREATE INDEX "Driver_vendorUserId_idx" ON "Driver"("vendorUserId");
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_vendorUserId_fkey" FOREIGN KEY ("vendorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Booking company ownership
ALTER TABLE "Booking" ADD COLUMN     "companyUserId" TEXT;
CREATE INDEX "Booking_companyUserId_idx" ON "Booking"("companyUserId");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: SystemFlag (one-time migration markers)
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);
