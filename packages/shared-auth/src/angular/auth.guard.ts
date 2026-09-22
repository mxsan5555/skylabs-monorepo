import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Awaits `whenReady()` before checking `isAuthenticated()` — a stored-but-expired token is
 * still "present" (non-null) the instant this guard runs, and only becomes genuinely
 * unauthenticated once `AuthService`'s constructor finishes its async recovery-or-clear
 * attempt. Without this wait, this guard would synchronously let a dead session through
 * (based on the stale token still being non-null in memory) and leave the real denial to
 * whichever guard runs after it — landing the user on the wrong page (e.g. a generic 403)
 * instead of a clean sign-in redirect.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/sign-in'], {
    queryParams: { redirectTo: state.url, ...(auth.sessionExpired() ? { sessionExpired: 1 } : {}) },
  });
};
