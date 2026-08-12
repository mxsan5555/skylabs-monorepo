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

export function addCartItem(token: string | null, dealId: string, quantity = 1) {
  return apiPost<Cart>('/cart/items', token, { dealId, quantity });
}

export function updateCartItemQuantity(token: string | null, itemId: string, quantity: number) {
  return apiPatch<Cart>(`/cart/items/${itemId}`, token, { quantity });
}

export function removeCartItem(token: string | null, itemId: string) {
  return apiDelete<Cart>(`/cart/items/${itemId}`, token);
}

export function clearCart(token: string | null) {
  return apiDelete<Cart>('/cart', token);
}
