-- This migration merges a duplicate role row (vendor -> member); the merge is intentionally
-- one-way and cannot be meaningfully un-merged (which grants/links originated from which of the
-- two rows is no longer recoverable). This down.sql only restores the schema-level starting
-- point by recreating an empty 'vendor' Role row, matching the shape seed.ts's old stray entry
-- used to produce, with no grants or UserRole links.

INSERT INTO "Role" ("id", "key", "name", "description", "isSystem", "isSuperAdmin", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'vendor', 'Member', 'External business owner/manager account.', true, false, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "key" = 'vendor');
