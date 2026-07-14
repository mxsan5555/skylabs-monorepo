import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { CartItem } from '../types';

const STORAGE_KEY = 'msd_cart';

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  addItem: (dealId: string) => void;
  removeItem: (dealId: string) => void;
  updateQuantity: (dealId: string, quantity: number) => void;
  updateDateTime: (dealId: string, date: string, time: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    save(items);
  }, [items]);

  const addItem = useCallback((dealId: string) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.dealId === dealId);
      if (existing) {
        return prev.map((i) =>
          i.dealId === dealId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { dealId, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((dealId: string) => {
    setItems((prev) => prev.filter((i) => i.dealId !== dealId));
  }, []);

  const updateQuantity = useCallback((dealId: string, quantity: number) => {
    if (quantity < 1) return;
    setItems((prev) =>
      prev.map((i) => (i.dealId === dealId ? { ...i, quantity } : i)),
    );
  }, []);

  const updateDateTime = useCallback(
    (dealId: string, date: string, time: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.dealId === dealId ? { ...i, selectedDate: date, selectedTime: time } : i,
        ),
      );
    },
    [],
  );

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        addItem,
        removeItem,
        updateQuantity,
        updateDateTime,
        clearCart,
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
