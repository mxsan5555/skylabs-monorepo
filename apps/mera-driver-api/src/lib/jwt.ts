import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me';
const ACCESS_TTL_MINUTES = Number(process.env.JWT_ACCESS_TTL_MINUTES ?? 15);

/** Payload embedded in the short-lived access token. Never put PII (name/email/phone) here. */
export interface AccessTokenPayload {
  sub: string; // userId (or the impersonation target's userId for a preview token)
  roles: string[]; // role keys granted to `sub`
  app: 'mera-driver';
  /** Present only on a superadmin "Login As" preview token. */
  isPreview?: true;
  impersonatedBy?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp'>,
  ttlMinutes: number = ACCESS_TTL_MINUTES,
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${ttlMinutes}m` });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
}
