import type { AuditLogEntry } from '@skylabs-monorepo/shared-types';
import { apiGet, apiPost, apiPut } from './client';

/**
 * Member Settlements — vendor-wise aggregates, per-vendor detail (bank details, order-wise
 * statement, eligible-for-payout items, payout history, audit trail), per-vendor commission
 * override, and payout recording. Mirrors `apps/msd-api`'s `settlements.routes.ts` exactly.
 * `recordMemberPayout` is the one call gated BOTH `accounts.member-settlements:approve` AND
 * super-admin-only server-side (see that route's own doc comment) — the UI must check both
 * `can('accounts.member-settlements', 'approve')` and the caller's `isSuperAdmin` role flag
 * before ever showing the "Record Bank Payment" action.
 */

export type SettlementStatus = 'PENDING_FULFILMENT' | 'ON_HOLD' | 'DISPUTED_BLOCKED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'VOID';
export type EntitlementStatus = 'ACTIVE' | 'STARTED' | 'OTP_REQUESTED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type FulfilmentKind = 'SERVICE_SESSION' | 'PRODUCT_PICKUP' | 'PRODUCT_SHIPPED';
export type SettlementAdjustmentType = 'REFUND' | 'MANUAL_ADJUSTMENT' | 'RECOVERY';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export interface SettlementAdjustment {
  id: string;
  entitlementId: string;
  type: SettlementAdjustmentType;
  amount: string;
  reason: string | null;
  refundId: string | null;
  createdByUserId: string;
  createdAt: string;
}

/** One redeemable/payable voucher — the order-wise "statement" line. */
export interface PurchaseEntitlement {
  id: string;
  orderItemId: string;
  sequenceNo: number;
  voucherCode: string;
  customerId: string;
  vendorId: string;
  branchId: string | null;
  fulfilmentKind: FulfilmentKind;
  entitlementStatus: EntitlementStatus;
  serviceStartedAt: string | null;
  completedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveryEvidenceStorageKey: string | null;
  deliveryEvidenceNote: string | null;
  recordedByUserId: string | null;
  grossAmount: string;
  commissionRatePercent: string;
  commissionAmount: string;
  memberShareAmount: string;
  settlementStatus: SettlementStatus;
  preDisputeStatus: SettlementStatus | null;
  holdUntil: string | null;
  payoutItemId: string | null;
  createdAt: string;
  updatedAt: string;
  adjustments: SettlementAdjustment[];
  /** Only on the per-vendor detail's `statement`/`eligibleItems` — never on the list aggregate. */
  orderItem?: { itemName: string; orderId: string };
}

export interface MemberPayoutItem {
  id: string;
  payoutId: string;
  entitlementId: string;
  amount: string;
}

export interface MemberPayout {
  id: string;
  vendorId: string;
  amount: string;
  method: 'MANUAL_BANK_TRANSFER';
  status: PayoutStatus;
  bankAccountHolderSnapshot: string;
  bankNameSnapshot: string | null;
  bankAccountNumberSnapshot: string;
  bankIfscSnapshot: string;
  upiIdSnapshot: string | null;
  reference: string | null;
  transferDate: string | null;
  proofStorageKey: string | null;
  idempotencyKey: string;
  recordedByUserId: string;
  createdAt: string;
  updatedAt: string;
  items: MemberPayoutItem[];
}

export interface MemberSettlementRow {
  vendorId: string;
  businessName: string | null;
  bankDetailsOnFile: boolean;
  /** `••••1234`-style masked reference — `null` when no bank account is on file at all. The
   *  full account number stays detail-page-only (`MemberSettlementDetail.vendor`), never here. */
  bankReferenceMasked: string | null;
  /** The vendor's primary (oldest) branch — `null` for a vendor with no branch yet. */
  primaryBranchName: string | null;
  primaryBranchCity: string | null;
  pendingFulfilment: string;
  onHold: string;
  readyForPayout: string;
  paid: string;
}

export interface MemberSettlementDetail {
  vendor: {
    id: string;
    businessName: string | null;
    bankAccountHolder: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    upiId: string | null;
  };
  statement: PurchaseEntitlement[];
  eligibleItems: PurchaseEntitlement[];
  payoutHistory: MemberPayout[];
  auditTrail: AuditLogEntry[];
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listMemberSettlements(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; status?: 'ready' } = {},
) {
  return apiGet<MemberSettlementRow[]>(`/settlements/members${toQuery(opts)}`, token);
}

export function getMemberSettlementDetail(token: string | null, vendorId: string) {
  return apiGet<MemberSettlementDetail>(`/settlements/members/${vendorId}`, token);
}

/** `null` clears a vendor's commission override back to the global `FinanceSettings` default. */
export function setVendorCommissionRate(token: string | null, vendorId: string, commissionRatePercent: number | null) {
  return apiPut<{ id: string; commissionRatePercent: string | null }>(
    `/settlements/members/${vendorId}/commission-rate`,
    token,
    { commissionRatePercent },
  );
}

export interface RecordPayoutInput {
  entitlementIds: string[];
  reference?: string;
  transferDate?: string;
  proofStorageKey?: string;
  idempotencyKey?: string;
}

export function recordMemberPayout(token: string | null, vendorId: string, input: RecordPayoutInput) {
  return apiPost<MemberPayout>(`/settlements/members/${vendorId}/payouts`, token, input);
}
