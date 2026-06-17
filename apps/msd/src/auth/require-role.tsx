import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { UserRole } from '../types';
import { useAuth } from './auth-context';

/**
 * Role guard. Use inside an already-authenticated area: renders children only
 * if the user holds one of `roles`, otherwise sends them back to their profile.
 * UX only — the API must re-check the role server-side.
 *
 * @example
 * <RequireRole roles={['admin']}><DealsPage /></RequireRole>
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: ReactNode;
}) {
  const { hasRole } = useAuth();
  if (!hasRole(roles)) {
    return <Navigate to="/account/profile" replace />;
  }
  return <>{children}</>;
}
