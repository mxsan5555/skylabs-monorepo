/*
  Warnings:

  - You are about to drop the column `endedAt` on the `ImpersonationSession` table. All the data in the column will be lost.
  - You are about to drop the column `deviceInfo` on the `RefreshSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ImpersonationSession" DROP COLUMN IF EXISTS "endedAt";

-- AlterTable
ALTER TABLE "RefreshSession" DROP COLUMN IF EXISTS "deviceInfo";
