-- Tracks accounts whose legacy multi-role assignment requires an administrator to resolve.
-- Existing accounts are not flagged by default; the role migration explicitly marks conflicts.
-- This migration is idempotent because an earlier local migration may already have created the column.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "roleConflict" BOOLEAN NOT NULL DEFAULT false;
