import { apiGet, apiPost } from './client';

/**
 * Admin-only refunds — `accounts.refunds-disputes:approve`. Mirrors `apps/msd-api`'s
 * `refunds.routes.ts` exactly. A Razorpay-captured payment gets a real gateway refund call; a
 * COD payment is recorded with no gateway call (cash already physically returned).
 */

export type RefundType = 'FULL' | 'PARTIAL';
export type RefundStatus = 'REQUESTED' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface Refund {
  id: string;
  orderItemId: string;
  paymentId: string;
  amount: string;
  type: RefundType;
  reason: string | null;
  disputeId: string | null;
  status: RefundStatus;
  providerRefundId: string | null;
  processedByUserId: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRefundInput {
  orderItemId: string;
  /** Required whenever that order item has more than one voucher (a multi-quantity SERVICE
   *  line) — never ambiguous about which voucher's ledger the adjustment posts against. */
  entitlementId?: string;
  amount: number;
  type: RefundType;
  reason?: string;
  disputeId?: string;
}

export function createRefund(token: string | null, input: CreateRefundInput) {
  return apiPost<Refund>('/refunds', token, input);
}

export function listRefundsForOrderItem(token: string | null, orderItemId: string) {
  return apiGet<Refund[]>(`/refunds/order-item/${orderItemId}`, token);
}
