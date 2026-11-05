import { prisma } from '../lib/prisma';
import { filterMenuByPermissions } from '@skylabs-monorepo/shared-permissions';
import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import { contextRoleKeys } from './portal-context';
import { HttpError } from '../middleware/errorHandler';
import { resolveEffectivePermissionsForUser } from './permission.service';
import type { AccessTokenPayload } from '../lib/jwt';
import { workflowMenu, pruneEmptyMenuGroups } from './workflow-menu';

/** Builds the `GET /rbac/bootstrap` payload exactly per `@skylabs-monorepo/shared-types#BootstrapResponse`. */
export async function buildBootstrapResponse(claims: AccessTokenPayload): Promise<BootstrapResponse & { portalContext?: string; authorizationConflicts: string[] }> {
  const user = await prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  if (user.status !== 'active') throw new HttpError(403, 'ACCOUNT_INACTIVE', 'Your login account is inactive. Contact support.');
  const roles = await prisma.role.findMany({ where: { key: claims.portalContext && claims.portalContext !== 'staff' ? { in: [claims.portalContext] } : { notIn: ['driver', 'customer'] }, isActive: true, users: {some: {userId: claims.sub}} } });
  const roleKeys = contextRoleKeys(roles.map(r => r.key), claims.portalContext ?? 'staff');
  const permissions = claims.portalContext && claims.portalContext !== 'staff' ? [] : await resolveEffectivePermissionsForUser(claims.sub, roleKeys);
  const menu = claims.portalContext && claims.portalContext !== 'staff' ? [] : pruneEmptyMenuGroups(filterMenuByPermissions(workflowMenu(), permissions));

  const roleIds = claims.portalContext !== 'staff' ? [] : roles.map((r) => r.id);
  const roleWidgets = await prisma.roleDashboardWidget.findMany({
    where: { roleId: { in: roleIds } },
    include: { widget: true },
    orderBy: { order: 'asc' },
  });

  // De-duplicate widgets granted by more than one of the caller's roles, keeping the lowest order.
  const widgetByKey = new Map<string, { key: string; title: string; order: number }>();
  for (const rw of roleWidgets) {
    const moduleKey = ({payments:'payments.overview',trips:'trips.bookings'} as Record<string,string>)[rw.widget.module] ?? rw.widget.module;
    if (!permissions.includes(`${moduleKey}:view`)) continue;
    const existing = widgetByKey.get(rw.widget.key);
    if (!existing || rw.order < existing.order) {
      widgetByKey.set(rw.widget.key, { key: rw.widget.key, title: rw.widget.title, order: rw.order });
    }
  }
  const dashboardWidgets = [...widgetByKey.values()].sort((a, b) => a.order - b.order);

  // Ownership signal for the driver self-service portal — never a role-name check. `null`
  // for every non-driver user and for a driver-role user not yet linked by an admin.
  const driver = await prisma.driver.findUnique({
    where: { userId: claims.sub },
    select: { id: true, firstName: true, lastName: true, status: true },
  });

  // Same ownership signal for the customer self-service portal — exact parallel to `driver`
  // above, never a role-name check. `null` for every non-customer user and for a
  // customer-role user not yet linked by an admin.
  const customer = await prisma.customer.findUnique({
    where: { userId: claims.sub },
    select: { id: true, firstName: true, lastName: true, accountStatus: true },
  });

  const overrides = await prisma.userPermissionOverride.findMany({ where: { userId: claims.sub }, include: { permission: { select: { key: true } } } });
  const authorizationConflicts = [
    ...(roleKeys.filter(key => !['driver', 'customer'].includes(key)).length > 1 ? ['Multiple active staff roles contribute to effective access. Choose a single staff role in User Management.'] : []),
    ...((overrides ?? []).map(o => `Direct ${o.effect}: ${o.permission.key}`)),
  ];
  return {
    authorizationConflicts,
    portalContext: claims.portalContext,
    user: { id: user.id, name: user.name, email: user.email ?? undefined, phone: user.phone ?? undefined, status: user.status },
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, isSuperAdmin: r.isSuperAdmin })),
    permissions,
    menu,
    dashboardWidgets,
    driver,
    customer,
    ...(claims.isPreview && claims.impersonatedBy
      ? { preview: { isPreview: true as const, impersonatedBy: claims.impersonatedBy } }
      : {}),
  };
}
