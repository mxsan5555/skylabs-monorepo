import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { AuthService } from './auth.service';

export interface RoutePermission {
  menuKey: string;
  action?: PermissionAction;
}

/**
 * Route guard for a single permission — reads `route.data['permission']` (a
 * `RoutePermission`), replacing the old `roleGuard`/`data.roles` pattern. UX only:
 * the API re-checks every request server-side via `requirePermission`.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const permission = route.data?.['permission'] as RoutePermission | undefined;
  if (!permission) return true;
  return auth.can(permission.menuKey, permission.action ?? 'view')
    ? true
    : router.createUrlTree(['/account/profile']);
};
