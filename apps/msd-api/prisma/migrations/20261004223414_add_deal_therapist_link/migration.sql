-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_dealId_fkey";

-- CreateTable
CREATE TABLE "DealTherapist" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealTherapist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealTherapist_dealId_idx" ON "DealTherapist"("dealId");

-- CreateIndex
CREATE INDEX "DealTherapist_therapistId_idx" ON "DealTherapist"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "DealTherapist_dealId_therapistId_key" ON "DealTherapist"("dealId", "therapistId");

-- AddForeignKey
ALTER TABLE "DealTherapist" ADD CONSTRAINT "DealTherapist_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealTherapist" ADD CONSTRAINT "DealTherapist_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BranchSubcategoryAccess_branchCategoryAccessId_subcategoryId_uq" RENAME TO "BranchSubcategoryAccess_branchCategoryAccessId_subcategoryI_key";
