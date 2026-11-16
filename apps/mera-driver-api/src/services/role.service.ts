import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { writeAuditLog, type WriteAuditLogInput } from './audit.service';
import { workflowMenu } from './workflow-menu';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import { PERMISSION_ACTIONS, type MenuNode, type PermissionAction } from '@skylabs-monorepo/shared-types';
import { invalidatePermissionCache } from './permission.service';
import { isPortalRole } from './portal-context';

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
  isActive?: boolean;
  permissionIds?: string[];
}

async function validateRolePermissions(permissionIds: string[], actorPermissions?: string[]) {
  if (!permissionIds.length) return;
  if (new Set(permissionIds).size !== permissionIds.length || await prisma.permission.count({where:{id:{in:permissionIds}}}) !== permissionIds.length) {
    throw new HttpError(422,'VALIDATION_ERROR','One or more permissionIds do not exist or are duplicated');
  }
  if (actorPermissions) {
    const requested = await prisma.permission.findMany({where:{id:{in:permissionIds}},select:{key:true}});
    if (requested.some(p => !actorPermissions.includes(p.key))) throw new HttpError(403,'DELEGATION_DENIED','You cannot grant permissions beyond your own authority');
  }
}

async function assertUniqueRoleDetails(name: string | undefined, key?: string, excludeId?: string) {
  const conflict = await prisma.role.findFirst({ where: {
    ...(excludeId ? { id: { not: excludeId } } : {}),
    OR: [...(name ? [{ name: { equals: name.trim(), mode: 'insensitive' as const } }] : []), ...(key ? [{ key }] : [])],
  } });
  if (conflict) throw new HttpError(409, 'DUPLICATE_ROLE', 'A role with this name or key already exists');
}

export async function createRole(input: CreateRoleInput, actorPermissions?: string[], audit?: Pick<WriteAuditLogInput,'actorUserId'|'ip'|'userAgent'>) {
  await assertUniqueRoleDetails(input.name, input.key);
  const {permissionIds = [], ...data} = input;
  await validateRolePermissions(permissionIds, actorPermissions);
  return prisma.$transaction(async tx => {
    const role = await tx.role.create({data});
    if (permissionIds.length) await tx.rolePermission.createMany({data:permissionIds.map(permissionId => ({roleId:role.id,permissionId}))});
    if(audit) await writeAuditLog({...audit,action:'role.create',targetType:'Role',targetId:role.id,after:{...role,permissionIds}},tx);
    return role;
  });
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: string[];
}

export async function updateRole(id: string, input: UpdateRoleInput, actorPermissions?: string[], audit?: Pick<WriteAuditLogInput,'actorUserId'|'ip'|'userAgent'>) {
  const role = await getRoleById(id);
  await assertUniqueRoleDetails(input.name, undefined, id);
  const {permissionIds, ...data} = input;
  if (role.isSuperAdmin && (permissionIds !== undefined || data.isActive === false)) throw new HttpError(422,'PROTECTED_ROLE','Super Admin core access cannot be changed');
  if (isPortalRole(role.key) && data.isActive === false) throw new HttpError(422,'SYSTEM_PORTAL_ROLE','Portal core roles cannot be deactivated here; manage account status in the dedicated portal flow');
  if (isPortalRole(role.key) && permissionIds !== undefined) throw new HttpError(422,'SYSTEM_PORTAL_ROLE','Portal permissions cannot be edited here');
  if (permissionIds !== undefined) await validateRolePermissions(permissionIds, actorPermissions);
  const updated = await prisma.$transaction(async tx => {
    const updated = await tx.role.update({where:{id},data});
    if (permissionIds !== undefined) {
      await tx.rolePermission.deleteMany({where:{roleId:id}});
      if (permissionIds.length) await tx.rolePermission.createMany({data:permissionIds.map(permissionId => ({roleId:id,permissionId}))});
    }
    if(audit) await writeAuditLog({...audit,action:'role.update',targetType:'Role',targetId:id,before:role,after:{...updated,...(permissionIds?{permissionIds}:{})}},tx);
    return updated;
  });
  invalidatePermissionCache();
  return updated;
}

export async function assertRoleDelegation(roleId:string, actorId:string, permissions:string[]) {
  const role=await getRoleById(roleId);
  if(role.isSuperAdmin) {
    const links=await prisma.userRole.findMany({where:{userId:actorId,role:{isSuperAdmin:true,isActive:true}},select:{role:{select:{isSuperAdmin:true}}}});
    if(!links?.some(link=>link.role.isSuperAdmin)) throw new HttpError(403,'DELEGATION_DENIED','Only an active Super Admin can assign Super Admin access');
  }
  const links=await prisma.rolePermission.findMany({where:{roleId},select:{permission:{select:{key:true}}}});
  if(links.some(link=>!permissions.includes(link.permission.key))) throw new HttpError(403,'DELEGATION_DENIED','This role exceeds your delegated authority');
}

export async function deleteRole(id: string) {
  const role = await getRoleById(id);
  if (role.isSystem || role.isSuperAdmin) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'System roles cannot be deleted');
  }
  if (await prisma.userRole.count({where:{roleId:id}})>0 || await prisma.auditLog.count({where:{targetType:'Role',targetId:id}})>0) throw new HttpError(409,'ROLE_HISTORY_PROTECTED','This role has assignments or audit history; deactivate it instead');
  await prisma.role.delete({ where: { id } });
  invalidatePermissionCache();
}

export async function cloneRole(id: string, newKey: string, newName: string, actorPermissions?: string[]) {
  await assertUniqueRoleDetails(newName, newKey);
  const source = await getRoleById(id);
  if (source.isSuperAdmin) throw new HttpError(422, 'PROTECTED_ROLE', 'Super Admin cannot be copied');
  if (isPortalRole(source.key)) throw new HttpError(422, 'SYSTEM_PORTAL_ROLE', 'System portal roles cannot be cloned into staff roles.');
  const permissionLinks = await prisma.rolePermission.findMany({ where: { roleId: id } });
  const widgetLinks = await prisma.roleDashboardWidget.findMany({ where: { roleId: id } });
  await validateRolePermissions(permissionLinks.map(link => link.permissionId), actorPermissions);

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
  const existing = await getRoleById(id);
  if (isPortalRole(existing.key) && !isActive) throw new HttpError(422,'SYSTEM_PORTAL_ROLE','Portal core roles cannot be deactivated here');
  if (existing.isSuperAdmin && !isActive) throw new HttpError(422,'PROTECTED_ROLE','Super Admin cannot be deactivated');
  const role = await prisma.role.update({ where: { id }, data: { isActive } });
  invalidatePermissionCache();
  return role;
}

export async function setRolePermissions(roleId: string, permissionIds: string[], actorPermissions?: string[], audit?: Pick<WriteAuditLogInput,'actorUserId'|'ip'|'userAgent'>) {
  const role = await getRoleById(roleId);
  if (role.isSuperAdmin) throw new HttpError(422,'PROTECTED_ROLE','Super Admin core access cannot be changed');
  if (isPortalRole(role.key)) throw new HttpError(422, 'SYSTEM_PORTAL_ROLE', 'Customer and Driver are system portal roles; staff permissions cannot be assigned.');

  await validateRolePermissions(permissionIds, actorPermissions);
  const validCount = await prisma.permission.count({ where: { id: { in: permissionIds } } });
  if (validCount !== permissionIds.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'One or more permissionIds do not exist');
  }

  const links = await prisma.$transaction(async tx => {
    const before = audit ? await tx.rolePermission.findMany({where:{roleId},select:{permissionId:true}}) : [];
    await tx.rolePermission.deleteMany({where:{roleId}});
    if (permissionIds.length) await tx.rolePermission.createMany({data:permissionIds.map(permissionId=>({roleId,permissionId}))});
    if (audit) await writeAuditLog({...audit,action:'role.permissions.set',targetType:'Role',targetId:roleId,
      before:{permissionIds:before.map(link=>link.permissionId)},after:{permissionIds}},tx);
    return tx.rolePermission.findMany({where:{roleId},include:{permission:true}});
  });

  invalidatePermissionCache();
  return links;
}

export interface RoleWidgetInput {
  widgetId: string;
  order: number;
}

export async function setRoleWidgets(roleId: string, widgets: RoleWidgetInput[]) {
  const role = await getRoleById(roleId);
  if (isPortalRole(role.key)) throw new HttpError(422, 'SYSTEM_PORTAL_ROLE', 'Portal roles do not have staff dashboard widgets.');

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
  groupTitle?: string;
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
  const menu = workflowMenu();
  const topGroups = new Map<string,string>();
  for (const group of menu) for (const node of flattenMenu([group])) if (!topGroups.has(node.permissionKey)) topGroups.set(node.permissionKey,group.title);
  const nodes = flattenMenu(menu).filter(n => n.route).filter((n, i, all) => all.findIndex(x => x.permissionKey === n.permissionKey) === i);

  const allKeys = nodes.flatMap((node) => PERMISSION_ACTIONS.map((action) => permissionKeyFor(node.permissionKey, action)));
  const existing = await prisma.permission.findMany({ where: { key: { in: allKeys } } });
  const byKey = new Map(existing.map((permission) => [permission.key, permission]));

  return nodes.map((node) => ({
    menuKey: node.permissionKey,
    title: node.permissionKey === 'payments.overview' ? 'Accounts' : node.permissionKey === 'masters.source-types' ? 'Source Type & Work Preferences' : node.title,
    groupTitle: topGroups.get(node.permissionKey),
    actions: PERMISSION_ACTIONS.map((action) => {
      const key = permissionKeyFor(node.permissionKey, action);
      const supported: Record<string,string[]> = {
        dashboard:['view'], drivers:['view','create','edit','assign','status_change','export'],
        'kyc-assignments':['view','edit'], reports:['view','export'], settings:['view'],
        faqs:['view'],feedback:['view'],'promotions.promo-codes':['view'],'promotions.promo-usage':['view'],
        'rbac.audit-logs':['view'],'payments.overview':['view','create','edit'],
      };
      const permission = !supported[node.permissionKey] || supported[node.permissionKey].includes(action) ? byKey.get(key) : undefined;
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

export async function getRoleWidgets(roleId:string) {
  await getRoleById(roleId);
  return prisma.roleDashboardWidget.findMany({where:{roleId},include:{widget:true},orderBy:{order:'asc'}});
}

export async function listDashboardWidgets() {
  return prisma.dashboardWidget.findMany({ orderBy: { createdAt: 'asc' } });
}

export interface CreateDashboardWidgetInput {
  key: string;
  title: string;
  module: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: string[];
}

export async function createDashboardWidget(input: CreateDashboardWidgetInput) {
  return prisma.dashboardWidget.create({ data: input });
}
