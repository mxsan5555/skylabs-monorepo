import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'msd_wishlist';

interface WishlistContextValue {
  ids: Set<string>;
  wishlistCount: number;
  toggle: (dealId: string) => void;
  has: (dealId: string) => boolean;
  remove: (dealId: string) => void;
  clear: () => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(load);

  useEffect(() => {
    save(ids);
  }, [ids]);

  const toggle = useCallback((dealId: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) {
        next.delete(dealId);
      } else {
        next.add(dealId);
      }
      return next;
    });
  }, []);

  const has = useCallback((dealId: string) => ids.has(dealId), [ids]);

  const remove = useCallback((dealId: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      next.delete(dealId);
      return next;
    });
  }, []);

  const clear = useCallback(() => setIds(new Set()), []);
  const wishlistCount = ids.size;

  return (
    <WishlistContext.Provider
      value={{ ids, wishlistCount, toggle, has, remove, clear, }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
