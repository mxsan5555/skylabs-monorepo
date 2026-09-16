import type { Request } from 'express';

/** IP + user-agent pair attached to every audit log entry. */
export function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
