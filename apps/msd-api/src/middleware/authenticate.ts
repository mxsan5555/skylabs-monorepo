import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { sendError } from '../lib/http';

/** Verifies the Bearer JWT and attaches `req.user`. Does not check permissions — see requirePermission.ts. */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    sendError(res, 'UNAUTHORIZED', 'Missing bearer token');
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    sendError(res, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}
