import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { useAuth } from './auth-context';

/**
 * Route guard for a single `${menuKey}:${action}` permission — replaces the old
 * hardcoded `<RequireRole roles={['admin']}>`. This is a UX convenience only; every
 * API request the page makes is re-checked server-side by `requirePermission`.
 */
export function RequirePermission({
  menuKey,
  action = 'view',
  fallbackPath = '/account/profile',
  children,
}: {
  menuKey: string;
  action?: PermissionAction;
  fallbackPath?: string;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(menuKey, action)) {
    return <Navigate to={fallbackPath} replace />;
  }
  return <>{children}</>;
}
