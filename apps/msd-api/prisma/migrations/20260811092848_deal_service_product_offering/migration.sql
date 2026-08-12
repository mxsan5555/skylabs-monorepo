-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "serviceId" TEXT;

-- CreateIndex
CREATE INDEX "Deal_serviceId_idx" ON "Deal"("serviceId");

-- CreateIndex
CREATE INDEX "Deal_productId_idx" ON "Deal"("productId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
