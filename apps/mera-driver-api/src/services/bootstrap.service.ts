import { prisma } from '../lib/prisma';
import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { filterMenuByPermissions } from '@skylabs-monorepo/shared-permissions';
import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import { HttpError } from '../middleware/errorHandler';
import { resolveEffectivePermissionsForUser } from './permission.service';
import type { AccessTokenPayload } from '../lib/jwt';

/** Builds the `GET /rbac/bootstrap` payload exactly per `@skylabs-monorepo/shared-types#BootstrapResponse`. */
export async function buildBootstrapResponse(claims: AccessTokenPayload): Promise<BootstrapResponse> {
  const user = await prisma.user.findFirst({ where: { id: claims.sub, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  const roles = await prisma.role.findMany({ where: { key: { in: claims.roles }, isActive: true } });
  const permissions = await resolveEffectivePermissionsForUser(claims.sub, claims.roles);
  const menu = filterMenuByPermissions(getMenuForApp('mera-driver'), permissions);

  const roleIds = roles.map((r) => r.id);
  const roleWidgets = await prisma.roleDashboardWidget.findMany({
    where: { roleId: { in: roleIds } },
    include: { widget: true },
    orderBy: { order: 'asc' },
  });

  // De-duplicate widgets granted by more than one of the caller's roles, keeping the lowest order.
  const widgetByKey = new Map<string, { key: string; title: string; order: number }>();
  for (const rw of roleWidgets) {
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

  return {
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
