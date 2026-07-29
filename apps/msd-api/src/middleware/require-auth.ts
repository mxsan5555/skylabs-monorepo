import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import type { UserRole } from '../generated/prisma';

export interface AuthedRequest extends Request {
  auth?: { id: string; roles: UserRole[] };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { id: payload.sub, roles: payload.roles };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
