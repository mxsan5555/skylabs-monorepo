-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "accountStatus" TEXT NOT NULL DEFAULT 'Active';

-- CreateIndex
CREATE INDEX "Driver_accountStatus_idx" ON "Driver"("accountStatus");
