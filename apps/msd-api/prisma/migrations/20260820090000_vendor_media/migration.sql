-- Vendor gains the same media-upload tables Deal/Product/Therapist already have — one image
-- table + one video table, real FKs, mirroring DealImage/DealVideo's exact shape (see
-- VendorImage's schema doc comment). Purely additive/structural; legacy Vendor.logoUrl stays
-- populated and untouched. A separate throwaway script backfills any existing logoUrl.

-- CreateTable
CREATE TABLE "VendorImage" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorImage_vendorId_idx" ON "VendorImage"("vendorId");

-- CreateIndex: at most one primary image per Vendor, enforced at the DB level.
CREATE UNIQUE INDEX "VendorImage_vendorId_primary_key" ON "VendorImage"("vendorId") WHERE "isPrimary" = true;

-- AddForeignKey
ALTER TABLE "VendorImage" ADD CONSTRAINT "VendorImage_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "VendorVideo" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorVideo_vendorId_key" ON "VendorVideo"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorVideo" ADD CONSTRAINT "VendorVideo_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
