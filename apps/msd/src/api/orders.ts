import { apiGet, apiPost, apiPatch } from './rbac/client';

/**
 * Customer orders — authenticated, self-service only (backend gates on `authenticate` alone,
 * no RBAC permission — see msd-api's `orders.routes.ts` doc comment), mirroring `api/cart.ts`/
 * `api/bookings.ts`. This is the Cart/Booking convergence point (Phase 8).
 */

export type OrderType = 'SERVICE' | 'PRODUCT';
export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  dealId: string;
  itemName: string;
  itemType: OrderType;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  durationMinutes: number | null;
}

export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';

export interface PaymentSummary {
  id: string;
  status: PaymentStatus;
  provider: 'RAZORPAY';
  amount: string;
  currency: string;
  failureReason: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  type: OrderType;
  status: OrderStatus;
  vendorNameSnapshot: string;
  branchNameSnapshot: string;
  subtotal: string;
  total: string;
  cancellationReason: string | null;
  createdAt: string;
  items: OrderItem[];
  payments: PaymentSummary[];
  booking: { id: string; bookingDate: string; timeSlot: string } | null;
  branch: { id: string; name: string; address: string | null; city: string | null };
}

/** What `POST /orders/me/:id/pay` returns — enough to open the Razorpay widget, never a secret. */
export interface PaymentIntent {
  providerOrderId: string;
  amount: string;
  currency: string;
  keyId: string;
}

export interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function checkout(token: string | null) {
  return apiPost<Order>('/orders/checkout', token);
}

export function createOrderFromBooking(token: string | null, bookingId: string) {
  return apiPost<Order>('/orders/from-booking', token, { bookingId });
}

export function listMyOrders(token: string | null, opts: { page?: number; pageSize?: number; status?: OrderStatus } = {}) {
  return apiGet<Order[]>(`/orders/me${toQuery(opts)}`, token);
}

export function getMyOrder(token: string | null, id: string) {
  return apiGet<Order>(`/orders/me/${id}`, token);
}

export function cancelMyOrder(token: string | null, id: string, cancellationReason?: string) {
  return apiPatch<Order>(`/orders/me/${id}/status`, token, { status: 'CANCELLED', cancellationReason });
}

export function pay(token: string | null, orderId: string) {
  return apiPost<PaymentIntent>(`/orders/me/${orderId}/pay`, token);
}

export function verifyPayment(token: string | null, orderId: string, input: VerifyPaymentInput) {
  return apiPost<Order>(`/orders/me/${orderId}/verify-payment`, token, input);
}
