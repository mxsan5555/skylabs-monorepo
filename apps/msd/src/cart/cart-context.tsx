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
  addItem: ( id: string,type: 'deal'  | 'product') => void;
  removeItem: (id: string, type: 'deal' | 'product') => void;
  updateQuantity: (id: string, type: 'deal' | 'product', quantity: number) => void;
  updateDateTime: (id: string, type: 'deal' | 'product', date: string, time: string) => void;
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

const addItem = useCallback(
  (id: string, type: 'deal' | 'product') => {
    setItems((prev) => {
      const existing = prev.find((i) =>
        type === 'deal'? i.dealId === id : i.productId === id );
      if (existing) {
        return prev.map((i) =>
          (type === 'deal' ? i.dealId === id: i.productId === id) ? { ...i,  quantity: i.quantity + 1, }: i, );}
      return [  ...prev,
        type === 'deal'
          ? {
              dealId: id,
              quantity: 1,
            }
          : {
              productId: id,
              quantity: 1,
            },
      ];
    });
  }, [],
);
const removeItem = useCallback(
  (id: string, type: 'deal' | 'product') => {
    setItems((prev) =>
      prev.filter((i) =>
        type === 'deal'
          ? i.dealId !== id
          : i.productId !== id
      ),
    );
  },
  [],
);

const updateQuantity = useCallback(
  (
    id: string,
    type: 'deal' | 'product',
    quantity: number,
  ) => {
    if (quantity < 1) return;

    setItems((prev) =>
      prev.map((i) =>
        (
          type === 'deal'
            ? i.dealId === id
            : i.productId === id
        )
          ? { ...i, quantity }
          : i,
      ),
    );
  },
  [],
);

const updateDateTime = useCallback(
  (
    id: string,
    type: 'deal' | 'product',
    date: string,
    time: string,
  ) => {
    setItems((prev) =>
      prev.map((i) =>
        (
          type === 'deal'
            ? i.dealId === id
            : i.productId === id
        )
          ? {
              ...i,
              selectedDate: date,
              selectedTime: time,
            }
          : i,
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
