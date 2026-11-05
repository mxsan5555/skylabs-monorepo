-- Deal gains a real child package table (mirrors TherapistPackage's current shape exactly) —
-- see DealPackage's own schema doc comment for the full rationale. Purely additive/structural;
-- the data backfill (one DealPackage per existing service Deal, with FK-safe sibling-group
-- consolidation if any exist) is a separate script run after this migration is applied.

-- CreateTable
CREATE TABLE "DealPackage" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "sellingPrice" DECIMAL(10,2) NOT NULL,
    "originalPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealPackage_dealId_idx" ON "DealPackage"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DealPackage_dealId_durationMinutes_key" ON "DealPackage"("dealId", "durationMinutes");

-- AddForeignKey
ALTER TABLE "DealPackage" ADD CONSTRAINT "DealPackage_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Booking gains dealPackageId (traceability only, same discipline as therapistPackageId)
ALTER TABLE "Booking" ADD COLUMN "dealPackageId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_dealPackageId_idx" ON "Booking"("dealPackageId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_dealPackageId_fkey" FOREIGN KEY ("dealPackageId") REFERENCES "DealPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: OrderItem gains dealPackageId (same traceability discipline)
ALTER TABLE "OrderItem" ADD COLUMN "dealPackageId" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_dealPackageId_idx" ON "OrderItem"("dealPackageId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dealPackageId_fkey" FOREIGN KEY ("dealPackageId") REFERENCES "DealPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
