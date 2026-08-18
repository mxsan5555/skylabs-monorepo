-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "therapistPackageId" TEXT;

-- CreateTable
CREATE TABLE "TherapistPackage" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "sellingPrice" DECIMAL(10,2) NOT NULL,
    "originalPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapistPackage_dealId_idx" ON "TherapistPackage"("dealId");

-- CreateIndex
CREATE INDEX "TherapistPackage_therapistId_idx" ON "TherapistPackage"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistPackage_dealId_therapistId_key" ON "TherapistPackage"("dealId", "therapistId");

-- CreateIndex
CREATE INDEX "Booking_therapistPackageId_idx" ON "Booking"("therapistPackageId");

-- AddForeignKey
ALTER TABLE "TherapistPackage" ADD CONSTRAINT "TherapistPackage_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistPackage" ADD CONSTRAINT "TherapistPackage_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_therapistPackageId_fkey" FOREIGN KEY ("therapistPackageId") REFERENCES "TherapistPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
