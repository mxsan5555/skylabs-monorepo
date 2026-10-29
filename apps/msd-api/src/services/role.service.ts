import { prisma } from '../lib/prisma';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import { ApiError } from '../lib/http';
import { RBAC_RESOURCE_CATALOG } from '../modules/rbac/permission-catalog';

export type PermissionScope = 'ALL' | 'OWN';

/**
 * `RolePermission.scope` has existed since `P1-01` but was never actually read anywhere until
 * the permission resolver/bootstrap started returning it — meaning every `OWN` grant saved via
 * the Role Permission Matrix UI before that point was silently a no-op, behaving exactly like
 * `ALL`. Now that `OWN` can actually change behavior, saving it for a key with no real
 * OWN-enforcement route code would be worse than inert — it would look restricted while quietly
 * granting full access. This allowlist is the single place that says "this permission key's
 * OWN scope is real"; `setRolePermissions` below rejects `OWN` for anything not listed here.
 * Grow this list only alongside the route change that actually enforces it.
 */
export const SCOPE_ENFORCED_PERMISSION_KEYS: readonly string[] = ['rbac.audit-logs:view'];

/**
 * Excludes `customer` — Customer is a real, undeletable DB role (every external customer login
 * still resolves to it) but is never shown in Role Management or offered anywhere a role is
 * assignable: Customer accounts get it automatically through their own registration/login flow,
 * never through an admin picking it from a list. Every consumer of this endpoint (Role
 * Management's role list, the staff Add/Edit role dropdown, the staff list's role filter) wants
 * exactly the same "visible administrative roles" set, so the exclusion lives here once rather
 * than being repeated — and forgotten — in three different frontend filters.
 */
export async function listRoles() {
  return prisma.role.findMany({ where: { key: { not: 'customer' } }, orderBy: { createdAt: 'asc' } });
}

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
  });

  if (!role) {
    throw new ApiError('NOT_FOUND', 'Role not found');
  }

  return role;
}

<<<<<<< HEAD
=======
/**
 * PLANNING.md §1.1/R1: "Seven fixed system roles; none can be deleted. Custom roles are not
 * needed now, so role create, clone and delete are locked." `deleteRole` already blocks every
 * `isSystem` row (the only rows that exist); this is the matching lock for the two mutations
 * that had none — unconditional, not scoped to who's asking, since the rule is "no custom roles
 * at all right now," not a permission a Super Admin could be granted around.
 */
export async function createRole(_input: {
  key: string;
  name: string;
  description?: string;
  isActive: boolean;
}): Promise<never> {
  throw new ApiError(
    'ROLE_MANAGEMENT_LOCKED',
    'Role create, clone and delete are locked — custom roles are not supported yet.',
  );
}

>>>>>>> 0c62458ad0afe6b2ffe9d33cb79971f4ef19f652
export async function updateRole(
  id: string,
  input: {
    name?: string;
    description?: string;
    isActive?: boolean;
  },
) {
  await getRole(id);

  return prisma.role.update({
    where: { id },
    data: input,
  });
}

export async function setRoleStatus(
  id: string,
  isActive: boolean,
) {
  const role = await getRole(id);

  if (role.isSystem && !isActive) {
    throw new ApiError(
      'FORBIDDEN',
      'System roles cannot be deactivated',
    );
  }

  return prisma.role.update({
    where: { id },
    data: { isActive },
  });
}

<<<<<<< HEAD
=======
export async function deleteRole(id: string) {
  const role = await getRole(id);

  if (role.isSystem) {
    throw new ApiError(
      'FORBIDDEN',
      'System roles cannot be deleted',
    );
  }

  const assignedUserCount = await prisma.userRole.count({
    where: { roleId: id },
  });

  if (assignedUserCount > 0) {
    throw new ApiError(
      'CONFLICT',
      'Role is still assigned to users; unassign before deleting',
    );
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({
      where: { roleId: id },
    }),

    prisma.roleDashboardWidget.deleteMany({
      where: { roleId: id },
    }),

    prisma.role.delete({
      where: { id },
    }),
  ]);
}

export async function cloneRole(
  _sourceId: string,
  _key: string,
  _name: string,
): Promise<never> {
  throw new ApiError(
    'ROLE_MANAGEMENT_LOCKED',
    'Role create, clone and delete are locked — custom roles are not supported yet.',
  );
}

>>>>>>> 0c62458ad0afe6b2ffe9d33cb79971f4ef19f652
/**
 * Returns all permissions currently assigned to a role,
 * including their scope.
 *
 * Example:
 *
 * [
 *   {
 *     permissionId: "...",
 *     scope: "ALL"
 *   },
 *   {
 *     permissionId: "...",
 *     scope: "OWN"
 *   }
 * ]
 */
export async function getRolePermissions(roleId: string) {
  await getRole(roleId);

  return prisma.rolePermission.findMany({
    where: {
      roleId,
    },
    include: {
      permission: true,
    },
    orderBy: {
      permission: {
        menuKey: 'asc',
      },
    },
  });
}

/**
 * Sets a role's permissions together with their scope.
 *
 * Scope:
 * - ALL = permission applies to all records
 * - OWN = permission applies only to user's own records
 */
export async function setRolePermissions(
  roleId: string,
  permissions: Array<{
    permissionId: string;
    scope: PermissionScope;
  }>,
) {
  await getRole(roleId);

  /**
   * Prevent duplicate permission IDs.
   *
   * Because RolePermission has a composite primary key:
   * (roleId, permissionId)
   */
  const permissionIds = permissions.map(
    (permission) => permission.permissionId,
  );

  const uniquePermissionIds = new Set(permissionIds);

  if (uniquePermissionIds.size !== permissionIds.length) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'A permission cannot be assigned more than once.',
    );
  }

  /**
   * Validate that every permission exists, and (while we're already fetching each permission's
   * key) that any `OWN` scope request is for a key this app actually enforces OWN-scope for —
   * see `SCOPE_ENFORCED_PERMISSION_KEYS`'s own doc comment for why this can't be skipped now
   * that scope is live.
   */
  if (permissionIds.length > 0) {
    const foundPermissions = await prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds,
        },
      },
      select: { id: true, key: true },
    });

    if (foundPermissions.length !== uniquePermissionIds.size) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'One or more permissionIds do not exist.',
      );
    }

    const keyByPermissionId = new Map(foundPermissions.map((p) => [p.id, p.key]));
    const unsupportedOwnKeys = permissions
      .filter((p) => p.scope === 'OWN')
      .map((p) => keyByPermissionId.get(p.permissionId))
      .filter((key): key is string => Boolean(key) && !SCOPE_ENFORCED_PERMISSION_KEYS.includes(key));

    if (unsupportedOwnKeys.length > 0) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `"Own" scope is not yet enforced for: ${unsupportedOwnKeys.join(', ')}.`,
      );
    }
  }

  /**
   * Replace the role's complete permission assignment
   * atomically.
   */
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({
      where: {
        roleId,
      },
    });

    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.permissionId,
          scope: permission.scope,
        })),
      });
    }
  });

  /**
   * Return the newly saved permissions.
   */
  return prisma.rolePermission.findMany({
    where: {
      roleId,
    },
    include: {
      permission: true,
    },
    orderBy: {
      permission: {
        menuKey: 'asc',
      },
    },
  });
}

/**
 * Returns the permission IDs currently granted to a role.
 *
 * Kept as a compatibility helper for any existing code that
 * only needs permission IDs.
 */
export async function getRolePermissionIds(
  roleId: string,
): Promise<string[]> {
  await getRole(roleId);

  const rolePermissions =
    await prisma.rolePermission.findMany({
      where: {
        roleId,
      },
      select: {
        permissionId: true,
      },
    });

  return rolePermissions.map(
    (rolePermission) => rolePermission.permissionId,
  );
}

/**
 * Returns a role's currently assigned dashboard widgets.
 */
export async function getRoleWidgets(roleId: string) {
  await getRole(roleId);

  return prisma.roleDashboardWidget.findMany({
    where: {
      roleId,
    },
    include: {
      widget: true,
    },
  });
}

export async function setRoleWidgets(
  roleId: string,
  widgets: {
    widgetId: string;
    order: number;
  }[],
) {
  await getRole(roleId);

  const ids = widgets.map(
    (widget) => widget.widgetId,
  );

  const uniqueIds = new Set(ids);

  if (uniqueIds.size !== ids.length) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'A dashboard widget cannot be assigned more than once.',
    );
  }

  if (ids.length > 0) {
    const validCount =
      await prisma.dashboardWidget.count({
        where: {
          id: {
            in: ids,
          },
        },
      });

    if (validCount !== uniqueIds.size) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'One or more widgetIds do not exist',
      );
    }
  }

  await prisma.$transaction([
    prisma.roleDashboardWidget.deleteMany({
      where: {
        roleId,
      },
    }),

    prisma.roleDashboardWidget.createMany({
      data: widgets.map((widget) => ({
        roleId,
        widgetId: widget.widgetId,
        order: widget.order,
      })),
    }),
  ]);

  return prisma.roleDashboardWidget.findMany({
    where: {
      roleId,
    },
    include: {
      widget: true,
    },
  });
}

/**
 * Returns the Role Permission Matrix screen's catalog — one row per PLANNING.md §1.2 resource,
 * each action backed by the REAL `menuKeys` `RBAC_RESOURCE_CATALOG` declares (the same keys
 * `requirePermission()` and `filterMenuByPermissions` read), not a parallel key space. A
 * resource with several real keys (`content`) reports every one of their `permissionIds` for a
 * given action, so the frontend can grant/revoke the whole group atomically — see
 * `permission-catalog.ts`'s own doc comment for why this matters.
 */
export async function getPermissionCatalog() {
  // Ensure every (menuKey, action) pair the catalog declares has a database Permission row.
  // `key` is unique (for example `vendors.branches:view`), so upsert is idempotent. Skips a
  // (menuKey, action) pair declared unsupported for that specific key (e.g. Content's 3
  // singleton CMS pages have no create/delete).
  const pairs = RBAC_RESOURCE_CATALOG.flatMap((resource) =>
    resource.menuKeys.flatMap((menuKey) =>
      resource.actions
        .filter((action) => !resource.unsupportedFor?.[action]?.includes(menuKey))
        .map((action: PermissionAction) => ({
          key: permissionKeyFor(menuKey, action),
          menuKey,
          action,
          label: `${resource.title}: ${action}`,
        })),
    ),
  );

  // This is a one-time repair for missing catalog rows. Existing rows/IDs are preserved.
  await prisma.$transaction(
    pairs.map((permission) =>
      prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      }),
    ),
  );

  const existing = await prisma.permission.findMany({
    where: { key: { in: pairs.map((pair) => pair.key) } },
  });
  const existingByKey = new Map(existing.map((permission) => [permission.key, permission]));

  return RBAC_RESOURCE_CATALOG.map((resource) => ({
    id: resource.key,
    menuKey: resource.menuKeys.join(', '),
    title: resource.title,
    actions: resource.actions.map((action: PermissionAction) => {
      const supportedMenuKeys = resource.menuKeys.filter(
        (menuKey) => !resource.unsupportedFor?.[action]?.includes(menuKey),
      );
      const permissions = supportedMenuKeys
        .map((menuKey) => existingByKey.get(permissionKeyFor(menuKey, action)))
        .filter((permission): permission is NonNullable<typeof permission> => Boolean(permission));

      return {
        action,
        key: supportedMenuKeys.map((menuKey) => permissionKeyFor(menuKey, action)).join(', '),
        permissionIds: permissions.map((permission) => permission.id),
        label: permissions[0]?.label ?? null,
      };
    }),
  }));
}