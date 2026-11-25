import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';

export const GOOGLE_STATE_COOKIE = 'msd_google_oauth_state';
export const GOOGLE_RETURN_COOKIE = 'msd_google_return_to';
const GOOGLE_COOKIE_PATH = '/api/v1/auth/google';
const GOOGLE_COOKIE_MAX_AGE = 10 * 60 * 1000;

function googleCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: GOOGLE_COOKIE_PATH,
    maxAge,
  };
}

export function createGoogleState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function setGoogleStateCookie(res: Response, state: string): void {
  res.cookie(GOOGLE_STATE_COOKIE, state, googleCookieOptions(GOOGLE_COOKIE_MAX_AGE));
}

export function setGoogleReturnCookie(res: Response, returnTo: string): void {
  res.cookie(GOOGLE_RETURN_COOKIE, returnTo, googleCookieOptions(GOOGLE_COOKIE_MAX_AGE));
}

export function clearGoogleReturnCookie(res: Response): void {
  res.clearCookie(GOOGLE_RETURN_COOKIE, googleCookieOptions(0));
}

export function clearGoogleCookies(res: Response): void {
  res.clearCookie(GOOGLE_STATE_COOKIE, googleCookieOptions(0));
  res.clearCookie(GOOGLE_RETURN_COOKIE, googleCookieOptions(0));
}

export function hasValidGoogleState(req: Request): boolean {
  const queryState = req.query.state;
  const cookieState: unknown = req.cookies?.[GOOGLE_STATE_COOKIE];
  if (typeof queryState !== 'string' || typeof cookieState !== 'string') return false;
  const expected = Buffer.from(cookieState);
  const actual = Buffer.from(queryState);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Return paths are accepted only as same-site relative paths. */
function hasUnsafeReturnToCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === '\\' || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function sanitizeGoogleReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (hasUnsafeReturnToCharacter(value)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith('//') || hasUnsafeReturnToCharacter(decoded)) return null;
  if (/^\/(sign-in|otp|auth\/google)(?:[/?#]|$)/.test(decoded)) return null;
  try {
    const parsed = new URL(value, 'https://msd.invalid');
    return parsed.origin === 'https://msd.invalid' ? value : null;
  } catch {
    return null;
  }
}

/** Only redirect to an origin explicitly allowed by the existing CORS allowlist. */
export function getGoogleFrontendOrigin(): string {
  const allowed = env.corsOrigin;
  try {
    const configured = new URL(env.publicSiteUrl);
    if ((configured.protocol === 'https:' || env.nodeEnv !== 'production') && allowed.includes(configured.origin)) {
      return configured.origin;
    }
  } catch {
    // Use the first configured CORS origin as the safe fallback.
  }
  return allowed[0] ?? 'http://localhost:4200';
}

export function googleFrontendRedirect(path: string): string {
  return `${getGoogleFrontendOrigin()}${path}`;
}
