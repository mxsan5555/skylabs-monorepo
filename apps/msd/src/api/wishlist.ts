import { apiGet, apiPost, apiDelete } from './rbac/client';
import type { CatalogDeal } from './catalog';

/**
 * Customer wishlist — authenticated, self-service only (backend gates on `authenticate` alone,
 * no RBAC permission — same as `api/cart.ts`'s `cart.routes.ts`). Mirrors that file's
 * request/response conventions and always sends the real signed-in token.
 *
 * `WishlistItem.deal` comes from msd-api's `PUBLIC_DEAL_SELECT` — the exact same select used by
 * `GET /catalog/deals`, so it's shaped identically to `CatalogDeal` in `api/catalog.ts`. Reusing
 * that type here (instead of redeclaring it) keeps the two in lockstep and lets every page that
 * already renders a `CatalogDeal` via `SkyProductCardWC` render a wishlisted deal the same way.
 */
export interface WishlistItem {
  id: string;
  dealId: string;
  createdAt: string;
  deal: CatalogDeal;
}

export function getWishlist(token: string | null) {
  return apiGet<WishlistItem[]>('/wishlist', token);
}

export function addToWishlist(token: string | null, dealId: string) {
  return apiPost<WishlistItem>('/wishlist', token, { dealId });
}

export function removeFromWishlist(token: string | null, dealId: string) {
  return apiDelete<{ removed: boolean }>(`/wishlist/${dealId}`, token);
}

export function checkWishlisted(token: string | null, dealId: string) {
  return apiGet<{ wishlisted: boolean }>(`/wishlist/check/${dealId}`, token);
}
