import { apiGet, apiPatch } from './client';

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

export interface Order {
  id: string;
  customerId: string;
  vendorId: string;
  branchId: string;
  type: OrderType;
  status: OrderStatus;
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
  booking: { id: string; bookingDate: string; timeSlot: string } | null;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/** Admin sees every order (optionally ?vendorId=); a vendor caller is force-scoped server-side
 *  to its own vendor regardless of any param sent here — see order.service.ts#listOrders. */
export function listOrders(token: string | null, opts: { page?: number; pageSize?: number; status?: OrderStatus; vendorId?: string } = {}) {
  return apiGet<Order[]>(`/orders${toQuery(opts)}`, token);
}

export function getOrder(token: string | null, id: string) {
  return apiGet<Order>(`/orders/${id}`, token);
}

export function setOrderStatus(token: string | null, id: string, status: OrderStatus, cancellationReason?: string) {
  return apiPatch<Order>(`/orders/${id}/status`, token, { status, cancellationReason });
}
