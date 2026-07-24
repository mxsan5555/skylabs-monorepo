import { apiClient } from './api-client';
import { writeGuestToken } from '../cart/guest-token';

export interface Money {
  amount: number;
  currency: string;
}

export interface ServerCartItem {
  id: string;
  dealId: string;
  dealSlug: string;
  dealTitle: string;
  heroImageUrl: string;
  pricingPlanId: string;
  planName: string;
  locationId: string;
  locationName: string;
  quantity: number;
  bookingDate: string | null;
  bookingTime: string | null;
  priceSnapshot: Money;
  originalPrice: Money | null;
}

export interface ServerCart {
  id: string;
  promoCode: string | null;
  items: ServerCartItem[];
  subtotal: Money;
  savings: Money;
  promoDiscount: Money;
  payable: Money;
  promoError: string | null;
  guestToken?: string;
}

function persistGuestToken(cart: ServerCart): ServerCart {
  if (cart.guestToken) writeGuestToken(cart.guestToken);
  return cart;
}

export const cartApi = {
  get: () => apiClient.get<ServerCart>('/cart').then(persistGuestToken),
  addItem: (dealId: string, quantity = 1, bookingDate?: string, bookingTime?: string) =>
    apiClient
      .post<ServerCart>('/cart/items', { dealId, quantity, bookingDate, bookingTime })
      .then(persistGuestToken),
  updateItem: (id: string, patch: { quantity?: number; bookingDate?: string; bookingTime?: string }) =>
    apiClient.patch<ServerCart>(`/cart/items/${id}`, patch).then(persistGuestToken),
  removeItem: (id: string) => apiClient.delete<ServerCart>(`/cart/items/${id}`).then(persistGuestToken),
  clear: () => apiClient.delete<ServerCart>('/cart').then(persistGuestToken),
  applyPromo: (code: string) => apiClient.post<ServerCart>('/cart/promo', { code }).then(persistGuestToken),
  removePromo: () => apiClient.delete<ServerCart>('/cart/promo').then(persistGuestToken),
};
