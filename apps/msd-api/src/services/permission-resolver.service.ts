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
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKeyFor(roleKeys: readonly string[]): string {
  return [...roleKeys].sort().join('|');
}

export async function resolveGrantedPermissionKeys(roleKeys: readonly string[]): Promise<string[]> {
  if (roleKeys.length === 0) return [];

  const key = cacheKeyFor(roleKeys);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.permissionKeys;
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: {
      role: { key: { in: [...roleKeys] }, isActive: true },
    },
    select: { permission: { select: { key: true } } },
  });

  const permissionKeys = [...new Set(rolePermissions.map((rp) => rp.permission.key))];
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, permissionKeys });
  return permissionKeys;
}

/** Escape hatch for tests / immediately after a permission change if you don't want to wait out the TTL. */
export function invalidatePermissionCache(): void {
  cache.clear();
}
