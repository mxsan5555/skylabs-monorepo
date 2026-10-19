/*
  Warnings:

  - A unique constraint covering the columns `[customerId,productId]` on the table `WishlistItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "WishlistItem" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "dealId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_customerId_productId_key" ON "WishlistItem"("customerId", "productId");

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
