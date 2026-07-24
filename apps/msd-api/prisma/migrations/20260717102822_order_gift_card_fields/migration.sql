-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftCardAppliedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftCardCode" TEXT;
