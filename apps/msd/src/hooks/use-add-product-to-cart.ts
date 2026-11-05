import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { addCartItem } from '../api/cart';
import { ApiRequestError } from '../api/rbac/client';
import { showSnackbar } from '../snackbar/snackbar';
import { useRequireSignIn } from './use-require-sign-in';
import { fillTemplate } from '../utils/format';
import content from '../content.json';

/** The one "Added … to your cart" snackbar, with View cart. Also used after a deal's package pick. */
export function showCartAdded(item: string, viewCart: () => void) {
  showSnackbar(fillTemplate(content.cartToast.added, { item }), {
    variant: 'success',
    actionLabel: content.cartToast.viewCart,
    onAction: viewCart,
  });
}

/**
 * One-tap "Add to cart" for a product card: a signed-out visitor goes to sign in and comes back;
 * a signed-in one gets one unit added and a snackbar with View cart. Resolves `true` when the item
 * was added. Shared so every product card behaves and reads the same.
 */
export function useAddProductToCart() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const requireSignIn = useRequireSignIn();

  return useCallback(
    async (productId: string, name: string): Promise<boolean> => {
      if (!requireSignIn()) return false;
      try {
        await addCartItem(token, { productId, quantity: 1 });
        showCartAdded(name, () => navigate('/cart'));
        return true;
      } catch (err) {
        showSnackbar(err instanceof ApiRequestError ? err.message : content.cartToast.error, { variant: 'error' });
        return false;
      }
    },
    [requireSignIn, token, navigate],
  );
}
