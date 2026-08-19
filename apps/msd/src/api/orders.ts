import { apiGet, apiPost, apiPatch } from './rbac/client';
import { notifyCartUpdated } from './cart';
import { notifyBookingsUpdated } from './bookings';

/**
 * Customer orders — authenticated, self-service only (backend gates on `authenticate` alone,
 * no RBAC permission — see msd-api's `orders.routes.ts` doc comment), mirroring `api/cart.ts`/
 * `api/bookings.ts`. This is the Cart/Booking convergence point (Phase 8).
 */

export type OrderType = 'SERVICE' | 'PRODUCT';
export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

/** Multi-vendor: each item carries its OWN vendor/branch — a PRODUCT order created from a
 *  multi-vendor cart groups items from several vendors under one Order/one Payment. `Order`'s own
 *  vendorId/vendorNameSnapshot (below) is just the "primary" (first) vendor, kept for the header/
 *  legacy single-vendor display — group `items` by `vendorId` for the real per-vendor breakdown. */
export interface OrderItem {
  id: string;
  dealId: string;
  vendorId: string;
  branchId: string;
  vendorNameSnapshot: string;
  branchNameSnapshot: string;
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
  provider: 'RAZORPAY' | 'COD';
  amount: string;
  currency: string;
  failureReason: string | null;
  createdAt: string;
}

/** Checkout's "Customer Details" step — every field optional to match the backend's Zod schema
 *  (an order created before this step existed has none of these set). */
export interface OrderContactDetails {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPincode?: string;
}

export interface Order extends OrderContactDetails {
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
  booking: { id: string; bookingDate: string | null; timeSlot: string | null } | null;
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

export function checkout(token: string | null, contactDetails: OrderContactDetails = {}) {
  // Checkout clears the cart server-side — notify so the header badge doesn't stay stale.
  return apiPost<Order>('/orders/checkout', token, contactDetails).then((res) => {
    notifyCartUpdated();
    return res;
  });
}

export function createOrderFromBooking(token: string | null, bookingId: string, contactDetails: OrderContactDetails = {}) {
  // Consumes a PENDING booking into an Order — notify so the header badge drops accordingly.
  return apiPost<Order>('/orders/from-booking', token, { bookingId, ...contactDetails }).then((res) => {
    notifyBookingsUpdated();
    return res;
  });
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

/** Confirms a Cash on Delivery order — no gateway, no widget. Moves the order straight to
 *  CONFIRMED; the paired Payment stays CREATED (never PAID — cash hasn't been collected yet). */
export function payCod(token: string | null, orderId: string) {
  return apiPost<Order>(`/orders/me/${orderId}/pay-cod`, token);
}

export function verifyPayment(token: string | null, orderId: string, input: VerifyPaymentInput) {
  return apiPost<Order>(`/orders/me/${orderId}/verify-payment`, token, input);
}

/**
 * Combined checkout (Deal + Therapist + Product together) — one checkout action, one payment,
 * one combined receipt, multiple Order rows under the hood (see msd-api's payment.service.ts
 * doc comment). These three mirror `pay`/`payCod`/`verifyPayment` above exactly, just batched
 * across every Order created together in one checkout action.
 */
export function payBatch(token: string | null, orderIds: string[]) {
  return apiPost<PaymentIntent>('/orders/pay-batch', token, { orderIds });
}

export function payBatchCod(token: string | null, orderIds: string[]) {
  return apiPost<Order[]>('/orders/pay-batch/cod', token, { orderIds });
}

export function verifyBatchPayment(token: string | null, orderIds: string[], input: VerifyPaymentInput) {
  return apiPost<Order[]>('/orders/pay-batch/verify', token, { orderIds, ...input });
}
