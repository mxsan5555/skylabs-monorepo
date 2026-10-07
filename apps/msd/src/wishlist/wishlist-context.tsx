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
  addProductToWishlist,
  removeFromWishlist,
  removeProductFromWishlist,
  type WishlistItem,
} from '../api/wishlist';

interface WishlistContextValue {
  ids: Set<string>;
  productIds: Set<string>;
  itemCount: number;
  items: WishlistItem[];
  loading: boolean;
  pending: Set<string>;
  productPending: Set<string>;

  has: (dealId: string) => boolean;
  hasProduct: (productId: string) => boolean;
  isPending: (dealId: string) => boolean;
  isProductPending: (productId: string) => boolean;
  toggle: (dealId: string) => Promise<boolean>;
  toggleProduct: (productId: string) => Promise<boolean>;
  remove: (dealId: string) => Promise<boolean>;
  removeProduct: (productId: string) => Promise<boolean>;
  refresh: () => void;
}

const WishlistContext =
  createContext<WishlistContextValue | null>(null);

export function WishlistProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { token, isAuthenticated } = useAuth();

  const [items, setItems] =
    useState<WishlistItem[]>([]);

  const [ids, setIds] =
    useState<Set<string>>(new Set());

  const [productIds, setProductIds] =
    useState<Set<string>>(new Set());

  const [loading, setLoading] =
    useState(false);

  const [pending, setPending] =
    useState<Set<string>>(new Set());

  const [productPending, setProductPending] =
    useState<Set<string>>(new Set());

  
  const pendingRef =
    useRef<Set<string>>(new Set());

  const productPendingRef =
    useRef<Set<string>>(new Set());

  const loadRequestRef = useRef(0);
  const mutationVersionRef = useRef(0);

  

  const load = useCallback(() => {
    const requestId =
      ++loadRequestRef.current;

    if (!isAuthenticated || !token) {
      setItems([]);
      setIds(new Set());
      setProductIds(new Set());
      setLoading(false);
      return;
    }

    const mutationVersion =
      mutationVersionRef.current;

    setLoading(true);

    getWishlist(token)
      .then(({ data }) => {
        if (
          requestId !== loadRequestRef.current ||
          mutationVersion !== mutationVersionRef.current
        ) {
          return;
        }

        const wishlistItems =
          data ?? [];

        setItems(wishlistItems);

      
        setIds(
          new Set(
            wishlistItems
              .filter(
                (item) =>
                  item.dealId !== null,
              )
              .map(
                (item) =>
                  item.dealId as string,
              ),
          ),
        );

        /*
         * Product wishlist ids.
         */
        setProductIds(
          new Set(
            wishlistItems
              .filter(
                (item) =>
                  item.productId !== null,
              )
              .map(
                (item) =>
                  item.productId as string,
              ),
          ),
        );
      })
      .catch(() => {
        if (
          requestId === loadRequestRef.current &&
          mutationVersion === mutationVersionRef.current
        ) {
          setItems([]);
          setIds(new Set());
          setProductIds(new Set());
        }
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) {
          setLoading(false);
        }
      });
  }, [
    token,
    isAuthenticated,
  ]);

  /*
   * Load wishlist whenever authentication changes.
   */
  useEffect(() => {
    load();
  }, [load]);

  /*
   * Deal helpers.
   */
  const has = useCallback(
    (dealId: string) =>
      ids.has(dealId),
    [ids],
  );

  const isPending = useCallback(
    (dealId: string) =>
      pending.has(dealId),
    [pending],
  );

  /*
   * Product helpers.
   */
  const hasProduct = useCallback(
    (productId: string) =>
      productIds.has(productId),
    [productIds],
  );

  const isProductPending =
    useCallback(
      (productId: string) =>
        productPending.has(productId),
      [productPending],
    );

  /*
   * Set Deal pending state.
   */
  const setPendingFor = useCallback(
    (
      dealId: string,
      on: boolean,
    ) => {
      if (on) {
        pendingRef.current.add(
          dealId,
        );
      } else {
        pendingRef.current.delete(
          dealId,
        );
      }

      setPending(
        new Set(
          pendingRef.current,
        ),
      );
    },
    [],
  );

  /*
   * Set Product pending state.
   */
  const setProductPendingFor =
    useCallback(
      (
        productId: string,
        on: boolean,
      ) => {
        if (on) {
          productPendingRef.current.add(
            productId,
          );
        } else {
          productPendingRef.current.delete(
            productId,
          );
        }

        setProductPending(
          new Set(
            productPendingRef.current,
          ),
        );
      },
      [],
    );

  /*
   * Toggle Deal wishlist.
   *
   * Existing Deal functionality is preserved.
   */
  const toggle = useCallback(
    async (
      dealId: string,
    ): Promise<boolean> => {
      if (
        !isAuthenticated ||
        !token ||
        pendingRef.current.has(
          dealId,
        )
      ) {
        return false;
      }

      const wasSaved =
        ids.has(dealId);

      mutationVersionRef.current += 1;

      setPendingFor(
        dealId,
        true,
      );

      /*
       * Optimistic Deal UI update.
       */
      setIds((prev) => {
        const next =
          new Set(prev);

        if (wasSaved) {
          next.delete(dealId);
        } else {
          next.add(dealId);
        }

        return next;
      });

      try {
        if (wasSaved) {
          /*
           * Remove Deal.
           */
          await removeFromWishlist(
            token,
            dealId,
          );

          setItems((prev) =>
            prev.filter(
              (item) =>
                item.dealId !==
                dealId,
            ),
          );
        } else {
          /*
           * Add Deal.
           */
          const { data } =
            await addToWishlist(
              token,
              dealId,
            );

          setItems((prev) => {
            if (
              prev.some(
                (item) =>
                  item.dealId ===
                  dealId,
              )
            ) {
              return prev;
            }

            return [
              ...prev,
              data,
            ];
          });
        }

        return true;
      } catch {
        /*
         * Roll back optimistic update.
         */
        setIds((prev) => {
          const next =
            new Set(prev);

          if (wasSaved) {
            next.add(dealId);
          } else {
            next.delete(dealId);
          }

          return next;
        });

        return false;
      } finally {
        setPendingFor(
          dealId,
          false,
        );
      }
    },
    [
      ids,
      token,
      isAuthenticated,
      setPendingFor,
    ],
  );

  /*
   * Toggle Product wishlist.
   */
  const toggleProduct = useCallback(
    async (
      productId: string,
    ): Promise<boolean> => {
      if (
        !isAuthenticated ||
        !token ||
        productPendingRef.current.has(
          productId,
        )
      ) {
        return false;
      }

      const wasSaved =
        productIds.has(productId);

      mutationVersionRef.current += 1;

      setProductPendingFor(
        productId,
        true,
      );

      /*
       * Optimistic Product UI update.
       */
      setProductIds((prev) => {
        const next =
          new Set(prev);

        if (wasSaved) {
          next.delete(productId);
        } else {
          next.add(productId);
        }

        return next;
      });

      try {
        if (wasSaved) {
          
          
          await removeProductFromWishlist(
            token,
            productId,
          );

          setItems((prev) =>
            prev.filter(
              (item) =>
                item.productId !==
                productId,
            ),
          );
        } else {
          /*
           * Add Product.
           */
          const { data } =
            await addProductToWishlist(
              token,
              productId,
            );

          setItems((prev) => {
            if (
              prev.some(
                (item) =>
                  item.productId ===
                  productId,
              )
            ) {
              return prev;
            }

            return [
              ...prev,
              data,
            ];
          });
        }

        return true;
      } catch {
        

        setProductIds((prev) => {
          const next =
            new Set(prev);

          if (wasSaved) {
            next.add(productId);
          } else {
            next.delete(productId);
          }

          return next;
        });

        return false;
      } finally {
        setProductPendingFor(
          productId,
          false,
        );
      }
    },
    [
      productIds,
      token,
      isAuthenticated,
      setProductPendingFor,
    ],
  );


  const remove = useCallback(
    async (
      dealId: string,
    ): Promise<boolean> => {
      if (!ids.has(dealId)) {
        return true;
      }

      return toggle(dealId);
    },
    [ids, toggle],
  );

  
  const removeProduct =
    useCallback(
      async (
        productId: string,
      ): Promise<boolean> => {
        if (
          !productIds.has(productId)
        ) {
          return true;
        }

        return toggleProduct(
          productId,
        );
      },
      [
        productIds,
        toggleProduct,
      ],
    );

  return (
    <WishlistContext.Provider
      value={{
        ids,
        productIds,
        itemCount:
          ids.size + productIds.size,
        items,
        loading,
        pending,
        productPending,
        has,
        hasProduct,
        isPending,
        isProductPending,
        toggle,
        toggleProduct,
        remove,
        removeProduct,
        refresh: load,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx =
    useContext(WishlistContext);

  if (!ctx) {
    throw new Error(
      'useWishlist must be used within WishlistProvider',
    );
  }

  return ctx;
}