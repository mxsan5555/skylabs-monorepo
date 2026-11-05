-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'COD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingPincode" TEXT,
ADD COLUMN     "shippingState" TEXT;
