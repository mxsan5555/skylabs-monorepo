-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "assignedVerifierId" TEXT,
ADD COLUMN     "educationDocsNotes" TEXT,
ADD COLUMN     "educationDocsStatus" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN     "healthDocsNotes" TEXT,
ADD COLUMN     "healthDocsStatus" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN     "personalDocsNotes" TEXT,
ADD COLUMN     "personalDocsStatus" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN     "policeDocsNotes" TEXT,
ADD COLUMN     "policeDocsStatus" TEXT NOT NULL DEFAULT 'Pending';

-- CreateIndex
CREATE INDEX "Driver_assignedVerifierId_idx" ON "Driver"("assignedVerifierId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_assignedVerifierId_fkey" FOREIGN KEY ("assignedVerifierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
