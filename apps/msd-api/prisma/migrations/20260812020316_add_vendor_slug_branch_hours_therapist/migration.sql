-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "therapistId" TEXT;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "openingHours" JSONB;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialization" TEXT,
    "bio" TEXT,
    "experienceYears" INTEGER,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Therapist_vendorId_idx" ON "Therapist"("vendorId");

-- CreateIndex
CREATE INDEX "Therapist_branchId_idx" ON "Therapist"("branchId");

-- CreateIndex
CREATE INDEX "Booking_therapistId_idx" ON "Booking"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

