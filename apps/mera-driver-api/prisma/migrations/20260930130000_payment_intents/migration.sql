-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "driverId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerOrderId_key" ON "PaymentIntent"("providerOrderId");

-- CreateIndex
CREATE INDEX "PaymentIntent_bookingId_status_idx" ON "PaymentIntent"("bookingId", "status");

-- CreateIndex
CREATE INDEX "PaymentIntent_driverId_status_idx" ON "PaymentIntent"("driverId", "status");
