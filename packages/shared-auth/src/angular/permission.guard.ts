import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { AuthService } from './auth.service';
import { AUTH_CONFIG } from './auth-config';

export interface RoutePermission {
  menuKey: string;
  action?: PermissionAction;
}

/**
 * Route guard for a single permission — reads `route.data['permission']` (a
 * `RoutePermission`), replacing the old `roleGuard`/`data.roles` pattern. UX only:
 * the API re-checks every request server-side via `requirePermission`.
 */
export const permissionGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const config = inject(AUTH_CONFIG);
  const permission = route.data?.['permission'] as RoutePermission | undefined;
  if (!permission) return true;

  // On a hard page load, bootstrap hasn't resolved yet — `can()` would false-deny against
  // an empty permission set. Wait for the in-flight fetch (a no-op if it already settled).
  await auth.whenReady();

  return auth.can(permission.menuKey, permission.action ?? 'view')
    ? true
    : router.createUrlTree([config.unauthorizedRedirectPath ?? '/account/profile']);
};
