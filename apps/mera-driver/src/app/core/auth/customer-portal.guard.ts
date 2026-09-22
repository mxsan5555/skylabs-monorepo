import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

/**
 * Gate for `/customer/*` — access is ownership-based (a `Customer` row linked to this
 * User, surfaced as `bootstrap.customer`), never a role-name check. App-local (not
 * `shared-auth`) since "does this account have a linked Customer record" is a
 * mera-driver domain concept, not something msd needs. Mirrors `driverPortalGuard` exactly.
 */
export const customerPortalGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.bootstrap()?.customer != null ? true : router.createUrlTree(['/unauthorized']);
};
