ALTER TABLE "Driver" ADD COLUMN "creationRequestId" TEXT;
CREATE UNIQUE INDEX "Driver_creationRequestId_key" ON "Driver"("creationRequestId");
