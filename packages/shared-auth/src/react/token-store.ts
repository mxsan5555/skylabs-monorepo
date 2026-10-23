import { authStorageKeys, readStorageValue, writeStorageValue, AuthRequestError } from '../index';

/**
 * Plain (non-React) singleton holding the live access token + the cookie-based refresh
 * coordination for the persistent-login flow. Lives outside React so both `AuthProvider`
 * (mirrors it into context state) and a plain fetch wrapper like msd's `api/rbac/client.ts`
 * (401-retry-once) can share exactly one in-flight refresh instead of each racing the server's
 * single-use refresh cookie independently — a second concurrent rotation of the same cookie
 * reads as a replay server-side and revokes the whole session (see
 * apps/msd-api/src/services/token.service.ts#rotateRefreshToken).
 *
 * The refresh token itself is never seen here — it's an HttpOnly cookie the browser attaches
 * automatically; this module only ever holds the short-lived access token (same as before,
 * still in localStorage — only the long-lived refresh credential moved out of it) plus the
 * paired CSRF cookie's value (JS-readable by design, see apps/msd-api/src/lib/auth-cookies.ts).
 */

export interface TokenStore {
  getToken(): string | null;
  setToken(token: string | null): void;
  subscribe(listener: (token: string | null) => void): () => void;
  /** Cookie-based refresh, de-duplicated within this tab and coordinated across tabs (Web Locks
   *  API where available). Resolves the new access token on success, `null` on a definitive
   *  "no session"/"session invalid" response, and throws `AuthRequestError` on a transient
   *  (network/5xx) failure so callers can tell the two apart. */
  refresh(): Promise<string | null>;
  /** Best-effort server-side revoke + cookie clear, then clears local state regardless of
   *  whether the network call succeeds (a flaky network must not block signing out locally). */
  logout(): Promise<void>;
}

const CSRF_COOKIE_NAME = 'msd_csrf_token';

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }) : undefined;
  if (nav?.locks) {
    // lib.dom.d.ts's `LockGrantedCallback<T>` types the callback as returning `T`, not
    // `T | PromiseLike<T>` — the real Web Locks spec flattens a returned promise same as any
    // other promise-returning callback (and every browser's actual implementation does), so
    // this is a stale ambient type, not a real double-Promise at runtime.
    return nav.locks.request(name, () => fn()) as unknown as Promise<T>;
  }
  return fn();
}

const stores = new Map<string, TokenStore>();

export function getTokenStore(appPrefix: string, apiBaseUrl: string): TokenStore {
  const existing = stores.get(appPrefix);
  if (existing) return existing;

  const keys = authStorageKeys(appPrefix);
  const listeners = new Set<(token: string | null) => void>();
  let current: string | null = readStorageValue(keys.token);
  let inFlight: Promise<string | null> | null = null;

  function setToken(token: string | null): void {
    current = token;
    writeStorageValue(keys.token, token);
    listeners.forEach((listener) => listener(token));
  }

  if (typeof window !== 'undefined') {
    // Fires only in OTHER tabs than the one that wrote the value — exactly what we want: the
    // writing tab already updated its own React state directly, this is purely for siblings.
    window.addEventListener('storage', (event) => {
      if (event.key === keys.token) {
        current = event.newValue;
        listeners.forEach((listener) => listener(current));
      }
    });
  }

  async function doRefresh(): Promise<string | null> {
    const csrf = readCsrfCookie();
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      });
    } catch (err) {
      throw new AuthRequestError(err instanceof Error ? err.message : 'Network error refreshing token');
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        setToken(null);
        return null;
      }
      throw new AuthRequestError(`Failed to refresh token: ${res.status}`, res.status);
    }
    const body = (await res.json()) as { data: { accessToken: string } };
    setToken(body.data.accessToken);
    return body.data.accessToken;
  }

  function refresh(): Promise<string | null> {
    if (!inFlight) {
      inFlight = withLock(`${appPrefix}-auth-refresh`, doRefresh).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  async function logout(): Promise<void> {
    const csrf = readCsrfCookie();
    const tokenAtLogout = current;
    setToken(null);
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(tokenAtLogout ? { Authorization: `Bearer ${tokenAtLogout}` } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      });
    } catch {
      // Local state is already cleared above — a flaky network here must not block sign-out.
    }
  }

  const store: TokenStore = {
    getToken: () => current,
    setToken,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    logout,
  };
  stores.set(appPrefix, store);
  return store;
}
