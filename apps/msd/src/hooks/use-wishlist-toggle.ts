import { useCallback } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useWishlist } from '../wishlist/wishlist-context';
import { useHydrated } from './use-hydrated';
import { useRequireSignIn } from './use-require-sign-in';

export type WishlistItemType = 'deal' | 'product';

/**
 * The card heart for deals and products: `isFavorite` is false until hydration and for signed-out
 * visitors (prerendered HTML has no wishlist); `toggleFavorite` sends a signed-out visitor to sign
 * in and back, otherwise adds or removes the item.
 */
export function useWishlistToggle() {
  const { isAuthenticated } = useAuth();
  const requireSignIn = useRequireSignIn();
  const signedIn = useHydrated() && isAuthenticated;
  const { has, hasProduct, toggle, toggleProduct } = useWishlist();

  const isFavorite = useCallback(
    (type: WishlistItemType, id: string) => signedIn && (type === 'deal' ? has(id) : hasProduct(id)),
    [signedIn, has, hasProduct],
  );

  const toggleFavorite = useCallback(
    (type: WishlistItemType, id: string) => {
      if (!requireSignIn()) return;
      void (type === 'deal' ? toggle(id) : toggleProduct(id));
    },
    [requireSignIn, toggle, toggleProduct],
  );

  return { isFavorite, toggleFavorite };
}
