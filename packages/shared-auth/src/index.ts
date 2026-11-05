import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';

/**
 * Framework-agnostic auth core shared by `./react` (msd-admin, msd) and `./angular`
 * (mera-driver). Each *app* still keeps its own storage keys/prefix and its own token —
 * there is no shared session between apps, only shared logic.
 */

export interface AuthStorageKeys {
  /** The live bearer token the app sends on every request. */
  token: string;
  /** Legacy: older builds stashed the real SuperAdmin token here during a preview. Only read to
   *  migrate such a session, then cleared. */
  realToken: string;
  /** A "Login As" preview token, in sessionStorage only: it never outlives its tab and never
   *  replaces the real token in localStorage (P10-38). */
  previewToken: string;
  /** The rotated opaque refresh token paired with `token` — absent for preview tokens (a
   *  "Login As" preview is never refreshed; see CLAUDE.md's Login As section). */
  refreshToken: string;
}

export function authStorageKeys(appPrefix: string): AuthStorageKeys {
  return {
    token: `${appPrefix}_auth_token`,
    realToken: `${appPrefix}_auth_real_token`,
    refreshToken: `${appPrefix}_auth_refresh_token`,
    previewToken: `${appPrefix}_auth_preview_token`,
  };
}

type StorageKind = 'localStorage' | 'sessionStorage';

/** The browser storage, or null outside a browser (server rendering, tests without jsdom). */
function safeStorage(kind: StorageKind): Storage | null {
  return typeof globalThis[kind] === 'undefined' ? null : globalThis[kind];
}

function readValue(kind: StorageKind, key: string): string | null {
  return safeStorage(kind)?.getItem(key) ?? null;
}

/** Writes `value`, or removes the key when `value` is null or empty. */
function writeValue(kind: StorageKind, key: string, value: string | null): void {
  const storage = safeStorage(kind);
  if (!storage) return;
  if (value) storage.setItem(key, value);
  else storage.removeItem(key);
}

export const readStorageValue = (key: string) => readValue('localStorage', key);
export const writeStorageValue = (key: string, value: string | null) => writeValue('localStorage', key, value);

/** Tab-scoped value (sessionStorage): gone when the tab closes, never seen by other tabs. */
export const readSessionValue = (key: string) => readValue('sessionStorage', key);
export const writeSessionValue = (key: string, value: string | null) => writeValue('sessionStorage', key, value);

/** The token this tab starts with: a live "Login As" preview from sessionStorage, else the real
 *  token from localStorage. Drops an expired preview, and moves a preview that an older build
 *  left in localStorage back out of the way (P10-38). */
export function resolveInitialToken(keys: AuthStorageKeys): string | null {
  const preview = readSessionValue(keys.previewToken);
  if (preview && !isJwtExpired(preview)) return preview;
  if (preview) writeSessionValue(keys.previewToken, null);
  const stored = readStorageValue(keys.token);
  if (stored && isPreviewToken(stored)) {
    const real = readStorageValue(keys.realToken);
    writeStorageValue(keys.token, real);
    writeStorageValue(keys.realToken, null);
    return real;
  }
  return stored;
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

/** Best-effort server sign-out: revokes `refreshToken` via `POST /auth/logout`. Never throws;
 *  the caller clears local state either way. */
export async function revokeSession(apiBaseUrl: string, accessToken: string, refreshToken: string): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    });
  } catch {
    // Offline or server down: the refresh token simply expires on its own.
  }
}

export type { BootstrapResponse };
