import { prisma } from '../lib/prisma';

/**
 * Resolves the flat set of `${menuKey}:${action}` permission keys granted across a set of
 * role keys, by joining Role -> RolePermission -> Permission in the DB.
 *
 * There is deliberately no hardcoded role-name shortcut anywhere in this file (or anywhere
 * else in the app) — every grant decision is data-driven from the RolePermission table. The
 * only role field with baked-in meaning is `Role.isSuperAdmin`, and that flag is consulted
 * solely by the seed script (to auto-grant every Permission) and by the impersonation route
 * (to decide who may "Login As" another user) — never via a `role.key === 'super_admin'` check.
 *
 * Results are cached in-memory, keyed by the sorted role-key set, for a short TTL. This is a
 * v1 cache: no invalidation machinery. A role/permission edit is visible to already-cached
 * callers for at most CACHE_TTL_MS.
 */

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  permissions: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKeyFor(roleKeys: readonly string[]): string {
  return [...roleKeys].sort().join('|');
}

export async function resolvePermissionsForRoles(roleKeys: readonly string[]): Promise<string[]> {
  if (roleKeys.length === 0) return [];

  const key = cacheKeyFor(roleKeys);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: {
      role: {
        key: { in: [...roleKeys] },
        isActive: true,
      },
    },
    select: {
      permission: { select: { key: true } },
    },
  });

  const permissions = [...new Set(rolePermissions.map((rp) => rp.permission.key))];

  cache.set(key, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

/** Test/dev helper — clears the in-memory permission cache immediately after a role/permission mutation. */
export function invalidatePermissionCache(): void {
  cache.clear();
}
