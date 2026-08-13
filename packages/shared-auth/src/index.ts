import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';

/**
 * Framework-agnostic auth core shared by `./react` (msd-admin, msd) and `./angular`
 * (mera-driver). Each *app* still keeps its own storage keys/prefix and its own token —
 * there is no shared session between apps, only shared logic.
 */

export interface AuthStorageKeys {
  /** The live bearer token the app sends on every request. */
  token: string;
  /** During a SuperAdmin "Login As" preview, the real SuperAdmin token is stashed here. */
  realToken: string;
  /** The rotated opaque refresh token paired with `token` — absent for preview tokens (a
   *  "Login As" preview is never refreshed; see CLAUDE.md's Login As section). */
  refreshToken: string;
}

export function authStorageKeys(appPrefix: string): AuthStorageKeys {
  return {
    token: `${appPrefix}_auth_token`,
    realToken: `${appPrefix}_auth_real_token`,
    refreshToken: `${appPrefix}_auth_refresh_token`,
  };
}

function safeLocalStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function readStorageValue(key: string): string | null {
  return safeLocalStorage()?.getItem(key) ?? null;
}

export function writeStorageValue(key: string, value: string | null): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  if (value) storage.setItem(key, value);
  else storage.removeItem(key);
}

/** Decodes the JWT payload for read-only UI hints (e.g. `preview`). Never trust this for access control — the server re-verifies on every request. */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string): boolean {
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

/** True only for a short-lived SuperAdmin "Login As" preview token — never refreshed (see
 *  CLAUDE.md's Login As section: it can't outlive its fixed 15-minute lifetime). */
export function isPreviewToken(token: string): boolean {
  return !!decodeJwtPayload<{ isPreview?: boolean }>(token)?.isPreview;
}

/** Milliseconds until `token`'s claimed expiry, minus a safety leeway (default 60s) so a
 *  scheduled refresh fires comfortably before the server would reject the token. Never
 *  negative — an already-expired/leeway-exceeded token refreshes immediately (delay 0). */
export function msUntilJwtExpiry(token: string, leewaySeconds = 60): number {
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload?.exp) return 0;
  return Math.max(0, payload.exp * 1000 - leewaySeconds * 1000 - Date.now());
}

/** Thrown by `fetchBootstrap`/`refreshAccessToken` with the HTTP status attached, so callers can
 *  tell a genuine auth failure (401/403 — invalid/expired/revoked token, safe to sign out) apart
 *  from a transient failure (network blip, 5xx, proxy hiccup) that must NOT clear a valid token. */
export class AuthRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = status;
  }
}

/** Fetches the permission/menu/dashboard bundle right after login, and again whenever the app wants a fresh read of the caller's current access (e.g. after a token refresh). */
export async function fetchBootstrap(apiBaseUrl: string, token: string): Promise<BootstrapResponse> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/rbac/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new AuthRequestError(err instanceof Error ? err.message : 'Network error loading /rbac/bootstrap');
  }
  if (!res.ok) {
    throw new AuthRequestError(`Failed to load /rbac/bootstrap: ${res.status}`, res.status);
  }
  const body = (await res.json()) as { data: BootstrapResponse };
  return body.data;
}

/** Exchanges the stored opaque refresh token for a fresh access token + rotated refresh token,
 *  via the existing `POST /auth/refresh`. Never called for a preview token (see `isPreviewToken`). */
export async function refreshAccessToken(
  apiBaseUrl: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    throw new AuthRequestError(err instanceof Error ? err.message : 'Network error refreshing token');
  }
  if (!res.ok) {
    throw new AuthRequestError(`Failed to refresh token: ${res.status}`, res.status);
  }
  const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
  return body.data;
}

export type { BootstrapResponse };
