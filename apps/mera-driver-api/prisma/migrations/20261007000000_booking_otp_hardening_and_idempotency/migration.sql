-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_clientRequestId_key" ON "Booking"("clientRequestId");
