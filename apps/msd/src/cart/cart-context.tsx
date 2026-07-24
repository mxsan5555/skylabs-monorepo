import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { CartItem } from '../types';
import { cartApi, type ServerCart } from '../api/cart-api';
import { useAuth } from '../auth/auth-context';

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  serverCart: ServerCart | null;
  addItem: (dealId: string) => void;
  removeItem: (dealId: string) => void;
  updateQuantity: (dealId: string, quantity: number) => void;
  updateDateTime: (dealId: string, date: string, time: string) => void;
  clearCart: () => void;
  refresh: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function toItems(cart: ServerCart): CartItem[] {
  return cart.items.map((i) => ({
    dealId: i.dealId,
    quantity: i.quantity,
    selectedDate: i.bookingDate ?? undefined,
    selectedTime: i.bookingTime ?? undefined,
  }));
}

/** Server-backed cart (guest token pre-sign-in, bearer token after) — see api/cart-api.ts.
 *  Keeps the same public shape as the old localStorage version so pages that call
 *  useCart() didn't need to change. */
export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [serverCart, setServerCart] = useState<ServerCart | null>(null);

  const load = useCallback(() => {
    cartApi
      .get()
      .then(setServerCart)
      .catch(() => setServerCart(null));
  }, []);

  useEffect(() => {
    load();
    // Re-fetch on sign-in/out so a guest cart adopted by the account (or vice versa) shows up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Find the cart item id(s) for a given dealId — a deal can only appear once per
  // (plan, location) combo, and phase-1 always uses the deal's default of each.
  const findItemId = useCallback(
    (dealId: string) => serverCart?.items.find((i) => i.dealId === dealId)?.id,
    [serverCart],
  );

  const addItem = useCallback((dealId: string) => {
    cartApi.addItem(dealId, 1).then(setServerCart);
  }, []);

  const removeItem = useCallback(
    (dealId: string) => {
      const id = findItemId(dealId);
      if (!id) return;
      cartApi.removeItem(id).then(setServerCart);
    },
    [findItemId],
  );

  const updateQuantity = useCallback(
    (dealId: string, quantity: number) => {
      if (quantity < 1) return;
      const id = findItemId(dealId);
      if (!id) return;
      cartApi.updateItem(id, { quantity }).then(setServerCart);
    },
    [findItemId],
  );

  const updateDateTime = useCallback(
    (dealId: string, date: string, time: string) => {
      const id = findItemId(dealId);
      if (!id) return;
      cartApi.updateItem(id, { bookingDate: date, bookingTime: time }).then(setServerCart);
    },
    [findItemId],
  );

  const clearCart = useCallback(() => {
    cartApi.clear().then(setServerCart);
  }, []);

  const items = serverCart ? toItems(serverCart) : [];
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        serverCart,
        addItem,
        removeItem,
        updateQuantity,
        updateDateTime,
        clearCart,
        refresh: load,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
