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
  readSessionValue,
  readStorageValue,
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
  /** `refreshToken` is accepted for source compatibility with existing call sites but ignored —
   *  the server sets the refresh token as an HttpOnly cookie directly (see
   *  apps/msd-api/src/lib/auth-cookies.ts), it never reaches page JS at all. */
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
  const tokenStore = useMemo(() => getTokenStore(appPrefix, apiBaseUrl), [appPrefix, apiBaseUrl]);
  const [token, setTokenState] = useState<string | null>(() => tokenStore.getToken());
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  // Always starts true: even with no (or an expired) access token in localStorage, a valid
  // persistent session may still exist as the HttpOnly refresh cookie — the mount effect below
  // must get a chance to try it (silent refresh) before anything decides the visitor is signed
  // out. This is what makes "signed in across a browser restart" work, not just "across a
  // refresh while the 15-minute access token is still fresh."
  const [loading, setLoading] = useState(true);

  const setToken = useCallback(
    (next: string | null) => {
      tokenStore.setToken(next);
      setTokenState(next);
    },
    [tokenStore],
  );

  // Lets `loadBootstrap` fall back to the real token when a preview is refused.
  const loadBootstrapRef = useRef<(nextToken: string) => Promise<void>>(async () => undefined);
  const loadBootstrap = useCallback(
    async (nextToken: string, opts: { silent?: boolean } = {}) => {
      // `silent` skips the `loading` flip — `RequireAuth` renders a full-page placeholder
      // instead of `children` for as long as `loading` is true (see its own doc comment), which
      // is correct for the *initial* session restore but would otherwise replace whatever the
      // user is looking at with a spinner on every background refresh too (see the proactive
      // token-refresh effect below, which calls this silently every ~15 minutes so an active
      // session's permissions don't go stale for its entire duration).
      if (!opts.silent) setLoading(true);
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
        if ((status === 401 || status === 403) && isPreviewToken(nextToken)) {
          // An expired or revoked preview ends the preview, not the Super Admin's own session.
          writeSessionValue(keys.previewToken, null);
          const real = readStorageValue(keys.token);
          setToken(real);
          if (real) await loadBootstrapRef.current(real);
          else setBootstrap(null);
        } else if (status === 401 || status === 403) {
          setBootstrap(null);
          setToken(null);
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [apiBaseUrl, setToken],
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

    const current = tokenStore.getToken();
    if (current && !isJwtExpired(current)) {
      loadBootstrap(current);
      return;
    }
    // No usable access token locally (missing, or expired — including a page loaded after a
    // browser/computer restart days later). Never attempted for a "Login As" preview token:
    // those are fixed-lifetime by design (see CLAUDE.md's Login As section) and the refresh
    // cookie underneath still belongs to the real SuperAdmin session, not the preview — ending
    // a preview must just end it, not silently fall back to the real account.
    if (current && isPreviewToken(current)) {
      setToken(null);
      setLoading(false);
      return;
    }
    tokenStore
      .refresh()
      .then((refreshed) => {
        if (refreshed) {
          setTokenState(refreshed);
          return loadBootstrap(refreshed);
        }
        setLoading(false);
      })
      .catch(() => {
        // Transient (network/5xx) failure on the very first silent refresh attempt — nothing
        // local to preserve (there was no valid token to begin with), so this just falls through
        // to "not authenticated for now"; RequireAuth sends them to sign-in same as any other
        // signed-out visit, and a real connectivity blip won't have burned the refresh cookie
        // (it's still sitting there for the next attempt, e.g. a manual reload).
        setLoading(false);
      });
    // Only re-run when the provider mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync: another tab's refresh/sign-in/sign-out writes the shared localStorage key,
  // and the token store's own `storage` listener picks it up and notifies every subscriber in
  // this tab — mirror that straight into this tab's React state instead of each tab refreshing
  // independently (which would race the single-use refresh cookie — see token-store.ts).
  useEffect(() => {
    return tokenStore.subscribe((next) => setTokenState(next));
  }, [tokenStore]);

  const signIn = useCallback(
    async (nextToken: string) => {
      setToken(nextToken);
      await loadBootstrap(nextToken);
    },
    [setToken, loadBootstrap],
  );

  /** Revokes the refresh token on the server (best effort), then clears every token, any
   *  preview and the bootstrap, whatever the server answered (P10-38). */
  const signOut = useCallback(() => {
    writeStorageValue(keys.realToken, null);
    setBootstrap(null);
    setTokenState(null);
    void tokenStore.logout();
  }, [keys.realToken, tokenStore]);

  const refreshBootstrap = useCallback(async () => {
    if (token) await loadBootstrap(token);
  }, [token, loadBootstrap]);

  // Proactively renews the access token ~60s before it expires via the HttpOnly refresh cookie,
  // so a session outlives the 15-minute access-token TTL instead of the app silently going
  // "logged in but broken" (or getting force-logged-out) once it lapses. Never armed for a
  // preview ("Login As") token — see the mount effect's own note on why.
  //
  // Also the one place a long-lived, already-open session picks up a role-permission change:
  // without the silent `loadBootstrap` below, `bootstrap` (and therefore the sidebar and every
  // `can()` check) stayed frozen at whatever it was at the last sign-in for as long as the tab
  // stayed open — a Role Permission Matrix save could never reach an already-signed-in holder of
  // that role until they manually signed out and back in. `silent: true` so this doesn't flip
  // the shared `loading` flag `RequireAuth` uses to show a full-page placeholder (see
  // `loadBootstrap`'s own doc comment) — this is a background refresh, never the initial restore.
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
          // The refresh cookie itself is invalid/expired/revoked — nothing left to recover,
          // this is a genuine end of session.
          setBootstrap(null);
          setTokenState(null);
        }
      } catch {
        // Transient (network/5xx) failure — leave the still-unexpired-for-a-few-more-seconds
        // token in place rather than forcing a sign-out; the next proactive attempt (or a
        // 401-triggered retry at the API call layer) gets another chance.
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
      writeStorageValue(keys.realToken, token);
      setToken(body.data.previewToken);
      await loadBootstrap(body.data.previewToken);
    },
    [apiBaseUrl, token, keys.realToken, setToken, loadBootstrap],
  );

  const returnToSuperAdmin = useCallback(async () => {
    const realToken = readStorageValue(keys.realToken);
    if (!realToken) return;
    writeStorageValue(keys.realToken, null);
    setToken(realToken);
    await loadBootstrap(realToken);
  }, [keys.realToken, setToken, loadBootstrap]);

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
