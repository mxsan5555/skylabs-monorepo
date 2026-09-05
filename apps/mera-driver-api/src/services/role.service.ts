import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import { PERMISSION_ACTIONS, type MenuNode, type PermissionAction } from '@skylabs-monorepo/shared-types';
import { invalidatePermissionCache } from './permission.service';

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function getRoleById(id: string) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new HttpError(404, 'NOT_FOUND', 'Role not found');
  return role;
}

export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string;
}

export async function createRole(input: CreateRoleInput) {
  return prisma.role.create({
    data: { key: input.key, name: input.name, description: input.description },
  });
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  await getRoleById(id);
  return prisma.role.update({ where: { id }, data: input });
}

export async function deleteRole(id: string) {
  const role = await getRoleById(id);
  if (role.isSystem) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'System roles cannot be deleted');
  }
  await prisma.role.delete({ where: { id } });
  invalidatePermissionCache();
}

export async function cloneRole(id: string, newKey: string, newName: string) {
  const source = await getRoleById(id);
  const permissionLinks = await prisma.rolePermission.findMany({ where: { roleId: id } });
  const widgetLinks = await prisma.roleDashboardWidget.findMany({ where: { roleId: id } });

  return prisma.$transaction(async (tx) => {
    const clone = await tx.role.create({
      data: {
        key: newKey,
        name: newName,
        description: source.description,
        isSystem: false,
        isSuperAdmin: false,
      },
    });

    if (permissionLinks.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionLinks.map((link) => ({ roleId: clone.id, permissionId: link.permissionId })),
      });
    }
    if (widgetLinks.length > 0) {
      await tx.roleDashboardWidget.createMany({
        data: widgetLinks.map((link) => ({ roleId: clone.id, widgetId: link.widgetId, order: link.order })),
      });
    }

    return clone;
  });
}

export async function setRoleStatus(id: string, isActive: boolean) {
  await getRoleById(id);
  const role = await prisma.role.update({ where: { id }, data: { isActive } });
  invalidatePermissionCache();
  return role;
}

export async function setRolePermissions(roleId: string, permissionIds: string[]) {
  await getRoleById(roleId);

  const validCount = await prisma.permission.count({ where: { id: { in: permissionIds } } });
  if (validCount !== permissionIds.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'One or more permissionIds do not exist');
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);

  invalidatePermissionCache();
  return prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
}

export interface RoleWidgetInput {
  widgetId: string;
  order: number;
}

export async function setRoleWidgets(roleId: string, widgets: RoleWidgetInput[]) {
  await getRoleById(roleId);

  const widgetIds = widgets.map((w) => w.widgetId);
  const validCount = await prisma.dashboardWidget.count({ where: { id: { in: widgetIds } } });
  if (validCount !== widgetIds.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'One or more widgetIds do not exist');
  }

  await prisma.$transaction([
    prisma.roleDashboardWidget.deleteMany({ where: { roleId } }),
    prisma.roleDashboardWidget.createMany({
      data: widgets.map((w) => ({ roleId, widgetId: w.widgetId, order: w.order })),
    }),
  ]);

  return prisma.roleDashboardWidget.findMany({ where: { roleId }, include: { widget: true }, orderBy: { order: 'asc' } });
}

/** One grantable action within a permission-catalog node — carries the real DB `Permission.id`
 *  (or `null` if that (menuKey, action) pair has no Permission row yet) so the frontend can
 *  map a checkbox directly to an id it can send back to `PUT /rbac/roles/:id/permissions`. */
export interface PermissionCatalogAction {
  action: PermissionAction;
  key: string;
  permissionId: string | null;
  label: string;
}

/** One row per menu node in the permission-catalog UI, listing every grantable action on it. */
export interface PermissionCatalogNode {
  menuKey: string;
  title: string;
  actions: PermissionCatalogAction[];
}

function flattenMenu(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenMenu(node.children) : [])]);
}

/**
 * Builds the full menu x action permission matrix for the Role Management UI. The menu/action
 * shape still comes from the static `shared-menu` tree (never hand-typed), but each action is
 * now joined against the real `Permission` table by its canonical `key` so the response carries
 * an actual `permissionId` a checkbox can round-trip through `PUT /rbac/roles/:id/permissions`.
 * `permissionId` is `null` (same defensive shape either way) if the seed/admin hasn't created a
 * Permission row for that (menuKey, action) pair yet.
 */
export async function buildPermissionCatalog(): Promise<PermissionCatalogNode[]> {
  const nodes = flattenMenu(getMenuForApp('mera-driver'));

  const allKeys = nodes.flatMap((node) => PERMISSION_ACTIONS.map((action) => permissionKeyFor(node.permissionKey, action)));
  const existing = await prisma.permission.findMany({ where: { key: { in: allKeys } } });
  const byKey = new Map(existing.map((permission) => [permission.key, permission]));

  return nodes.map((node) => ({
    menuKey: node.permissionKey,
    title: node.title,
    actions: PERMISSION_ACTIONS.map((action) => {
      const key = permissionKeyFor(node.permissionKey, action);
      const permission = byKey.get(key);
      return {
        action,
        key,
        permissionId: permission?.id ?? null,
        label: permission?.label ?? `${node.title} — ${action}`,
      };
    }),
  }));
}

/** The role's current grants, as a flat list of `Permission.id`s — used to pre-check the
 *  Role Management UI's checkboxes before the caller edits and re-saves via
 *  `PUT /rbac/roles/:id/permissions`. */
export async function getRolePermissionIds(roleId: string): Promise<string[]> {
  await getRoleById(roleId);
  const links = await prisma.rolePermission.findMany({ where: { roleId }, select: { permissionId: true } });
  return links.map((link) => link.permissionId);
}

export async function listDashboardWidgets() {
  return prisma.dashboardWidget.findMany({ orderBy: { createdAt: 'asc' } });
}

export interface CreateDashboardWidgetInput {
  key: string;
  title: string;
  module: string;
  description?: string;
}

export async function createDashboardWidget(input: CreateDashboardWidgetInput) {
  return prisma.dashboardWidget.create({ data: input });
}
