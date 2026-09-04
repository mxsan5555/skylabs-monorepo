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
  refreshAccessToken,
  writeStorageValue,
} from '../index';

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
  const [token, setToken] = useState<string | null>(() => readStorageValue(keys.token));
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);

  const loadBootstrap = useCallback(
    async (nextToken: string) => {
      setLoading(true);
      try {
        const data = await fetchBootstrap(apiBaseUrl, nextToken);
        setBootstrap(data);
      } catch (err) {
        // Only a genuine auth failure (401/403 — the token is actually invalid, expired
        // server-side, or revoked) is a real "session ended" — sign out. A network blip, 5xx,
        // or any other transient failure must NOT clear an otherwise-valid token: doing so
        // unconditionally here is what was auto-logging users out shortly after a perfectly
        // successful login whenever the bootstrap fetch hit any transient error (see the mount
        // effect below, which used to fire this same call twice under React StrictMode).
        const status = err instanceof AuthRequestError ? err.status : undefined;
        if (status === 401 || status === 403) {
          setBootstrap(null);
          setToken(null);
          writeStorageValue(keys.token, null);
          writeStorageValue(keys.refreshToken, null);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, keys.token, keys.refreshToken],
  );

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
    } else if (token) {
      // Token exists but is already expired per its own claim — a genuine expired session,
      // not a transient failure, so clear it instead of leaving isAuthenticated true forever
      // with no bootstrap data ever loading.
      setToken(null);
      writeStorageValue(keys.token, null);
      writeStorageValue(keys.refreshToken, null);
      setLoading(false);
    } else {
      setLoading(false);
    }
    // Only re-run when the provider mounts with a stored token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (nextToken: string, nextRefreshToken?: string) => {
      writeStorageValue(keys.token, nextToken);
      writeStorageValue(keys.refreshToken, nextRefreshToken ?? null);
      setToken(nextToken);
      await loadBootstrap(nextToken);
    },
    [keys.token, keys.refreshToken, loadBootstrap],
  );

  const signOut = useCallback(() => {
    writeStorageValue(keys.token, null);
    writeStorageValue(keys.realToken, null);
    writeStorageValue(keys.refreshToken, null);
    setToken(null);
    setBootstrap(null);
  }, [keys.token, keys.realToken, keys.refreshToken]);

  const refreshBootstrap = useCallback(async () => {
    if (token) await loadBootstrap(token);
  }, [token, loadBootstrap]);

  // Proactively renews the access token ~60s before it expires using the stored opaque
  // refresh token, so a session outlives the 15-minute access-token TTL instead of the app
  // silently going "logged in but broken" (or getting force-logged-out) once it lapses. Never
  // armed for a preview ("Login As") token — those are fixed-lifetime by design (see
  // CLAUDE.md's Login As section) and have no refresh token to use.
  useEffect(() => {
    if (!token || isPreviewToken(token)) return;
    const storedRefreshToken = readStorageValue(keys.refreshToken);
    if (!storedRefreshToken) return;

    const delay = msUntilJwtExpiry(token);
    const timer = setTimeout(async () => {
      try {
        const rotated = await refreshAccessToken(apiBaseUrl, storedRefreshToken);
        writeStorageValue(keys.token, rotated.accessToken);
        writeStorageValue(keys.refreshToken, rotated.refreshToken);
        setToken(rotated.accessToken);
      } catch {
        // The refresh token itself is invalid/expired/revoked — nothing left to recover, this
        // is a genuine end of session.
        writeStorageValue(keys.token, null);
        writeStorageValue(keys.refreshToken, null);
        setToken(null);
        setBootstrap(null);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [token, apiBaseUrl, keys.token, keys.refreshToken]);

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
      writeStorageValue(keys.realToken, token);
      writeStorageValue(keys.token, body.data.previewToken);
      setToken(body.data.previewToken);
      await loadBootstrap(body.data.previewToken);
    },
    [apiBaseUrl, token, keys.realToken, keys.token, loadBootstrap],
  );

  const returnToSuperAdmin = useCallback(async () => {
    const realToken = readStorageValue(keys.realToken);
    if (!realToken) return;
    writeStorageValue(keys.realToken, null);
    writeStorageValue(keys.token, realToken);
    setToken(realToken);
    await loadBootstrap(realToken);
  }, [keys.realToken, keys.token, loadBootstrap]);

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
