import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context';

/** Shown while `AuthProvider` is still trying to restore a session (initial mount, or the
 *  silent cookie-based refresh a missing/expired access token triggers — see
 *  auth-context.tsx's mount effect) — a blank screen reads as broken, and rendering nothing
 *  long enough risks looking identical to a slow redirect; this makes the wait visible instead
 *  of letting a visitor see a flash of the sign-in page for a session that's actually still
 *  valid. */
function AuthLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}
    >
      <span>Loading…</span>
    </div>
  );
}

export function RequireAuth({
  children,
  signInPath = '/sign-in',
}: {
  children: ReactNode;
  signInPath?: string;
}) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!isAuthenticated) {
    return <Navigate to={signInPath} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
