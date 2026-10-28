import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { allPermissionKeysForMenu } from '@skylabs-monorepo/shared-permissions';
import type { PermissionScope } from '@skylabs-monorepo/shared-types';
import { prisma } from '../lib/prisma';

export interface ResolvedPermissions {
  keys: string[];
  /** Highest-scope-wins across every role the caller holds (`ALL` beats `OWN`). Only ever
   *  contains entries for keys that actually came back from `RolePermission` — SuperAdmin's
   *  hard-bypass branch below never populates this (it has no RolePermission rows to read scope
   *  from), so `scopeFor()`'s "absent key -> ALL" default is what governs SuperAdmin, correctly. */
  scopes: Record<string, PermissionScope>;
}

interface CacheEntry {
  expiresAt: number;
  resolved: ResolvedPermissions;
}

function higherScope(a: PermissionScope, b: PermissionScope): PermissionScope {
  return a === 'ALL' || b === 'ALL' ? 'ALL' : 'OWN';
}

/**
 * Resolves the flat list of granted `${menuKey}:${action}` permission keys for a set of
 * role keys, joining UserRole → RolePermission → Permission. Short-TTL in-memory cache keyed
 * by the sorted role-key set, cleared by `invalidatePermissionCache()` on every mutation that
 * can change what a role-key combination resolves to (role delete, role status change, and
 * saving a role's permissions — see the call sites in `rbac.routes.ts`) — so the cache never
 * backstops staleness past the request that changed it; CACHE_TTL_MS is just an upper bound for
 * the rare case the cache is cleared by something outside those three call sites. Reassigning a
 * USER's role never needs its own invalidation call: the cache key is the role-key set, not a
 * user id, and bootstrap always re-reads a user's current roles fresh before resolving.
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

export async function resolveGrantedPermissions(roleKeys: readonly string[]): Promise<ResolvedPermissions> {
  if (roleKeys.length === 0) return { keys: [], scopes: {} };

  const key = cacheKeyFor(roleKeys);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.resolved;
  }

  const roles = await prisma.role.findMany({
    where: { key: { in: [...roleKeys] }, isActive: true },
    select: { isSuperAdmin: true },
  });
  const isSuperAdmin = (roles ?? []).some((r) => r.isSuperAdmin);

  let resolved: ResolvedPermissions;
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
    resolved = {
      keys: applySuperAdminMatrixCaps(
        allPermissionKeysForMenu(getMenuForApp('msd')).filter((key) => !key.startsWith('vendor-portal.')),
      ),
      // No RolePermission rows are read for SuperAdmin, so there is nothing to report a scope
      // for — `scopeFor()` defaults an absent key to `ALL`, which is exactly SuperAdmin's access.
      scopes: {},
    };
  } else {
    const rolePermissions = await prisma.rolePermission.findMany({
      where: {
        role: { key: { in: [...roleKeys] }, isActive: true },
      },
      select: { scope: true, permission: { select: { key: true } } },
    });
    const keys = [...new Set(rolePermissions.map((rp) => rp.permission.key))];
    const scopes: Record<string, PermissionScope> = {};
    for (const rp of rolePermissions) {
      const existing = scopes[rp.permission.key];
      scopes[rp.permission.key] = existing ? higherScope(existing, rp.scope) : rp.scope;
    }
    resolved = { keys, scopes };
  }

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, resolved });
  return resolved;
}

/** Thin wrapper for the many callers that only need the boolean grant check, not scope. */
export async function resolveGrantedPermissionKeys(roleKeys: readonly string[]): Promise<string[]> {
  return (await resolveGrantedPermissions(roleKeys)).keys;
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
