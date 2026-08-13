import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  type WishlistItem,
} from '../api/wishlist';

/**
 * Real, backend-driven wishlist (`GET/POST/DELETE /wishlist`) — replaces the previous
 * `localStorage`-only mock. The full wishlist is loaded once on mount/sign-in/sign-out into
 * local state so `has(dealId)` can stay a **synchronous** lookup (existing call sites like
 * `DealCard`/`SkyProductCardWC`'s `favoriteActive` prop read it that way); `toggle`/`remove`
 * are necessarily async (they hit the API) — they update local state optimistically and roll
 * back if the request fails, and ignore repeat calls for the same deal while one is in flight.
 */

interface WishlistContextValue {
  /** Saved deal ids — synchronous membership checks (`has`) read from this. */
  ids: Set<string>;
  /** Full wishlist rows (id, dealId, createdAt, deal) as returned by `GET /wishlist`. */
  items: WishlistItem[];
  loading: boolean;
  /** Ids currently mid-toggle — expose so a consumer can disable its own control if it wants to. */
  pending: Set<string>;
  has: (dealId: string) => boolean;
  isPending: (dealId: string) => boolean;
  /** Adds if not saved, removes if saved. Resolves `true` on success, `false` if the API call
   *  failed (state is rolled back to its prior value in that case — never throws). */
  toggle: (dealId: string) => Promise<boolean>;
  /** Removes only (no-op, resolves `true`, if not currently saved). */
  remove: (dealId: string) => Promise<boolean>;
  refresh: () => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  // Ref mirror of `pending` for synchronous re-entrancy checks inside `toggle` (state updates
  // are async, so a second click before the first re-render could otherwise slip through).
  const pendingRef = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!isAuthenticated) {
      setItems([]);
      setIds(new Set());
      return;
    }
    setLoading(true);
    getWishlist(token)
      .then(({ data }) => {
        setItems(data);
        setIds(new Set(data.map((item) => item.dealId)));
      })
      .catch(() => {
        setItems([]);
        setIds(new Set());
      })
      .finally(() => setLoading(false));
  }, [token, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  const has = useCallback((dealId: string) => ids.has(dealId), [ids]);
  const isPending = useCallback((dealId: string) => pending.has(dealId), [pending]);

  const setPendingFor = (dealId: string, on: boolean) => {
    if (on) pendingRef.current.add(dealId);
    else pendingRef.current.delete(dealId);
    setPending(new Set(pendingRef.current));
  };

  const toggle = useCallback(
    async (dealId: string): Promise<boolean> => {
      if (!isAuthenticated || pendingRef.current.has(dealId)) return false;
      const wasSaved = ids.has(dealId);

      setPendingFor(dealId, true);
      // Optimistic update — flip immediately so the heart icon reacts without waiting on the network.
      setIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(dealId);
        else next.add(dealId);
        return next;
      });

      try {
        if (wasSaved) {
          await removeFromWishlist(token, dealId);
          setItems((prev) => prev.filter((item) => item.dealId !== dealId));
        } else {
          const { data } = await addToWishlist(token, dealId);
          setItems((prev) => (prev.some((item) => item.dealId === dealId) ? prev : [...prev, data]));
        }
        return true;
      } catch {
        // Roll back the optimistic flip — API call failed (e.g. deal no longer exists/visible).
        setIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(dealId);
          else next.delete(dealId);
          return next;
        });
        return false;
      } finally {
        setPendingFor(dealId, false);
      }
    },
    [ids, token, isAuthenticated],
  );

  const remove = useCallback(
    async (dealId: string): Promise<boolean> => {
      if (!ids.has(dealId)) return true;
      return toggle(dealId);
    },
    [ids, toggle],
  );

  return (
    <WishlistContext.Provider value={{ ids, items, loading, pending, has, isPending, toggle, remove, refresh: load }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
