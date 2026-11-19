import {
  authStorageKeys,
  AuthRequestError,
  isJwtExpired,
  readStorageValue,
  resolveInitialToken,
  writeStorageValue,
} from '../index';

export interface TokenStore {
  getToken(): string | null;
  setToken(token: string | null): void;
  subscribe(listener: (token: string | null) => void): () => void;
  refresh(): Promise<string | null>;
  logout(): Promise<void>;
}

function withLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { locks?: LockManager };
  return nav?.locks ? nav.locks.request(name, () => operation()) as unknown as Promise<T> : operation();
}

const stores = new Map<string, TokenStore>();

export function getTokenStore(appPrefix: string, apiBaseUrl: string): TokenStore {
  const existing = stores.get(appPrefix);
  if (existing) return existing;

  const keys = authStorageKeys(appPrefix);
  resolveInitialToken(keys);
  writeStorageValue(keys.refreshToken, null);
  const listeners = new Set<(token: string | null) => void>();
  let current = readStorageValue(keys.token);
  let csrfToken: string | null = null;
  let generation = 0;
  let inFlight: Promise<string | null> | null = null;

  function notify(token: string | null): void {
    listeners.forEach((listener) => listener(token));
  }

  function setToken(token: string | null): void {
    current = token;
    generation += 1;
    if (!token) csrfToken = null;
    writeStorageValue(keys.token, token);
    notify(token);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === keys.token) {
        current = event.newValue;
        generation += 1;
        if (!current) csrfToken = null;
        notify(current);
      }
    });
  }

  async function getCsrfToken(): Promise<string> {
    if (csrfToken) return csrfToken;

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/auth/csrf`, {
        credentials: 'include',
        cache: 'no-store',
      });
    } catch (error) {
      throw new AuthRequestError(error instanceof Error ? error.message : 'Network error loading CSRF token');
    }

    if (!response.ok) {
      throw new AuthRequestError(`Failed to load CSRF token: ${response.status}`, response.status);
    }

    const body = (await response.json()) as { data: { csrfToken: string } };
    csrfToken = body.data.csrfToken;
    return csrfToken;
  }

  async function doRefresh(): Promise<string | null> {
    const csrf = await getCsrfToken();
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
      });
    } catch (error) {
      throw new AuthRequestError(error instanceof Error ? error.message : 'Network error refreshing token');
    }

    if (response.status === 401 || response.status === 403) {
      setToken(null);
      csrfToken = null;
      return null;
    }
    if (!response.ok) {
      throw new AuthRequestError(`Failed to refresh token: ${response.status}`, response.status);
    }

    const body = (await response.json()) as { data: { accessToken: string } };
    setToken(body.data.accessToken);
    return body.data.accessToken;
  }

  function refresh(): Promise<string | null> {
    if (!inFlight) {
      const tokenAtRequest = current;
      const generationAtRequest = generation;
      inFlight = withLock(`${appPrefix}-auth-refresh`, async () => {
        // Another tab may have completed the one-time refresh while this tab waited for the lock.
        // Re-read shared storage inside the lock to avoid replaying the old refresh cookie.
        const latest = readStorageValue(keys.token);
        if (generation !== generationAtRequest) {
          return current && !isJwtExpired(current) ? current : null;
        }
        if (latest !== tokenAtRequest) {
          current = latest;
          generation += 1;
          notify(latest);
          return latest && !isJwtExpired(latest) ? latest : null;
        }
        return doRefresh();
      }).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  async function logout(): Promise<void> {
    setToken(null);
    writeStorageValue(keys.refreshToken, null);
    try {
      const csrf = await getCsrfToken();
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
      });
    } catch {
      // Local sign-out must still complete if the API is unavailable.
    } finally {
      csrfToken = null;
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
