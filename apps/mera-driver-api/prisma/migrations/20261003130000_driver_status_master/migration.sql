ALTER TABLE "Driver" ADD COLUMN "driverStatusMasterId" TEXT;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_driverStatusMasterId_fkey" FOREIGN KEY ("driverStatusMasterId") REFERENCES "MasterListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
