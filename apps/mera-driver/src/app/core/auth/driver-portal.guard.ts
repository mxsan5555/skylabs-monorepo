import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

/**
 * Gate for `/driver/*` — access is ownership-based (a `Driver` row linked to this
 * User, surfaced as `bootstrap.driver`), never a role-name check. App-local (not
 * `shared-auth`) since "does this account have a linked Driver record" is a
 * mera-driver domain concept, not something msd needs. Mirrors `permissionGuard`'s
 * `whenReady()` wait so a hard reload doesn't false-deny before bootstrap resolves.
 */
export const driverPortalGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.bootstrap()?.driver != null ? true : router.createUrlTree(['/unauthorized']);
};
