import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, subscribeCartUpdated } from '../api/cart';

const CartCountContext = createContext(0);

/** Holds the signed-in customer's cart item total, fetched once and refetched on every cart
 *  mutation, so the header and the mobile tab bar share one `getCart` call. Mount inside
 *  `AuthProvider`. */
export function CartCountProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, token } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      getCart(token)
        .then(({ data }) => {
          if (!cancelled) setCount(data.items.reduce((sum, item) => sum + item.quantity, 0));
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };
    load();
    const unsubscribe = subscribeCartUpdated(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthenticated, token]);

  return createElement(CartCountContext.Provider, { value: count }, children);
}

/** Total item quantity in the signed-in customer's cart (0 outside `CartCountProvider`). */
export function useCartCount(): number {
  return useContext(CartCountContext);
}
