-- Consolidate a stray duplicate `vendor`-keyed Role row back onto the canonical `member` row.
--
-- `20261015100000_member_lifecycle` renamed the original Role{key:'vendor'} row to key='member'
-- in place (UPDATE, same id, keeping every UserRole/RolePermission link). A leftover duplicate
-- entry in prisma/seed.ts's ROLES array then re-created a brand-new, empty Role{key:'vendor'}
-- row on every later seed run, and prisma/permission-matrix.ts's applyPermissionMatrix/resetGrant
-- kept granting the real member permissions (vendor-portal.*, settings, vendors:custom) to THAT
-- phantom row instead of to 'member' — so any Member account created after the rename migration
-- ran (which is assigned role key 'member' by vendor.service.ts) got zero permissions.
--
-- This migration is additive/merge-only and idempotent: a no-op if no 'vendor' role row exists.
-- 1. Point any UserRole currently on 'vendor' at 'member' instead (ON CONFLICT DO NOTHING covers
--    a user who already somehow holds both).
-- 2. Copy any RolePermission unique to 'vendor' onto 'member' (ON CONFLICT DO NOTHING).
-- 3. Delete the phantom 'vendor' Role row — cascades its now-redundant UserRole/RolePermission
--    rows, which is safe because step 1/2 already preserved everything of value.

DO $$
DECLARE
  vendor_role_id TEXT;
  member_role_id TEXT;
BEGIN
  SELECT id INTO vendor_role_id FROM "Role" WHERE "key" = 'vendor';
  SELECT id INTO member_role_id FROM "Role" WHERE "key" = 'member';

  IF vendor_role_id IS NOT NULL AND member_role_id IS NOT NULL THEN
    INSERT INTO "UserRole" ("userId", "roleId", "createdAt")
    SELECT ur."userId", member_role_id, ur."createdAt"
    FROM "UserRole" ur
    WHERE ur."roleId" = vendor_role_id
    ON CONFLICT ("userId", "roleId") DO NOTHING;

    INSERT INTO "RolePermission" ("roleId", "permissionId", "scope", "createdAt")
    SELECT member_role_id, rp."permissionId", rp."scope", rp."createdAt"
    FROM "RolePermission" rp
    WHERE rp."roleId" = vendor_role_id
    ON CONFLICT ("roleId", "permissionId") DO NOTHING;

    DELETE FROM "Role" WHERE "id" = vendor_role_id;
  END IF;
END $$;
