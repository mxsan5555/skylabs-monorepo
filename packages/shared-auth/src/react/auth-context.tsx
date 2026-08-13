import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { BootstrapResponse, PermissionAction } from '@skylabs-monorepo/shared-types';
import { can as canPermission } from '@skylabs-monorepo/shared-permissions';
import {
  authStorageKeys,
  fetchBootstrap,
  isJwtExpired,
  readStorageValue,
  writeStorageValue,
} from '../index';

export interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  bootstrap: BootstrapResponse | null;
  loading: boolean;
  isPreviewing: boolean;
  can: (menuKey: string, action?: PermissionAction) => boolean;
  signIn: (token: string) => Promise<void>;
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
      } catch {
        setBootstrap(null);
        setToken(null);
        writeStorageValue(keys.token, null);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, keys.token],
  );

  useEffect(() => {
    if (token && !isJwtExpired(token)) {
      loadBootstrap(token);
    } else {
      setLoading(false);
    }
    // Only re-run when the provider mounts with a stored token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (nextToken: string) => {
      writeStorageValue(keys.token, nextToken);
      setToken(nextToken);
      await loadBootstrap(nextToken);
    },
    [keys.token, loadBootstrap],
  );

  const signOut = useCallback(() => {
    writeStorageValue(keys.token, null);
    writeStorageValue(keys.realToken, null);
    setToken(null);
    setBootstrap(null);
  }, [keys.token, keys.realToken]);

  const refreshBootstrap = useCallback(async () => {
    if (token) await loadBootstrap(token);
  }, [token, loadBootstrap]);

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
