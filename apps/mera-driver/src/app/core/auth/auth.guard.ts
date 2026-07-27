import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Route guard for protected routes (admin, profile). Redirects unauthenticated
 * users to sign-in.
 *
 * @example
 * { path: 'admin', canActivate: [authGuard], loadComponent: ... }
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/sign-in']);
};
