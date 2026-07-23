import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserRole } from '../types';
import { readToken, writeToken } from './auth-storage';

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
 * App-wide auth state for msd: bearer token + the user's access roles.
 *
 * Roles will come from the backend JWT; until then they're stored locally and
 * can be swapped via the sidebar "View as" switcher (setRoles) to preview each
 * persona. Route guards and the menu read `roles`; the backend must re-check
 * roles on every request once it exists.
 */
interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  roles: UserRole[];
  hasRole: (allowed: UserRole[]) => boolean;
  setRoles: (roles: UserRole[]) => void;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [roles, setRolesState] = useState<UserRole[]>(() => readRoles());

  const setRoles = useCallback((next: UserRole[]) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ROLES_KEY, JSON.stringify(next));
    }
    setRolesState(next);
  }, []);

  const signIn = useCallback(
    (next: string) => {
      writeToken(next);
      setToken(next);
      // New sessions start as a basic user; real roles arrive from the backend.
      if (readRoles().length === 0) setRoles(['user']);
    },
    [setRoles],
  );

  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);

  const hasRole = useCallback(
    (allowed: UserRole[]) => allowed.some((r) => roles.includes(r)),
    [roles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      isAuthenticated: !!token,
      roles,
      hasRole,
      setRoles,
      signIn,
      signOut,
    }),
    [token, roles, hasRole, setRoles, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
