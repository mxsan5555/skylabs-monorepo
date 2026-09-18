import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

/**
 * Guards the entire `/account/*` admin-console block: a Customer must never see the admin
 * shell, even by typing a URL directly, regardless of which individual `requirePermission`
 * grants their role happens to hold. Ownership-based (checks `bootstrap.customer`, never a
 * role-name string) — a single front-door check here is more robust than relying on every
 * individual `/account/*` child route's own permission gate to happen to deny a customer.
 * Mirrors `driverPortalGuard`'s ownership-check style, inverted.
 */
export const adminAreaGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.bootstrap()?.customer != null ? router.createUrlTree(['/customer']) : true;
};
