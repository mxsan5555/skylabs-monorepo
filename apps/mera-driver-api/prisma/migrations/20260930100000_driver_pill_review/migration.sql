ALTER TABLE "Driver" ADD COLUMN "city" TEXT, ADD COLUMN "accountPaymentMethod" TEXT;
CREATE TABLE "DriverKycCheck" (
  "id" TEXT NOT NULL, "driverId" TEXT NOT NULL, "itemKey" TEXT NOT NULL,
  "status" TEXT NOT NULL, "reason" TEXT, "valueHash" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL, "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverKycCheck_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverKycCheck_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DriverKycCheck_driverId_itemKey_key" ON "DriverKycCheck"("driverId", "itemKey");
CREATE TABLE "DriverKycDecision" (
  "id" TEXT NOT NULL, "driverId" TEXT NOT NULL, "itemKey" TEXT NOT NULL,
  "status" TEXT NOT NULL, "reason" TEXT, "valueHash" TEXT NOT NULL,
  "submittedValue" JSONB NOT NULL, "reviewerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverKycDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverKycDecision_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DriverKycDecision_driverId_createdAt_idx" ON "DriverKycDecision"("driverId", "createdAt");
