import * as crypto from 'crypto';
import type { Response, Request } from 'express';
import { env } from '../config/env';

/**
 * Persistent-login cookies for the browser SPA (`apps/msd`). The opaque refresh token itself
 * stays exactly as `token.service.ts` already issues it — these are just the HTTP transport:
 * an HttpOnly cookie the browser re-sends automatically (so the refresh token is never readable
 * by page JS, and therefore never goes in localStorage), scoped to `/api/v1/auth` only (the
 * refresh/logout endpoints — no reason for every API call to carry it).
 *
 * `secure`/`sameSite` follow the real deployment (see docs/DEPLOYMENT.md): the frontend
 * (Vercel, custom domain) and this API (Railway subdomain) are different sites in production,
 * so a cross-site cookie needs `SameSite=None; Secure`. Locally both run on `localhost` (same
 * site, different port) over plain HTTP, where `Secure` would silently drop the cookie — hence
 * the NODE_ENV switch, not a hardcoded value.
 *
 * The CSRF cookie is deliberately `Path=/`, not `/api/v1/auth` like the refresh cookie — a
 * cookie's Path only ever restricts which REQUESTS carry it (fine to scope the refresh cookie
 * narrowly, it's only ever needed on the auth endpoints), but `document.cookie` readability on
 * the frontend is governed by the Path matching the CURRENT PAGE's URL, not the endpoint the
 * value will later be sent to. Scoped to `/api/v1/auth`, the CSRF cookie would be invisible to
 * `document.cookie` on every real app route (`/`, `/my-dashboard`, ...), since none of them are
 * under that path — confirmed by an actual browser run before this fix: refresh calls returned
 * 403 "Missing or invalid CSRF token" because the frontend could never read the cookie to echo
 * it back as a header at all.
 */
const REFRESH_COOKIE = 'msd_refresh_token';
const CSRF_COOKIE = 'msd_csrf_token';
const AUTH_COOKIE_PATH = '/api/v1/auth';

function cookieOptions(maxAgeMs: number, httpOnly: boolean, path: string) {
  const isProd = env.nodeEnv === 'production';
  return {
    httpOnly,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path,
    maxAge: maxAgeMs,
  };
}

function refreshTtlMs(): number {
  return env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000;
}

/** Sets both the HttpOnly refresh cookie and its paired, JS-readable CSRF cookie (double-submit
 *  pattern — `requireCsrfHeader` below checks the two match). Called on login and on every
 *  successful rotation, so a rolling session's cookie expiry always extends from "now". */
export function setAuthCookies(res: Response, refreshToken: string): void {
  const maxAge = refreshTtlMs();
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(maxAge, true, AUTH_COOKIE_PATH));
  res.cookie(CSRF_COOKIE, crypto.randomBytes(24).toString('base64url'), cookieOptions(maxAge, false, '/'));
}

/** Clears both cookies with the exact same attributes they were set with — a mismatched
 *  Path/SameSite/Secure on the clearing call leaves the original cookie behind in some browsers. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(0, true, AUTH_COOKIE_PATH));
  res.clearCookie(CSRF_COOKIE, cookieOptions(0, false, '/'));
}

export function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
}

/** Double-submit CSRF check for the cookie-authenticated auth endpoints (refresh/logout): the
 *  request must echo the CSRF cookie's value back in a header. A cross-site form/script can
 *  trigger the cookie-bearing request (that's what SameSite=None in prod allows) but can't
 *  read the cookie to also set this header — same-origin JS (our own frontend) can. */
export function requireCsrfHeader(req: Request): boolean {
  const cookieValue = (req.cookies as Record<string, string | undefined> | undefined)?.[CSRF_COOKIE];
  const headerValue = req.headers['x-csrf-token'];
  return !!cookieValue && typeof headerValue === 'string' && headerValue === cookieValue;
}
