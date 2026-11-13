import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import { filterMenuByPermissions } from '@skylabs-monorepo/shared-permissions';
import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { resolveGrantedPermissions } from './permission-resolver.service';
import type { AccessTokenPayload } from '../lib/jwt';

export async function getBootstrap(tokenPayload: AccessTokenPayload): Promise<BootstrapResponse> {
  const user = await prisma.user.findFirst({
    where: { id: tokenPayload.sub, deletedAt: null },
  });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found');

  // Bootstrap is fetched right after login AND on every refresh/mount (see shared-auth's
  // `loadBootstrap`), which already signs the caller out on a 401/403 response — reusing that
  // existing behavior here is what actually ends a suspended Member's session client-side, not
  // just blocks their next login (see `assertUserMayLogIn` in auth.service.ts) or their next
  // vendor-portal API call (see `getMyVendorOrThrow` in vendor.service.ts). Skipped for a
  // SuperAdmin's "Login As" preview token (`isPreview`) — previewing a suspended member's own
  // view is a legitimate admin action, never blocked by the thing being previewed.
  if (!tokenPayload.isPreview) {
    const vendor = await prisma.member.findUnique({ where: { ownerUserId: user.id }, select: { status: true } });
    if (vendor?.status === 'SUSPENDED') {
      throw new ApiError('FORBIDDEN', 'Your member account is suspended. Please contact support.');
    }
  }

  const roles = await prisma.role.findMany({ where: { key: { in: tokenPayload.roles } } });
  const { keys: permissions, scopes } = await resolveGrantedPermissions(tokenPayload.roles);
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

  const ownedMember = await prisma.member.findUnique({
    where: { ownerUserId: user.id },
    select: { id: true, status: true },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email ?? undefined, phone: user.phone ?? undefined, status: user.status },
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, isSuperAdmin: r.isSuperAdmin })),
    permissions,
    scopes,
    menu,
    dashboardWidgets,
    member: ownedMember ?? null,
    ...(tokenPayload.isPreview && tokenPayload.impersonatedBy
      ? { preview: { isPreview: true as const, impersonatedBy: tokenPayload.impersonatedBy } }
      : {}),
  };
}
