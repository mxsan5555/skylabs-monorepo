import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';

/** Verifies the Bearer access token and attaches `req.user`. Does not check permissions — see `requirePermission`. */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}
