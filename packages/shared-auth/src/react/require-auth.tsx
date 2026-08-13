import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context';

export function RequireAuth({
  children,
  signInPath = '/sign-in',
}: {
  children: ReactNode;
  signInPath?: string;
}) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!isAuthenticated) {
    return <Navigate to={signInPath} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
