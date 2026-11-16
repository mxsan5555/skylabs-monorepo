-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "city" TEXT,
ADD COLUMN     "commissionBps" INTEGER,
ADD COLUMN     "commissionPaise" INTEGER,
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "driverSharePaise" INTEGER,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "farePaise" INTEGER,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "requiredSkill" TEXT,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "registrationFeePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "registrationFeeRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DriverDocument" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TripOffer" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "TripOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyMovement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookingId" TEXT,
    "driverId" TEXT,
    "kind" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripOffer_driverId_status_idx" ON "TripOffer"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TripOffer_bookingId_driverId_key" ON "TripOffer"("bookingId", "driverId");

-- CreateIndex
CREATE INDEX "TripEvent_bookingId_createdAt_idx" ON "TripEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_reference_key" ON "MoneyMovement"("reference");

-- CreateIndex
CREATE INDEX "MoneyMovement_bookingId_kind_idx" ON "MoneyMovement"("bookingId", "kind");

-- CreateIndex
CREATE INDEX "MoneyMovement_driverId_kind_idx" ON "MoneyMovement"("driverId", "kind");

-- CreateIndex
CREATE INDEX "MoneyMovement_createdAt_idx" ON "MoneyMovement"("createdAt");

-- CreateIndex
CREATE INDEX "PortalMessage_userId_kind_createdAt_idx" ON "PortalMessage"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_driverId_startsAt_endsAt_idx" ON "Booking"("driverId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripOffer" ADD CONSTRAINT "TripOffer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripOffer" ADD CONSTRAINT "TripOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

