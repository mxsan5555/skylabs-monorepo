import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, subscribeCartUpdated } from '../api/cart';

/** Total item quantity in the signed-in customer's cart; refetches on every cart mutation. */
export function useCartCount(): number {
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

  return count;
}
