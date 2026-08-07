import type { ButtonHTMLAttributes } from 'react';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { useAuth } from './auth-context';

/** Renders nothing if the current user lacks `${menuKey}:${action}` — for gating a single button/action, not a whole page. */
export function PermissionButton({
  menuKey,
  action = 'view',
  ...buttonProps
}: {
  menuKey: string;
  action?: PermissionAction;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { can } = useAuth();
  if (!can(menuKey, action)) return null;
  return <button {...buttonProps} />;
}
