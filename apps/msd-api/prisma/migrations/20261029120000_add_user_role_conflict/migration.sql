-- Tracks accounts whose legacy multi-role assignment requires an administrator to resolve.
-- Existing accounts are not flagged by default; the role migration explicitly marks conflicts.
ALTER TABLE "User"
ADD COLUMN "roleConflict" BOOLEAN NOT NULL DEFAULT false;
