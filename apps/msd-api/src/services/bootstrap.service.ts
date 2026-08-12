import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import { filterMenuByPermissions } from '@skylabs-monorepo/shared-permissions';
import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { resolveGrantedPermissionKeys } from './permission-resolver.service';
import type { AccessTokenPayload } from '../lib/jwt';

export async function getBootstrap(tokenPayload: AccessTokenPayload): Promise<BootstrapResponse> {
  const user = await prisma.user.findFirst({
    where: { id: tokenPayload.sub, deletedAt: null },
  });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found');

  const roles = await prisma.role.findMany({ where: { key: { in: tokenPayload.roles } } });
  const permissions = await resolveGrantedPermissionKeys(tokenPayload.roles);
  const menu = filterMenuByPermissions(getMenuForApp('msd'), permissions);

  const roleIds = roles.map((r) => r.id);
  const roleWidgets = await prisma.roleDashboardWidget.findMany({
    where: { roleId: { in: roleIds } },
    include: { widget: true },
    orderBy: { order: 'asc' },
  });

  const dashboardWidgetsByKey = new Map<string, { key: string; title: string; order: number }>();
  for (const rw of roleWidgets) {
    if (!dashboardWidgetsByKey.has(rw.widget.key)) {
      dashboardWidgetsByKey.set(rw.widget.key, {
        key: rw.widget.key,
        title: rw.widget.title,
        order: rw.order,
      });
    }
  }
  const dashboardWidgets = [...dashboardWidgetsByKey.values()].sort((a, b) => a.order - b.order);

  return {
    user: { id: user.id, name: user.name, email: user.email ?? undefined, phone: user.phone ?? undefined, status: user.status },
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, isSuperAdmin: r.isSuperAdmin })),
    permissions,
    menu,
    dashboardWidgets,
    ...(tokenPayload.isPreview && tokenPayload.impersonatedBy
      ? { preview: { isPreview: true as const, impersonatedBy: tokenPayload.impersonatedBy } }
      : {}),
  };
}
