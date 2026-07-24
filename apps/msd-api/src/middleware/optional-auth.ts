import type { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import type { AuthedRequest } from './require-auth';

/** Like requireAuth, but a missing/invalid token just leaves req.auth unset
 *  instead of rejecting — used by cart routes that also serve guest carts. */
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.auth = { id: payload.sub, roles: payload.roles };
    } catch {
      // Invalid/expired token on an optional-auth route: proceed as a guest.
    }
  }
  next();
}
