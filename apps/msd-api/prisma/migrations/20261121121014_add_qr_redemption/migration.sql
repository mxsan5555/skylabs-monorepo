-- AlterTable
ALTER TABLE "PurchaseEntitlement" ADD COLUMN     "qrExpiresAt" TIMESTAMP(3),
ADD COLUMN     "redeemedByUserId" TEXT;
