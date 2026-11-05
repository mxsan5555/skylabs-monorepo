-- This migration was an accidental rollback of a required field and must be treated as a no-op.
-- The `User.roleConflict` column is still used by the RBAC sync logic.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleConflict" BOOLEAN NOT NULL DEFAULT false;
