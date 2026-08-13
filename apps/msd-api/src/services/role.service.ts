import { prisma } from '../lib/prisma';
import { PERMISSION_ACTIONS, type PermissionAction, type MenuNode } from '@skylabs-monorepo/shared-types';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { ApiError } from '../lib/http';

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new ApiError('NOT_FOUND', 'Role not found');
  return role;
}

export async function createRole(input: {
  key: string;
  name: string;
  description?: string;
  isActive: boolean;
}) {
  const existing = await prisma.role.findUnique({ where: { key: input.key } });
  if (existing) throw new ApiError('CONFLICT', `Role key "${input.key}" already exists`);
  return prisma.role.create({ data: { ...input, isSystem: false, isSuperAdmin: false } });
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string; isActive?: boolean },
) {
  await getRole(id);
  return prisma.role.update({ where: { id }, data: input });
}

export async function setRoleStatus(id: string, isActive: boolean) {
  const role = await getRole(id);
  if (role.isSystem && !isActive) {
    throw new ApiError('FORBIDDEN', 'System roles cannot be deactivated');
  }
  return prisma.role.update({ where: { id }, data: { isActive } });
}

export async function deleteRole(id: string) {
  const role = await getRole(id);
  if (role.isSystem) {
    throw new ApiError('FORBIDDEN', 'System roles cannot be deleted');
  }
  const assignedUserCount = await prisma.userRole.count({ where: { roleId: id } });
  if (assignedUserCount > 0) {
    throw new ApiError('CONFLICT', 'Role is still assigned to users; unassign before deleting');
  }
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.roleDashboardWidget.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
}

export async function cloneRole(sourceId: string, key: string, name: string) {
  const source = await getRole(sourceId);
  const existing = await prisma.role.findUnique({ where: { key } });
  if (existing) throw new ApiError('CONFLICT', `Role key "${key}" already exists`);

  const sourcePermissions = await prisma.rolePermission.findMany({ where: { roleId: source.id } });
  const sourceWidgets = await prisma.roleDashboardWidget.findMany({ where: { roleId: source.id } });

  return prisma.$transaction(async (tx) => {
    const clone = await tx.role.create({
      data: {
        key,
        name,
        description: source.description,
        isSystem: false,
        isSuperAdmin: false,
        isActive: true,
      },
    });
    if (sourcePermissions.length > 0) {
      await tx.rolePermission.createMany({
        data: sourcePermissions.map((rp) => ({ roleId: clone.id, permissionId: rp.permissionId })),
      });
    }
    if (sourceWidgets.length > 0) {
      await tx.roleDashboardWidget.createMany({
        data: sourceWidgets.map((rw) => ({ roleId: clone.id, widgetId: rw.widgetId, order: rw.order })),
      });
    }
    return clone;
  });
}

/** The permissionIds currently granted to a role — lets a client pre-check boxes before editing via setRolePermissions. */
export async function getRolePermissionIds(roleId: string): Promise<string[]> {
  await getRole(roleId);
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permissionId: true },
  });
  return rolePermissions.map((rp) => rp.permissionId);
}

export async function setRolePermissions(roleId: string, permissionIds: string[]) {
  await getRole(roleId);
  const validCount = await prisma.permission.count({ where: { id: { in: permissionIds } } });
  if (validCount !== permissionIds.length) {
    throw new ApiError('VALIDATION_ERROR', 'One or more permissionIds do not exist');
  }
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);
  return prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
}

export async function setRoleWidgets(roleId: string, widgets: { widgetId: string; order: number }[]) {
  await getRole(roleId);
  const ids = widgets.map((w) => w.widgetId);
  const validCount = await prisma.dashboardWidget.count({ where: { id: { in: ids } } });
  if (validCount !== ids.length) {
    throw new ApiError('VALIDATION_ERROR', 'One or more widgetIds do not exist');
  }
  await prisma.$transaction([
    prisma.roleDashboardWidget.deleteMany({ where: { roleId } }),
    prisma.roleDashboardWidget.createMany({
      data: widgets.map((w) => ({ roleId, widgetId: w.widgetId, order: w.order })),
    }),
  ]);
  return prisma.roleDashboardWidget.findMany({ where: { roleId }, include: { widget: true } });
}

/** Flattens the static msd menu tree so every node (parent + children) gets one row per action. */
function flattenMenu(nodes: readonly MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.children) out.push(...flattenMenu(node.children));
  }
  return out;
}

/** Full menu x action matrix, cross-referenced against which (menuKey, action) pairs already have a Permission row. */
export async function getPermissionCatalog() {
  const menu = flattenMenu(getMenuForApp('msd'));
  const existing = await prisma.permission.findMany();
  const existingByKey = new Map(existing.map((p) => [p.key, p]));

  return menu.map((node) => ({
    menuKey: node.permissionKey,
    title: node.title,
    actions: PERMISSION_ACTIONS.map((action: PermissionAction) => {
      const key = permissionKeyFor(node.permissionKey, action);
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
