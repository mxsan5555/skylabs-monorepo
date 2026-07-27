import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import type { UserRole } from '../../models';

/**
 * Role guard. Reads the allowed roles from the route's `data.roles` and lets the
 * user through only if they hold one. UX only — the API must re-check the role.
 *
 * @example
 * { path: 'bookings', canActivate: [roleGuard], data: { roles: ['admin'] }, ... }
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const roles = (route.data?.['roles'] as UserRole[] | undefined) ?? [];
  return auth.hasRole(roles) ? true : router.createUrlTree(['/account/profile']);
};
