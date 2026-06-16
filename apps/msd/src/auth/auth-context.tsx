import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readToken, writeToken } from './auth-storage';

/**
 * App-wide auth state for msd.
 *
 * Holds the bearer token (persisted via auth-storage) and exposes signIn /
 * signOut. The real sign-in/otp pages will call signIn(token) once the auth
 * API exists; for now it's a thin, testable wrapper around token storage.
 */
interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readToken());

  const signIn = useCallback((next: string) => {
    writeToken(next);
    setToken(next);
  }, []);

  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, isAuthenticated: !!token, signIn, signOut }),
    [token, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
