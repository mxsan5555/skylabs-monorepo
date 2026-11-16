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
 * Idempotent, repeatable application of the internal User Management permission matrix (see
 * `prisma/permission-matrix.ts`): for each role named in `grantsByRoleKey`, resets its grant on
 * exactly `governedMenuKeys` to exactly the listed permission keys — delete-then-recreate, same
 * exact-state discipline as `role.service.ts#setRolePermissions`, scoped to ONLY the governed
 * keys so every other menuKey (and every role not named here — Super Admin, Customer, any future
 * custom role) is left untouched. Safe to re-run on every seed: converges to the same exact grant
 * set every time, including re-stripping a grant an older seed revision or a hand-edit via the
 * Role Permission Matrix UI had added back on one of these specific keys.
 *
 * EXCLUDES the `custom` action from the delete, regardless of menuKey — `custom` is never a
 * matrix-governed V/C/E/D grant, it's a separate "special operation" plumbing gate that happens
 * to share a menuKey with a resource the matrix DOES govern (`vendors:custom` is the one gate
 * every vendor self-service route runs on, see `vendor.service.ts`/`vendors.routes.ts`'s own
 * doc comments — sharing the `vendors` menuKey with the matrix's "Members" admin-wide resource
 * row purely by coincidence of the menu tree, not because it's part of that row's V/C/E/D).
 * Without this exclusion, applying the matrix for the `vendor` ("Member") role — which legitimately
 * holds `vendors:custom` via `grantStarterPermissions`'s `resetGrant`, run just before this —
 * deleted it anyway, because the delete matched on menuKey alone: every Member login then failed
 * every `/vendors/me/*` self-service request with "Missing permission vendors:custom" even though
 * the matrix was never supposed to touch that permission at all. Same reasoning protects
 * `rbac.users:custom` (the impersonation gate) from ever being swept by this function.
 */
export async function applyPermissionMatrix(
  prisma: PrismaLike,
  roles: Map<string, { id: string }>,
  permissionIdByKey: Map<string, string>,
  grantsByRoleKey: Record<string, string[]>,
  governedMenuKeys: string[],
): Promise<void> {
  for (const [roleKey, permissionKeys] of Object.entries(grantsByRoleKey)) {
    const role = roles.get(roleKey);
    if (!role) continue;

    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { menuKey: { in: governedMenuKeys }, action: { not: 'custom' } } },
    });

    const permissionIds = permissionKeys
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id));
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }
}

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
