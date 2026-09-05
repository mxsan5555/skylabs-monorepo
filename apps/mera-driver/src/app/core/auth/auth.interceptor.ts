import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

/**
 * Attaches the bearer token to outgoing API requests. Registered in
 * app.config.ts via provideHttpClient(withInterceptors([authInterceptor])).
 * The token itself (and the "Login As" preview swap) is now owned by the
 * shared dynamic-RBAC AuthService, not an app-local one.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  if (!token) return next(req);
  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
