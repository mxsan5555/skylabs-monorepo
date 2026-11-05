import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { signInPathWithReturnTo } from '../auth/role-routing';

/**
 * Guard for actions that need an account (cart, wishlist): returns `true` for a signed-in visitor;
 * otherwise sends them to sign in, back to this page afterwards, and returns `false`.
 */
export function useRequireSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  return useCallback(() => {
    if (isAuthenticated) return true;
    navigate(signInPathWithReturnTo(location));
    return false;
  }, [isAuthenticated, navigate, location]);
}
