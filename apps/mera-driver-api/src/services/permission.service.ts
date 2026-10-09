import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { allPermissionKeysForMenu } from '@skylabs-monorepo/shared-permissions';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

/** Role-only catalogue resolution is cached. Protected requests always resolve live
 * membership, saved actions and explicit overrides, independently of this cache. */

import { isPortalRole } from './portal-context';

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
  roleKeys = roleKeys.filter(key => !isPortalRole(key));
  if (roleKeys.length === 0) return [];

  const key = cacheKeyFor(roleKeys);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const roles = await prisma.role.findMany({
    where: { key: { in: [...roleKeys] }, isActive: true },
    select: { isSuperAdmin: true },
  });
  const isSuperAdmin = (roles ?? []).some((r) => r.isSuperAdmin);

  let permissions: string[];
  if (isSuperAdmin) {
    permissions = allPermissionKeysForMenu(getMenuForApp('mera-driver'));
  } else {
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
    permissions = [...new Set(rolePermissions.map((rp) => rp.permission.key))];
  }

  cache.set(key, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

/** Test/dev helper — clears the in-memory permission cache immediately after a role/permission mutation. */
export function invalidatePermissionCache(): void {
  cache.clear();
}

/** Live role grants plus explicit user grants/revokes. Super Admin remains protected. */
export async function resolveEffectivePermissionsForUser(userId: string, roleKeys: readonly string[], onCurrentRoles?: (keys: string[]) => void): Promise<string[]> {
  // Portal sessions never inherit staff management authority. Staff membership is live,
  // so old access tokens observe both grants and revocations on the next request.
  if (roleKeys.length && !roleKeys.some(key => !isPortalRole(key))) return [];
  const membership = { isActive: true, key: { notIn: ['driver', 'customer'] },
    users: { some: { userId, user: { status: 'active' as const, deletedAt: null } } } };
  const roles = (await prisma.role.findMany({ where: membership, select: { isSuperAdmin: true, key: true } })) ?? [];
  onCurrentRoles?.(roles.map(role => role.key));
  if (roles.some(role => role.isSuperAdmin)) return allPermissionKeysForMenu(getMenuForApp('mera-driver'));
  // Do not read the role-set cache here: it cannot cover another API worker's commits.
  const links = (await prisma.rolePermission.findMany({ where: { role: {...membership, key: { ...membership.key, in: roles.map(role => role.key) }} },
    select: { permission: { select: { key: true } } } })) ?? [];
  const overrides = (await prisma.userPermissionOverride.findMany({ where: { userId },
    include: { permission: { select: { key: true } } } })) ?? [];
  const revokes = new Set(overrides.filter(o => o.effect === 'revoke').map(o => o.permission.key));
  // Existing direct allows are legitimate effective grants. Surface conflicts to admins
  // through bootstrap/user inspection instead of silently discarding historical rows.
  const permissions = new Set([...links.map(link => link.permission.key),
    ...overrides.filter(o => o.effect === 'grant' && roles.length > 0).map(o => o.permission.key)]);
  return [...permissions].filter(key => !revokes.has(key));
}

/** Resolves a user's roles, then their effective (role + override) permission set. */
export async function getEffectivePermissionsForUserId(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({ where: { userId }, select: { role: { select: { key: true } } } });
  const roleKeys = userRoles.map((ur) => ur.role.key);
  return resolveEffectivePermissionsForUser(userId, roleKeys);
}

/** The user's current override rows, split into grant/revoke `Permission.id` lists —
 *  used to pre-check the override editor UI before the caller edits and re-saves. */
export async function getUserPermissionOverrides(userId: string): Promise<{ grants: string[]; revokes: string[] }> {
  const overrides = await prisma.userPermissionOverride.findMany({ where: { userId } });
  return {
    grants: overrides.filter((o) => o.effect === 'grant').map((o) => o.permissionId),
    revokes: overrides.filter((o) => o.effect === 'revoke').map((o) => o.permissionId),
  };
}

/** Historical records remain readable for audit; all new per-user overrides are retired. */
export async function setUserPermissionOverrides(
  _userId: string,
  _grants: string[],
  _revokes: string[],
): Promise<{ grants: string[]; revokes: string[] }> {
  throw new HttpError(410,'ROLE_ONLY_ACCESS','Per-user permission overrides are retired. Use authorized role assignments. Historical restrictions remain until reviewed.');
}
