import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { allPermissionKeysForMenu } from '@skylabs-monorepo/shared-permissions';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

/**
 * Resolves the flat set of `${menuKey}:${action}` permission keys granted across a set of
 * role keys, by joining Role -> RolePermission -> Permission in the DB.
 *
 * There is deliberately no hardcoded role-name shortcut anywhere in this file (or anywhere
 * else in the app) — every grant decision is data-driven from the RolePermission table. The
 * only role field with baked-in meaning is `Role.isSuperAdmin`: the seed script uses it to
 * auto-grant every Permission, the impersonation route uses it to decide who may "Login As"
 * another user, and — as of the SuperAdmin-protection fix below — this resolver uses it to
 * always return every permission key derivable from the live `shared-menu` tree for such a
 * role, regardless of what's actually stored in `RolePermission`. That keeps SuperAdmin's
 * access independent of the permission matrix UI: unchecking/saving boxes for that role (or a
 * brand-new menu node never having been seeded/granted) can never reduce or lag behind its
 * access. Still never a `role.key === 'super_admin'` string check — only the boolean flag.
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

/**
 * Layers a user's `UserPermissionOverride` rows on top of their role-derived permission set:
 * every 'revoke' removes a permission the roles would otherwise grant, every 'grant' adds one
 * they wouldn't otherwise have. Never applied to a SuperAdmin-flagged role holder — that access
 * is a hard guarantee that a per-user override row could otherwise accidentally (or maliciously)
 * weaken, so overrides are skipped entirely once `resolvePermissionsForRoles` reports SuperAdmin.
 *
 * This is the function `requirePermission` and `buildBootstrapResponse` call — role-only
 * resolution above is unchanged and still independently cached/tested.
 */
export async function resolveEffectivePermissionsForUser(userId: string, roleKeys: readonly string[]): Promise<string[]> {
  const basePermissions = await resolvePermissionsForRoles(roleKeys);
  if (roleKeys.length === 0) return basePermissions;

  const roles = (await prisma.role.findMany({
    where: { key: { in: [...roleKeys] }, isActive: true },
    select: { isSuperAdmin: true },
  })) ?? [];
  if (roles.some((r) => r.isSuperAdmin)) return basePermissions;

  const overrides = (await prisma.userPermissionOverride.findMany({
    where: { userId },
    include: { permission: { select: { key: true } } },
  })) ?? [];
  if (overrides.length === 0) return basePermissions;

  const revokes = new Set(overrides.filter((o) => o.effect === 'revoke').map((o) => o.permission.key));
  const grants = new Set(overrides.filter((o) => o.effect === 'grant').map((o) => o.permission.key));

  const effective = new Set(basePermissions.filter((p) => !revokes.has(p)));
  for (const g of grants) effective.add(g);
  return [...effective];
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

/** Replaces a user's full override set. A permissionId in both lists is rejected — that's
 *  a contradictory request, not something to silently resolve one way or the other. */
export async function setUserPermissionOverrides(
  userId: string,
  grants: string[],
  revokes: string[],
): Promise<{ grants: string[]; revokes: string[] }> {
  const overlap = grants.filter((id) => revokes.includes(id));
  if (overlap.length > 0) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'A permission cannot be both granted and revoked for the same user');
  }

  const permissionIds = [...grants, ...revokes];
  if (permissionIds.length > 0) {
    const validCount = await prisma.permission.count({ where: { id: { in: permissionIds } } });
    if (validCount !== new Set(permissionIds).size) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'One or more permissionIds do not exist');
    }
  }

  await prisma.$transaction([
    prisma.userPermissionOverride.deleteMany({ where: { userId } }),
    prisma.userPermissionOverride.createMany({
      data: [
        ...grants.map((permissionId) => ({ userId, permissionId, effect: 'grant' })),
        ...revokes.map((permissionId) => ({ userId, permissionId, effect: 'revoke' })),
      ],
    }),
  ]);

  invalidatePermissionCache();
  return getUserPermissionOverrides(userId);
}
