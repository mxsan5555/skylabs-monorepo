import type { PrismaClient } from '../generated/prisma-client';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';

export interface SharedKeySplit {
  oldMenuKey: string;
  newMenuKeys: string[];
}

/**
 * Takes an explicit `PrismaClient` rather than importing the app's `../lib/prisma` singleton —
 * deliberately, not an inconsistency with this codebase's usual service pattern: that singleton
 * import pulls in `../config/env`, which eagerly `required()`s `JWT_SECRET` and other vars that
 * `prisma/seed.ts`'s standalone `.env.local` (see its own doc comment on why it loads env itself,
 * separately from `main.ts`'s bootstrap) never needs and doesn't have — importing it here would
 * crash the seed script on startup. Accepting the client as a parameter also makes this directly
 * unit-testable with a plain mock object, no `vi.mock('../lib/prisma')` module mock needed.
 */
type PrismaLike = Pick<PrismaClient, 'permission' | 'rolePermission'>;

/**
 * One-time migration for a `menuKey` that used to be shared by several menu nodes and has since
 * been split into distinct per-node keys (see msd-menu.json's history — `cms.blog` used to be
 * shared by the "Pages" and "Articles" rows). Before a split, holding `${oldMenuKey}:${action}`
 * meant "can do ${action} on this whole shared surface" — this preserves that same effective
 * access by granting `${newMenuKey}:${action}` on every new key, for any role that already held
 * the old grant. Reads live `RolePermission` rows rather than a hardcoded role list, so custom,
 * admin-created roles are covered too, not just the 6 seeded system roles.
 *
 * There is no per-user permission override in this system to migrate alongside this — permission
 * is entirely role-based (`User` -> `UserRole` -> `Role` -> `RolePermission` -> `Permission`, see
 * schema.prisma's `User` model); nothing else needs migrating.
 *
 * Genuinely ONE-TIME, not "re-derive on every run": once every role's grant has been propagated
 * to the new keys, the old `Permission` rows (and, via `onDelete: Cascade`, their
 * `RolePermission` grants) are DELETED. This is deliberate, not a cleanup afterthought — if the
 * old rows survived, every later seed run would re-read "this role used to have the old grant"
 * and re-grant the new keys even after an admin explicitly revoked one via the Role Permission
 * Matrix UI (`PUT /rbac/roles/:id/permissions` replaces a role's entire grant set from exactly
 * what's checked — but the OLD key was never rendered as a checkbox at all once its menu node
 * stopped existing, so a saved edit could never remove it, and it would sit there forever
 * silently re-seeding the new keys back on). Deleting the old permission is what makes a later
 * seed run a true no-op for this split (`oldPermissions.length === 0` short-circuits immediately)
 * — the revoke sticks.
 *
 * Only call this with an `oldMenuKey` that NO active `requirePermission()` (backend) or `can()`
 * (frontend) check still references — "keep old permissions only if an active authorization
 * check still needs them" is the rule; if something still checks the old key, it isn't ready to
 * retire, don't call this yet.
 */
export async function migrateSharedKeySplitGrants(
  prisma: PrismaLike,
  splits: SharedKeySplit[],
  permissionIdByKey: Map<string, string>,
): Promise<void> {
  for (const { oldMenuKey, newMenuKeys } of splits) {
    const oldPermissions = await prisma.permission.findMany({ where: { menuKey: oldMenuKey } });
    if (oldPermissions.length === 0) continue; // already migrated (or never existed) — nothing to do, nothing to re-derive

    const oldGrants = await prisma.rolePermission.findMany({
      where: { permissionId: { in: oldPermissions.map((p) => p.id) } },
      include: { permission: { select: { action: true } } },
    });

    const migratedGrants = oldGrants
      .flatMap((grant) =>
        newMenuKeys.map((newMenuKey) => {
          const permissionId = permissionIdByKey.get(permissionKeyFor(newMenuKey, grant.permission.action as PermissionAction));
          return permissionId ? { roleId: grant.roleId, permissionId } : null;
        }),
      )
      .filter((row): row is { roleId: string; permissionId: string } => row !== null);

    if (migratedGrants.length > 0) {
      await prisma.rolePermission.createMany({ data: migratedGrants, skipDuplicates: true });
    }

    // Retire the old key for good — cascade-deletes every role's old RolePermission grant in the
    // same step, which is exactly what guarantees this function never re-runs its migration logic
    // for this split again (the `oldPermissions.length === 0` guard above short-circuits it).
    await prisma.permission.deleteMany({ where: { id: { in: oldPermissions.map((p) => p.id) } } });
  }
}
