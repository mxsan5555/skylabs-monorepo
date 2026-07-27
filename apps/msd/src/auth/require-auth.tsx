import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context';

/**
 * Route guard. Wrap protected routes (admin, profile) so unauthenticated users
 * are redirected to sign-in, preserving where they came from.
 *
 * @example
 * <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
