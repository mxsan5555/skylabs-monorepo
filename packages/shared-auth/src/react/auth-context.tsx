import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BootstrapResponse, PermissionAction } from '@skylabs-monorepo/shared-types';
import { can as canPermission } from '@skylabs-monorepo/shared-permissions';
import {
  AuthRequestError,
  authStorageKeys,
  fetchBootstrap,
  isJwtExpired,
  isPreviewToken,
  msUntilJwtExpiry,
  readStorageValue,
  resolveInitialToken,
  writeSessionValue,
  writeStorageValue,
} from '../index';
import { getTokenStore } from './token-store';

export interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  bootstrap: BootstrapResponse | null;
  loading: boolean;
  isPreviewing: boolean;
  can: (menuKey: string, action?: PermissionAction) => boolean;
  signIn: (token: string, refreshToken?: string) => Promise<void>;
  signOut: () => void;
  refreshBootstrap: () => Promise<void>;
  loginAsUser: (targetUserId: string) => Promise<void>;
  returnToSuperAdmin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  appPrefix,
  apiBaseUrl,
  children,
}: {
  appPrefix: string;
  apiBaseUrl: string;
  children: ReactNode;
}) {
  const keys = useMemo(() => authStorageKeys(appPrefix), [appPrefix]);
  const initialToken = useMemo(() => resolveInitialToken(keys), [keys]);
  const tokenStore = useMemo(() => getTokenStore(appPrefix, apiBaseUrl), [appPrefix, apiBaseUrl]);
  const [token, setTokenState] = useState<string | null>(() => initialToken ?? tokenStore.getToken());
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const setToken = useCallback(
    (nextToken: string | null) => {
      if (nextToken && isPreviewToken(nextToken)) {
        writeSessionValue(keys.previewToken, nextToken);
        setTokenState(nextToken);
        return;
      }
      writeSessionValue(keys.previewToken, null);
      tokenStore.setToken(nextToken);
      setTokenState(nextToken);
    },
    [keys.previewToken, tokenStore],
  );

  const loadBootstrapRef = useRef<(nextToken: string) => Promise<void>>(async () => undefined);
  const loadBootstrap = useCallback(
    async (nextToken: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        let data: BootstrapResponse;
        try {
          data = await fetchBootstrap(apiBaseUrl, nextToken);
        } catch (err) {
          const status = err instanceof AuthRequestError ? err.status : undefined;
          if (status !== 401 || isPreviewToken(nextToken)) throw err;

          const refreshed = await tokenStore.refresh();
          if (!refreshed) {
            setBootstrap(null);
            setToken(null);
            return;
          }
          setTokenState(refreshed);
          data = await fetchBootstrap(apiBaseUrl, refreshed);
        }
        setBootstrap(data);
      } catch (err) {
        // Only a genuine auth failure (401/403 — the token is actually invalid, expired
        // server-side, or revoked) is a real "session ended" — sign out. A network blip, 5xx,
        // or any other transient failure must NOT clear an otherwise-valid token: doing so
        // unconditionally here is what was auto-logging users out shortly after a perfectly
        // successful login whenever the bootstrap fetch hit any transient error (see the mount
        // effect below, which used to fire this same call twice under React StrictMode).
        const status = err instanceof AuthRequestError ? err.status : undefined;
        if ((status === 401 || status === 403) && isPreviewToken(nextToken)) {
          writeSessionValue(keys.previewToken, null);
          const realToken = tokenStore.getToken() ?? readStorageValue(keys.token);
          if (realToken) {
            setTokenState(realToken);
            await loadBootstrapRef.current(realToken);
          } else {
            setToken(null);
            setBootstrap(null);
          }
        } else if (status === 401 || status === 403) {
          setBootstrap(null);
          setToken(null);
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [apiBaseUrl, keys.previewToken, keys.token, setToken, tokenStore],
  );
  loadBootstrapRef.current = loadBootstrap;

  // Guards against React StrictMode's dev-only double-invoke of this effect, which previously
  // fired two concurrent /rbac/bootstrap requests on every mount/reload — a real race where
  // whichever call settled last won, so a transient failure on the second call could wipe out
  // the valid session the first call had just established.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (token && !isJwtExpired(token)) {
      loadBootstrap(token);
    } else if (token && isPreviewToken(token)) {
      setToken(null);
      setLoading(false);
    } else {
      tokenStore
        .refresh()
        .then((refreshed) => {
          if (refreshed) {
            setTokenState(refreshed);
            return loadBootstrap(refreshed);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
    // Only re-run when the provider mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      tokenStore.subscribe((nextToken) => {
        writeSessionValue(keys.previewToken, null);
        setTokenState(nextToken);
      }),
    [keys.previewToken, tokenStore],
  );

  const signIn = useCallback(
    async (nextToken: string) => {
      setToken(nextToken);
      await loadBootstrap(nextToken);
    },
    [setToken, loadBootstrap],
  );

  const signOut = useCallback(() => {
    writeStorageValue(keys.realToken, null);
    writeSessionValue(keys.previewToken, null);
    setTokenState(null);
    setBootstrap(null);
    void tokenStore.logout();
  }, [keys.realToken, keys.previewToken, tokenStore]);

  const refreshBootstrap = useCallback(async () => {
    if (token) await loadBootstrap(token);
  }, [token, loadBootstrap]);

  // Proactively renews the access token ~60s before it expires using the HttpOnly refresh cookie,
  // so a session outlives the access-token TTL instead of the app
  // silently going "logged in but broken" (or getting force-logged-out) once it lapses. Never
  // armed for a preview ("Login As") token — those are fixed-lifetime by design (see
  // CLAUDE.md's Login As section) and have no refresh session of their own.
  useEffect(() => {
    if (!token || isPreviewToken(token)) return;
    const delay = msUntilJwtExpiry(token);
    const timer = setTimeout(async () => {
      try {
        const refreshed = await tokenStore.refresh();
        if (refreshed) {
          setTokenState(refreshed);
          await loadBootstrap(refreshed, { silent: true });
        } else {
          setBootstrap(null);
          setTokenState(null);
        }
      } catch {
        // A transient failure leaves the current token in place for the next API request to retry.
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [token, tokenStore, loadBootstrap]);

  const loginAsUser = useCallback(
    async (targetUserId: string) => {
      if (!token) return;
      const res = await fetch(`${apiBaseUrl}/rbac/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId }),
      });
      if (!res.ok) throw new Error(`Failed to start preview: ${res.status}`);
      const body = (await res.json()) as { data: { previewToken: string } };
      setToken(body.data.previewToken);
      await loadBootstrap(body.data.previewToken);
    },
    [apiBaseUrl, token, setToken, loadBootstrap],
  );

  const returnToSuperAdmin = useCallback(async () => {
    writeSessionValue(keys.previewToken, null);
    const realToken = tokenStore.getToken() ?? readStorageValue(keys.token);
    if (!realToken) {
      setToken(null);
      setBootstrap(null);
      return;
    }
    setTokenState(realToken);
    if (isJwtExpired(realToken)) {
      const refreshed = await tokenStore.refresh();
      if (refreshed) {
        setTokenState(refreshed);
        await loadBootstrap(refreshed);
      }
      return;
    }
    await loadBootstrap(realToken);
  }, [keys.previewToken, keys.token, tokenStore, setToken, loadBootstrap]);

  const can = useCallback(
    (menuKey: string, action: PermissionAction = 'view') =>
      canPermission(bootstrap?.permissions ?? [], menuKey, action),
    [bootstrap],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: !!token,
      bootstrap,
      loading,
      isPreviewing: !!bootstrap?.preview?.isPreview,
      can,
      signIn,
      signOut,
      refreshBootstrap,
      loginAsUser,
      returnToSuperAdmin,
    }),
    [token, bootstrap, loading, can, signIn, signOut, refreshBootstrap, loginAsUser, returnToSuperAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
