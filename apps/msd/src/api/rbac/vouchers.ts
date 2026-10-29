import { apiGet, apiPost, apiPostForm } from './client';
import type { EntitlementStatus, FulfilmentKind, SettlementStatus } from './settlements';

/**
 * Member-only Purchase Verification surface — voucher lookup + the Start/OTP/Complete/Ship/
 * Evidence actions. Mirrors `apps/msd-api`'s `vouchers.routes.ts` exactly; the whole router is
 * gated `vendor-portal.orders:custom` server-side (lives on the same route as the existing
 * vendor-portal Orders screen, no new menu node).
 */

export type VoucherVerifyResult = 'VALID' | 'ALREADY_USED' | 'EXPIRED' | 'CANCELLED_REFUNDED' | 'WRONG_MEMBER_BRANCH' | 'ADMIN_REVIEW_REQUIRED';

/** Safe, non-mutating projection of "the latest unverified CompletionOtpChallenge" — only present
 *  when `entitlementStatus === 'OTP_REQUESTED'` (omitted entirely otherwise, never `null`). All
 *  time fields are ISO date strings. Never includes the OTP itself (hashed or plaintext) — see
 *  msd-api's `voucher.service.ts#projectOtpChallenge` doc comment. `resendAvailableAt` is the one
 *  source of truth for whether "Resend" is enabled — compute the cooldown client-side from this
 *  timestamp rather than inventing a separate client-side timer. */
export interface VoucherOtpChallenge {
  requestedAt: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
  resendAvailableAt: string;
}

export interface VoucherVerifyResponse {
  result: VoucherVerifyResult;
  entitlement: {
    voucherCode: string;
    itemName: string;
    fulfilmentKind: FulfilmentKind;
    entitlementStatus: EntitlementStatus;
    customerName: string | null;
    /** `••••<last4>`-style masked destination, `null` when nothing to mask (same convention as
     *  `settlement.service.ts#maskBankAccountNumber`) — never the real phone/email. */
    customerPhoneMasked: string | null;
    customerEmailMasked: string | null;
    orderId: string;
    /** Derived display reference (`ORD-xxxxxxxx`), same `shortOrderNumber` convention used
     *  everywhere else an order is shown — never a second numbering scheme. */
    orderNumber: string;
    branchName: string | null;
    /** Decimal strings, same convention as every other money field in this app. */
    grossAmount: string;
    /** `memberShareAmount` snapshot + any settlement adjustments, already summed server-side —
     *  the one "current payable" formula, never re-derived differently on the client. */
    memberShareAmount: string;
    settlementStatus: SettlementStatus;
    /** Only present when `entitlementStatus === 'OTP_REQUESTED'`. */
    otpChallenge?: VoucherOtpChallenge;
  };
}

/** Minimal entitlement shape every mutating voucher action (`start`/`complete`/`ship`/
 *  `record-delivery-evidence`) returns — enough to drive the Verify Purchase panel's next step. */
export interface VoucherEntitlement {
  id: string;
  voucherCode: string;
  orderItemId: string;
  fulfilmentKind: FulfilmentKind;
  entitlementStatus: EntitlementStatus;
  serviceStartedAt: string | null;
  completedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
}

export function verifyVoucher(token: string | null, code: string) {
  return apiPost<VoucherVerifyResponse>('/vouchers/verify', token, { code });
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/** One row of the Service Queue — the caller's own vendor's `PurchaseEntitlement` rows,
 *  server-paginated/searched, actionable rows (not yet COMPLETED/CANCELLED/REFUNDED) sorted
 *  before closed ones. See `GET /vouchers/queue`, same `vendor-portal.orders:custom` gate as the
 *  rest of this router. */
export interface VoucherQueueRow {
  id: string;
  voucherCode: string;
  itemName: string;
  customerName: string | null;
  entitlementStatus: EntitlementStatus;
  fulfilmentKind: FulfilmentKind;
  settlementStatus: SettlementStatus;
}

export function getVoucherQueue(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<VoucherQueueRow[]>(`/vouchers/queue${toQuery(opts)}`, token);
}

export function startService(token: string | null, code: string) {
  return apiPost<VoucherEntitlement>(`/vouchers/${code}/start`, token);
}

/** Sends the completion OTP straight to the CUSTOMER's own phone/email — never returned here. */
export function requestCompletionOtp(token: string | null, code: string) {
  return apiPost<{ requested: true }>(`/vouchers/${code}/request-completion-otp`, token);
}

export function completeVoucher(token: string | null, code: string, otp: string) {
  return apiPost<VoucherEntitlement>(`/vouchers/${code}/complete`, token, { otp });
}

export function shipVoucher(token: string | null, code: string, input: { carrier: string; trackingNumber: string }) {
  return apiPost<VoucherEntitlement>(`/vouchers/${code}/ship`, token, input);
}

/** Multipart — a real delivery/pickup evidence photo (`file`) + optional `note`, same manual
 *  evidence workflow as the vendor KYC document uploads. */
export function recordDeliveryEvidence(token: string | null, code: string, file: Blob, filename: string, note?: string) {
  const formData = new FormData();
  formData.append('file', file, filename);
  if (note) formData.append('note', note);
  return apiPostForm<VoucherEntitlement>(`/vouchers/${code}/record-delivery-evidence`, token, formData);
}
