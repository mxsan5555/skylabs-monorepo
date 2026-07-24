import { apiClient } from './api-client';
import type { Money } from './cart-api';

export interface CheckoutResponse {
  orderId: string;
  orderNumber: string;
  payment: {
    provider: 'razorpay';
    providerOrderId: string;
    amount: Money;
    keyId: string;
  };
}

export interface AvailabilitySlot {
  time: string;
  available: boolean;
  reason?: string;
}

export interface AvailabilityResponse {
  date: string;
  slots: AvailabilitySlot[];
}

export const checkoutApi = {
  checkout: (contact: { name: string; phone: string; email: string }, items: { cartItemId: string; bookingDate: string; bookingTime: string }[]) =>
    apiClient.post<CheckoutResponse>('/checkout', { contact, items }),
  confirmPayment: (
    orderId: string,
    payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  ) => apiClient.post(`/orders/${orderId}/confirm-payment`, payload),
  availability: (dealSlug: string, date: string) =>
    apiClient.get<AvailabilityResponse>(`/deals/${dealSlug}/availability?date=${date}`),
};
