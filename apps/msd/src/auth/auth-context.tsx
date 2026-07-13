import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User, UserRole } from '../types';
import { readToken, writeToken } from './auth-storage';
import { apiClient } from '../api/api-client';

const ROLES_KEY = 'msd_auth_roles';

function readRoles(): UserRole[] {
  if (typeof localStorage === 'undefined') return ['user'];
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    return raw ? (JSON.parse(raw) as UserRole[]) : ['user'];
  } catch {
    return ['user'];
  }
}

/**
 * App-wide auth state for msd: bearer token, roles, and the signed-in user.
 *
 * `signIn` receives roles + user straight from msd-api's OTP-verify/exchange
 * response; `roles` is also refreshed from `GET /me` on boot. The sidebar's
 * "View as" switcher (setRoles) can still override roles locally to preview a
 * persona — route guards and the menu read `roles` either way, but msd-api
 * re-checks the real role from the JWT on every request, so the switcher
 * cannot grant real access, only change what the UI shows.
 */
interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  roles: UserRole[];
  user: User | null;
  hasRole: (allowed: UserRole[]) => boolean;
  setRoles: (roles: UserRole[]) => void;
  signIn: (token: string, roles: UserRole[], user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [roles, setRolesState] = useState<UserRole[]>(() => readRoles());
  const [user, setUser] = useState<User | null>(null);

  const setRoles = useCallback((next: UserRole[]) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ROLES_KEY, JSON.stringify(next));
    }
    setRolesState(next);
  }, []);

  const signIn = useCallback(
    (next: string, nextRoles: UserRole[], nextUser: User) => {
      writeToken(next);
      setToken(next);
      setRoles(nextRoles);
      setUser(nextUser);
    },
    [setRoles],
  );

  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (allowed: UserRole[]) => allowed.some((r) => roles.includes(r)),
    [roles],
  );

  // Rehydrate the user profile (and confirm roles are current) on app boot,
  // since only the token — not the user object — survives a page reload.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient
      .get<User>('/me')
      .then((freshUser) => {
        if (cancelled) return;
        setUser(freshUser);
        setRoles(freshUser.roles);
      })
      .catch(() => {
        // Invalid/expired token — drop the stale session rather than leave a
        // token that guards will treat as authenticated but /me rejects.
        if (!cancelled) signOut();
      });
    return () => {
      cancelled = true;
    };
    // Only re-run when the token itself changes (sign-in/out), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: !!token,
      roles,
      user,
      hasRole,
      setRoles,
      signIn,
      signOut,
    }),
    [token, roles, user, hasRole, setRoles, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
