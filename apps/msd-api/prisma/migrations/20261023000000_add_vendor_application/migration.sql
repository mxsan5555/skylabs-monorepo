-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "VendorApplication" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,
    "businessPhone" TEXT NOT NULL,
    "ownerFirstName" TEXT NOT NULL,
    "ownerLastName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerMobile" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorApplication_status_idx"
    ON "VendorApplication"("status");

-- CreateIndex
CREATE INDEX "VendorApplication_createdAt_idx"
    ON "VendorApplication"("createdAt");

-- CreateIndex
CREATE INDEX "VendorApplication_ownerEmail_idx"
    ON "VendorApplication"("ownerEmail");

-- CreateIndex
CREATE INDEX "VendorApplication_ownerMobile_idx"
    ON "VendorApplication"("ownerMobile");

-- CreateIndex
CREATE INDEX "VendorApplication_businessEmail_idx"
    ON "VendorApplication"("businessEmail");
