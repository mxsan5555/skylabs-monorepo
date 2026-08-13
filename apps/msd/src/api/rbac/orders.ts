import { apiGet, apiPatch } from './client';

export type OrderType = 'SERVICE' | 'PRODUCT';
export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';

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

export interface OrderPayment {
  id: string;
  status: PaymentStatus;
  provider: string;
  amount: string;
  currency: string;
  failureReason: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  vendorId: string;
  branchId: string;
  type: OrderType;
  status: OrderStatus;
  bookingId: string | null;
  vendorNameSnapshot: string;
  branchNameSnapshot: string;
  subtotal: string;
  total: string;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  customer: { id: string; name: string; phone: string | null; email: string | null };
  vendor: { id: string; businessName: string | null };
  branch: { id: string; name: string; address: string | null; city: string | null };
  booking: { id: string; bookingDate: string; timeSlot: string; status: string } | null;
  payments: OrderPayment[];
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export interface ListOrdersOpts {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  /** Admin-only drill-in filter — ignored server-side for a vendor caller, who is always
   *  force-scoped to their own vendor — see order.service.ts#listOrders. */
  vendorId?: string;
  branchId?: string;
  /** Admin-only drill-in filter (Customer Detail's Orders tab) — same rule as `vendorId`. */
  customerId?: string;
  /** Matches orders with at least one payment attempt in this state (Order has no single
   *  flat "payment status" column — see order.schema.ts#OrderListQuerySchema). */
  paymentStatus?: PaymentStatus;
  createdFrom?: string;
  createdTo?: string;
  /** Free-text search across customer name, vendor/branch name snapshot, and item names. */
  search?: string;
}

/** Admin sees every order (optionally ?vendorId=); a vendor caller is force-scoped server-side
 *  to its own vendor regardless of any param sent here — see order.service.ts#listOrders. */
export function listOrders(token: string | null, opts: ListOrdersOpts = {}) {
  return apiGet<Order[]>(`/orders${toQuery(opts)}`, token);
}

export function getOrder(token: string | null, id: string) {
  return apiGet<Order>(`/orders/${id}`, token);
}

export function setOrderStatus(token: string | null, id: string, status: OrderStatus, cancellationReason?: string) {
  return apiPatch<Order>(`/orders/${id}/status`, token, { status, cancellationReason });
}
