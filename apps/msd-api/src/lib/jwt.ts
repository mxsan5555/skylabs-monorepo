import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/** Access-token payload. Never put PII (name/email/phone) in here — roles + ids only. */
export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  app: 'msd';
  /** Present only on a short-lived "Login As" preview token. */
  isPreview?: true;
  impersonatedBy?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: `${env.jwtAccessTtlMinutes}m`,
  });
}

/**
 * Short-lived impersonation preview token — same shape, fixed 15-minute TTL regardless
 * of the normal access TTL. `jti` is persisted on the ImpersonationSession row so a
 * revoke/audit trail can reference the exact token that was issued.
 */
export function signPreviewToken(payload: AccessTokenPayload, jti: string): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '15m', jwtid: jti });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}
