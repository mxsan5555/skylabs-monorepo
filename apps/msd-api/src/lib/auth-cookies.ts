import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';

const REFRESH_COOKIE = 'msd_refresh_token';
const CSRF_COOKIE = 'msd_csrf_token';
const AUTH_COOKIE_PATH = '/api/v1/auth';

function cookieOptions(maxAge: number, httpOnly: boolean, path: string) {
  const production = env.nodeEnv === 'production';
  return {
    httpOnly,
    secure: production,
    sameSite: (production ? 'none' : 'lax') as 'none' | 'lax',
    path,
    maxAge,
  };
}

function refreshTtlMs(): number {
  return env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000;
}

function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function readRefreshCookie(req: Request): string | undefined {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

export function readCsrfCookie(req: Request): string | undefined {
  const token: unknown = req.cookies?.[CSRF_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, cookieOptions(refreshTtlMs(), false, '/'));
}

/** Sets the refresh credential as HttpOnly; the separate CSRF value is returned only to the API caller. */
export function setAuthCookies(res: Response, refreshToken: string, csrfToken?: string): string {
  const csrf = csrfToken ?? generateCsrfToken();
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(refreshTtlMs(), true, AUTH_COOKIE_PATH));
  setCsrfCookie(res, csrf);
  return csrf;
}

export function ensureCsrfCookie(req: Request, res: Response): string {
  const existing = readCsrfCookie(req);
  if (existing) return existing;
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  return token;
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(0, true, AUTH_COOKIE_PATH));
  res.clearCookie(CSRF_COOKIE, cookieOptions(0, false, '/'));
}

export function requireCsrfHeader(req: Request): boolean {
  const cookie = readCsrfCookie(req);
  const header = req.headers['x-csrf-token'];
  return !!cookie && typeof header === 'string' && header === cookie;
}
