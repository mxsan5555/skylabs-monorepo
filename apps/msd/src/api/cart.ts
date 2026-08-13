import { apiGet, apiPost, apiPatch, apiDelete } from './rbac/client';

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
  product: { id: string; name: string; image: string | null; imageAlt: string | null } | null;
}

export interface CartItem {
  id: string;
  cartId: string;
  dealId: string;
  quantity: number;
  unitPrice: string;
  deal: CartDealSummary;
}

export interface Cart {
  id: string;
  customerId: string;
  vendorId: string | null;
  branchId: string | null;
  vendor: { id: string; businessName: string | null } | null;
  branch: { id: string; name: string } | null;
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

function notifyCartUpdated() {
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
