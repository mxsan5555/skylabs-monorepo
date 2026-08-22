import { apiGet, apiPost, apiPatch, apiDelete } from './rbac/client';
import type { MediaImage } from './media';

/**
 * Customer product cart — authenticated, self-service only (backend gates on `authenticate`
 * alone, no RBAC permission — see msd-api's `cart.routes.ts` doc comment). Mirrors the
 * `api/rbac/*` request/response shape but always sends the real signed-in token.
 */

export interface CartDealSummary {
  id: string;
  title: string;
  slug: string;
  salePrice: string;
  originalPrice: string;
  images: string[] | null;
  vendorId: string;
  branchId: string;
  vendor: { id: string; businessName: string | null } | null;
  branch: { id: string; name: string } | null;
  product: { id: string; name: string; image: string | null; imageAlt: string | null; mediaImages?: MediaImage[] } | null;
  mediaImages?: MediaImage[];
}

export interface CartItem {
  id: string;
  cartId: string;
  dealId: string;
  quantity: number;
  unitPrice: string;
  deal: CartDealSummary;
}

/** Multi-vendor: a cart may hold items from any number of vendors/branches — each item's own
 *  `deal.vendorId`/`deal.vendor`/`deal.branch` is authoritative; Cart itself carries no
 *  vendor/branch field. Group `items` by `deal.vendorId` for a vendor-grouped display. */
export interface Cart {
  id: string;
  customerId: string;
  items: CartItem[];
}

export function getCart(token: string | null) {
  return apiGet<Cart>('/cart', token);
}

/**
 * Lightweight pub/sub so any component that mutates the cart (category/product pages, the cart
 * page itself) can tell others — chiefly the header's cart-count badge — to refetch, without a
 * new global store. Every mutator below notifies on success.
 */
type CartListener = () => void;
const listeners = new Set<CartListener>();

export function subscribeCartUpdated(listener: CartListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Exported (unlike a private helper) so `api/orders.ts#checkout` can notify too — checkout
 *  clears the cart server-side, and without this the header badge would stay stale until some
 *  unrelated cart mutation happened to refetch it. */
export function notifyCartUpdated() {
  listeners.forEach((listener) => listener());
}

export function addCartItem(token: string | null, dealId: string, quantity = 1) {
  return apiPost<Cart>('/cart/items', token, { dealId, quantity }).then((res) => {
    notifyCartUpdated();
    return res;
  });
}

export function updateCartItemQuantity(token: string | null, itemId: string, quantity: number) {
  return apiPatch<Cart>(`/cart/items/${itemId}`, token, { quantity }).then((res) => {
    notifyCartUpdated();
    return res;
  });
}

export function removeCartItem(token: string | null, itemId: string) {
  return apiDelete<Cart>(`/cart/items/${itemId}`, token).then((res) => {
    notifyCartUpdated();
    return res;
  });
}

export function clearCart(token: string | null) {
  return apiDelete<Cart>('/cart', token).then((res) => {
    notifyCartUpdated();
    return res;
  });
}
