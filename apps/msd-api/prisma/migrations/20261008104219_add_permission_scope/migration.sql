-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('ALL', 'OWN');

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN     "scope" "PermissionScope" NOT NULL DEFAULT 'ALL';

-- CreateIndex
CREATE INDEX "RolePermission_scope_idx" ON "RolePermission"("scope");
