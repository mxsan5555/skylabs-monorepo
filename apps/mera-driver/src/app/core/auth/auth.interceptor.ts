import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

/** The public login endpoints don't carry our bearer token, and `/auth/refresh` /
 *  `/auth/logout` are the token machinery itself — none of these should ever be retried
 *  through the refresh-and-retry flow below (retrying `/auth/refresh` on its own 401 would
 *  loop; the others simply aren't "our session expired" failures). */
function isAuthEndpoint(url: string): boolean {
  return /\/auth\/(otp|password|refresh|logout|google)/.test(url);
}

/**
 * Attaches the bearer token to outgoing API requests, and reacts to a live 401 by refreshing
 * the access token (via `AuthService.ensureValidToken`, which single-flights concurrent
 * callers so N simultaneous 401s trigger exactly one `POST /auth/refresh`) and retrying the
 * original request once. Only a genuine refresh failure — the refresh token itself is
 * invalid/expired/revoked — ends the session and redirects to sign-in; every other case
 * (403 permission denial, 404, 5xx, a network blip) passes straight through untouched.
 *
 * This is the reactive complement to `AuthService`'s proactive renewal timer (which refreshes
 * ~60s before expiry so most requests never see a 401 in the first place) — it exists to
 * catch the cases the timer can miss: the tab was asleep/suspended past the scheduled fire
 * time, clock skew, or a token that the server rejects for a reason `isJwtExpired` can't see
 * client-side (e.g. a revoked session).
 *
 * Registered in app.config.ts via provideHttpClient(withInterceptors([authInterceptor])).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !token || isAuthEndpoint(req.url)) {
        return throwError(() => err);
      }

      return from(auth.ensureValidToken({ force: true })).pipe(
        switchMap((freshToken) => {
          if (!freshToken) {
            // The refresh token is genuinely invalid/expired/revoked — a real end of session.
            // `ensureValidToken` already cleared local state; send the user to sign-in with a
            // clear reason instead of leaving them on a page full of failed requests.
            void router.navigate(['/sign-in'], { queryParams: { sessionExpired: 1 } });
            return throwError(() => err);
          }
          const retriedReq = req.clone({ setHeaders: { Authorization: `Bearer ${freshToken}` } });
          return next(retriedReq);
        }),
      );
    }),
  );
};
