import type { AuditLogEntry } from '@skylabs-monorepo/shared-types';
import { apiGet, apiPatch } from './client';

export type OrderType = 'SERVICE' | 'PRODUCT';
export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';
export type EntitlementStatus = 'ACTIVE' | 'STARTED' | 'OTP_REQUESTED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type FulfilmentKind = 'SERVICE_SESSION' | 'PRODUCT_PICKUP' | 'PRODUCT_SHIPPED';
export type SettlementStatus = 'PENDING_FULFILMENT' | 'ON_HOLD' | 'DISPUTED_BLOCKED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'VOID';

/** The admin/vendor-facing voucher view on each order item — narrow by design (see msd-api's
 *  `ADMIN_ENTITLEMENT_SELECT` doc comment): voucher identity, fulfilment/settlement status, and
 *  carrier/tracking/delivery-evidence — never the completion-OTP hash, never the payout/bank
 *  internals (those stay Member Settlements-only). */
export interface PurchaseEntitlement {
  id: string;
  voucherCode: string;
  fulfilmentKind: FulfilmentKind;
  entitlementStatus: EntitlementStatus;
  settlementStatus: SettlementStatus;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveryEvidenceStorageKey: string | null;
  deliveryEvidenceNote: string | null;
}

/** Multi-vendor: each item carries its own vendor/branch — see api/orders.ts's `OrderItem` doc
 *  comment for the full explanation (same shape, admin-facing client). A line is a Deal purchase
 *  if `dealId` is set, a Therapist purchase if `therapistId` is set (mutually exclusive for a
 *  SERVICE item), or a Product purchase if neither is set. */
export interface OrderItem {
  id: string;
  dealId: string | null;
  dealPackageId: string | null;
  therapistId: string | null;
  therapistPackageId: string | null;
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
  image: string | null;
  /** One voucher per unit (SERVICE) or one per item (PRODUCT) — see msd-api's
   *  `createEntitlementsForOrder` doc comment. Always present (possibly empty) on every
   *  admin/vendor `Order`/`OrderItem` response as of the entitlement-include extension. */
  purchaseEntitlements: PurchaseEntitlement[];
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
  /** Nullable — a Product-only order has no branch (Product is vendor-level, not branch-level).
   *  See Order.branchId's schema doc comment in msd-api. */
  branch: { id: string; name: string; address: string | null; city: string | null } | null;
  payments: OrderPayment[];
  /** Checkout's "Customer Details" step — already returned by `getOrderOrThrow` (plain Prisma
   *  `include`, no `select` narrowing — see order.service.ts), just not previously typed here.
   *  Nullable: predates this checkout step on any pre-existing order. */
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPincode: string | null;
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
  /** "Customer's Other Orders" — excludes one order id from an otherwise-identical
   *  `customerId`-filtered list. */
  excludeOrderId?: string;
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

export interface OrderCounts {
  total: number;
  paid: number;
  pendingPayment: number;
}

/** Order History's three summary cards (All / Paid / Awaiting Payment) — every filter EXCEPT
 *  `status`/`paymentStatus` narrows these (see msd-api's `getOrderCounts` doc comment for why
 *  those two are deliberately never taken as filters here); always a real server-side count,
 *  never derived from the current page. */
export function getOrderCounts(
  token: string | null,
  opts: Pick<ListOrdersOpts, 'vendorId' | 'branchId' | 'customerId' | 'excludeOrderId' | 'createdFrom' | 'createdTo' | 'search'> = {},
) {
  return apiGet<OrderCounts>(`/orders/counts${toQuery(opts)}`, token);
}

/** Order Details' "Activity History" — one chronological feed combining the order's own
 *  `Order`-targeted audit rows with its items' entitlement/dispute/refund-targeted rows (see
 *  msd-api's `getOrderActivityHistory` doc comment). Same view guard as `getOrder` itself. */
export function getOrderActivityHistory(token: string | null, id: string) {
  return apiGet<AuditLogEntry[]>(`/orders/${id}/activity`, token);
}

/** Display-only label derived from the order's own uuid — mirrors msd-api's
 *  `notification.service.ts#shortOrderNumber` exactly. Never persisted, never sent back to the
 *  API — purely a client-side display convenience, same as the backend's own copy of this. */
export function shortOrderNumber(orderId: string): string {
  return `ORD-${orderId.slice(-8).toUpperCase()}`;
}
