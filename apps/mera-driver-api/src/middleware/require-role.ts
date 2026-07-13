import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from './require-auth';
import type { UserRole } from '../generated/prisma';

/** Must run after requireAuth. Mirrors the frontend's RequireRole/roleGuard — enforced here too, per CLAUDE.md's "guards are UX only" boundary. */
export function requireRole(allowed: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !allowed.some((role) => req.auth!.roles.includes(role))) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}
