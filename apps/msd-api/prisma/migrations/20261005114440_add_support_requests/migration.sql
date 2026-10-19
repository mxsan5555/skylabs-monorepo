-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_dealId_fkey";

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportRequest_customerId_idx" ON "SupportRequest"("customerId");

-- CreateIndex
CREATE INDEX "SupportRequest_createdAt_idx" ON "SupportRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex (guarded: already renamed by 20261004223414_add_deal_therapist_link on some
-- environments — see that migration's own comment for why this isn't idempotent as a plain rename)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'BranchSubcategoryAccess_branchCategoryAccessId_subcategoryId_uq'
  ) THEN
    ALTER INDEX "BranchSubcategoryAccess_branchCategoryAccessId_subcategoryId_uq" RENAME TO "BranchSubcategoryAccess_branchCategoryAccessId_subcategoryI_key";
  END IF;
END $$;
