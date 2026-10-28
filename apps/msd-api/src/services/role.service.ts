import { prisma } from '../lib/prisma';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import { ApiError } from '../lib/http';
import { RBAC_RESOURCE_CATALOG } from '../modules/rbac/permission-catalog';

export type PermissionScope = 'ALL' | 'OWN';

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: { createdAt: 'asc' },
  });
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
   * Validate that every permission exists.
   */
  if (permissionIds.length > 0) {
    const validCount = await prisma.permission.count({
      where: {
        id: {
          in: permissionIds,
        },
      },
    });

    if (validCount !== uniquePermissionIds.size) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'One or more permissionIds do not exist.',
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
 * Returns the NEW business RBAC permission catalog.
 *
 * IMPORTANT:
 * Do NOT build this from getMenuForApp() / msdMenu.
 *
 * The application menu and business permission matrix are
 * two different concepts.
 *
 * The permission matrix is defined by:
 * RBAC_RESOURCE_CATALOG
 *
 * Example:
 *
 * Members
 *   view
 *   create
 *   edit
 *   delete
 *
 * Orders
 *   view
 *
 * Customers
 *   view
 *
 * etc.
 */
export async function getPermissionCatalog() {
  // Ensure every action in the business catalog has a database Permission row.
  // `key` is unique (for example `members:view`), so upsert is idempotent.
  const catalogRows = RBAC_RESOURCE_CATALOG.flatMap((resource) =>
    resource.actions.map((action: PermissionAction) => ({
      key: permissionKeyFor(resource.key, action),
      menuKey: resource.key,
      action,
      label: `${resource.title}: ${action}`,
    })),
  );

  // This is a one-time repair for missing catalog rows. Existing rows/IDs are preserved.
  await prisma.$transaction(
    catalogRows.map((permission) =>
      prisma.permission.upsert({
        where: { key: permission.key },
        update: {},
        create: permission,
      }),
    ),
  );

  const existing = await prisma.permission.findMany({
    where: { key: { in: catalogRows.map((permission) => permission.key) } },
  });
  const existingByKey = new Map(existing.map((permission) => [permission.key, permission]));

  return RBAC_RESOURCE_CATALOG.map((resource) => ({
    id: resource.key,
    menuKey: resource.key,
    title: resource.title,
    actions: resource.actions.map((action: PermissionAction) => {
      const key = permissionKeyFor(resource.key, action);
      const permission = existingByKey.get(key);

      return {
        action,
        key,
        permissionId: permission?.id ?? null,
        label: permission?.label ?? null,
      };
    }),
  }));
}