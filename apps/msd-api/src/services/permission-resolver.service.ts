import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { allPermissionKeysForMenu } from '@skylabs-monorepo/shared-permissions';
import { prisma } from '../lib/prisma';

interface CacheEntry {
  expiresAt: number;
  permissionKeys: string[];
}

/**
 * Resolves the flat list of granted `${menuKey}:${action}` permission keys for a set of
 * role keys, joining UserRole → RolePermission → Permission. Short-TTL in-memory cache
 * keyed by the sorted role-key set — no invalidation machinery for v1 (per spec); a role's
 * permission changes simply take up to CACHE_TTL_MS to be reflected for already-issued tokens.
 *
 * A role flagged `isSuperAdmin` is a hard exception to the above: it always resolves to every
 * permission key derivable from the live `shared-menu` tree, regardless of what's actually in
 * `RolePermission` for it. This keeps SuperAdmin's access independent of the permission matrix
 * UI — unchecking/saving boxes for that role (or a brand-new menu node never having been
 * seeded/granted) can never reduce or lag behind its access. See CLAUDE.md's SuperAdmin rules.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKeyFor(roleKeys: readonly string[]): string {
  return [...roleKeys].sort().join('|');
}

/**
 * The User Management permission matrix caps a SuperAdmin to View-only on these resources —
 * explicitly, even for SuperAdmin ("Orders stays View-only even for Super Admin" is the matrix's
 * own example) — despite the blanket "every permission" bypass below. Mirrored (display-only) in
 * `prisma/seed.ts`'s `grantAllPermissionsToSuperAdmins`.
 */
const SUPER_ADMIN_VIEW_ONLY_MENU_KEYS = ['orders', 'reports', 'payments'];
/** System Settings is capped to View+Edit for SuperAdmin (matrix: "VE") — no create/delete
 *  concept for it anyway (singleton config), but excluded explicitly for clarity. */
const SUPER_ADMIN_VIEW_EDIT_ONLY_MENU_KEYS = ['system-settings'];
/** Customers is View+Create for SuperAdmin (matrix: "VC") — the explicit "Super Admin can add
 *  customers" requirement, still capped short of Edit/Delete/status_change. */
const SUPER_ADMIN_VIEW_CREATE_ONLY_MENU_KEYS = ['customers'];

function applySuperAdminMatrixCaps(permissionKeys: string[]): string[] {
  return permissionKeys.filter((key) => {
    const splitAt = key.lastIndexOf(':');
    const menuKey = key.slice(0, splitAt);
    const action = key.slice(splitAt + 1);
    if (SUPER_ADMIN_VIEW_ONLY_MENU_KEYS.includes(menuKey)) return action === 'view';
    if (SUPER_ADMIN_VIEW_EDIT_ONLY_MENU_KEYS.includes(menuKey)) return action === 'view' || action === 'edit';
    if (SUPER_ADMIN_VIEW_CREATE_ONLY_MENU_KEYS.includes(menuKey)) return action === 'view' || action === 'create';
    return true;
  });
}

export async function resolveGrantedPermissionKeys(roleKeys: readonly string[]): Promise<string[]> {
  if (roleKeys.length === 0) return [];

  const key = cacheKeyFor(roleKeys);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.permissionKeys;
  }

  const roles = await prisma.role.findMany({
    where: { key: { in: [...roleKeys] }, isActive: true },
    select: { isSuperAdmin: true },
  });
  const isSuperAdmin = (roles ?? []).some((r) => r.isSuperAdmin);

  let permissionKeys: string[];
  if (isSuperAdmin) {
    // Every permission derivable from the live menu tree, EXCEPT `vendor-portal.*` — those menu
    // keys only make sense for an actual Vendor owner (the self-service "My Business" surface,
    // scoped to the caller's own Vendor row), which a SuperAdmin never has. Without this
    // exclusion the vendor-portal Branches/Deals/Customers/Therapists sidebar nodes would appear
    // for every SuperAdmin alongside the admin-wide equivalents (same-looking titles) and 404 or
    // render empty since the SuperAdmin owns no Vendor. Mirrors the same exclusion applied to the
    // super_admin role's seeded RolePermission rows in prisma/seed.ts's
    // grantAllPermissionsToSuperAdmins — kept in sync for what the Role Permission Matrix editor
    // displays, even though THIS branch (not that table) is what actually governs a SuperAdmin's
    // live-resolved permissions/bootstrap menu.
    permissionKeys = applySuperAdminMatrixCaps(
      allPermissionKeysForMenu(getMenuForApp('msd')).filter((key) => !key.startsWith('vendor-portal.')),
    );
  } else {
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role: { key: { in: [...roleKeys] }, isActive: true },
      },
      select: { permission: { select: { key: true } } },
    });
    permissionKeys = [...new Set(rolePermissions.map((rp) => rp.permission.key))];
  }

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, permissionKeys });
  return permissionKeys;
}

/** Escape hatch for tests / immediately after a permission change if you don't want to wait out the TTL. */
export function invalidatePermissionCache(): void {
  cache.clear();
}

/** Is any role in this set flagged `isSuperAdmin`? Resolved from the live `Role` table, never a
 *  role-key string compare (same discipline as `resolveGrantedPermissionKeys` above) — used for
 *  the handful of checks that are genuinely about the SuperAdmin flag itself (e.g. "can see
 *  every user's login history"), not an ordinary menu/action permission. */
export async function isSuperAdminRoleSet(roleKeys: readonly string[]): Promise<boolean> {
  if (roleKeys.length === 0) return false;
  const roles = await prisma.role.findMany({ where: { key: { in: [...roleKeys] }, isActive: true }, select: { isSuperAdmin: true } });
  return roles.some((r) => r.isSuperAdmin);
}
