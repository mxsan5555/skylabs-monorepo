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
}

export function authStorageKeys(appPrefix: string): AuthStorageKeys {
  return {
    token: `${appPrefix}_auth_token`,
    realToken: `${appPrefix}_auth_real_token`,
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

/** Fetches the permission/menu/dashboard bundle right after login, and again whenever the app wants a fresh read of the caller's current access (e.g. after a token refresh). */
export async function fetchBootstrap(apiBaseUrl: string, token: string): Promise<BootstrapResponse> {
  const res = await fetch(`${apiBaseUrl}/rbac/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to load /rbac/bootstrap: ${res.status}`);
  }
  const body = (await res.json()) as { data: BootstrapResponse };
  return body.data;
}

export type { BootstrapResponse };
