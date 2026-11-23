import { apiGet, apiPost, apiPostForm } from './client';
import type { EntitlementStatus, FulfilmentKind, SettlementStatus } from './settlements';

/**
 * Member-only Purchase Verification surface — voucher lookup (via a QR scan only, never typed)
 * + the Start/Finish/Pick-up/Ship/Evidence actions. No OTP anywhere. Mirrors `apps/msd-api`'s
 * `vouchers.routes.ts` exactly; the whole router is gated `vendor-portal.orders:custom`
 * server-side (lives on the same route as the existing vendor-portal Orders screen, no new menu
 * node).
 */

export type VoucherScanResult =
  | 'VALID'
  | 'ALREADY_USED'
  | 'EXPIRED'
  | 'CANCELLED_REFUNDED'
  | 'WRONG_MEMBER_BRANCH'
  | 'PAYMENT_NOT_COMPLETE'
  | 'NEEDS_REVIEW'
  | 'NOT_QR_ELIGIBLE';

export interface VoucherVerifyResponse {
  result: VoucherScanResult;
  entitlement: {
    voucherCode: string;
    itemName: string;
    fulfilmentKind: FulfilmentKind;
    entitlementStatus: EntitlementStatus;
    customerName: string | null;
    /** Plain, unmasked — the vendor needs to actually contact this customer. */
    customerPhone: string | null;
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
    /** The entitlement's own creation time (payment confirmation). */
    purchasedAt: string;
    /** The QR's own, independent 30-day expiry. `null` for a non-`SERVICE_SESSION` entitlement
     *  (every product), which never gets a QR. */
    qrExpiresAt: string | null;
    /** Set once the entitlement is COMPLETED — drives the "Already used on &lt;date&gt;" copy. */
    completedAt: string | null;
  };
}

/** Minimal entitlement shape every mutating voucher action (`start`/`finish-service`/`pick-up`/
 *  `ship`/`record-delivery-evidence`) returns — enough to drive the next screen. */
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

/** The one check the scan flow runs on every decode, and the one the Voucher Fulfilment page
 *  re-runs on every mount — "reachable only from a scan" is enforced by always re-verifying,
 *  never by trusting how the page was opened. */
export function verifyVoucher(token: string | null, code: string) {
  return apiPost<VoucherVerifyResponse>('/vouchers/verify', token, { code });
}

/** One deal/therapist-booking voucher still waiting to be scanned, or a product still waiting to
 *  be given/sent — the Orders page's "Services waiting" / "Products to give or send" lists. */
export interface PendingServiceRow {
  id: string;
  voucherCode: string;
  itemName: string;
  kind: 'DEAL' | 'THERAPIST';
  customerPhone: string | null;
  validTill: string | null;
  orderId: string;
}

export interface PendingProductRow {
  id: string;
  voucherCode: string;
  itemName: string;
  fulfilmentKind: Extract<FulfilmentKind, 'PRODUCT_PICKUP' | 'PRODUCT_SHIPPED'>;
  customerPhone: string | null;
  orderId: string;
}

export interface PendingFulfilmentResponse {
  servicesWaiting: PendingServiceRow[];
  productsPending: PendingProductRow[];
}

/** Unpaginated and unsearchable by design — see `voucher.service.ts#listPendingFulfilment`'s own
 *  doc comment; search by voucher code is gone entirely now that scanning is the only lookup. */
export function listPendingFulfilment(token: string | null) {
  return apiGet<PendingFulfilmentResponse>('/vouchers/pending-fulfilment', token);
}

export function startService(token: string | null, code: string) {
  return apiPost<VoucherEntitlement>(`/vouchers/${code}/start`, token);
}

/** No body — the server never takes a status value from the client. Only succeeds for a
 *  `STARTED` (or legacy `OTP_REQUESTED`) `SERVICE_SESSION` entitlement. */
export function finishService(token: string | null, code: string) {
  return apiPost<VoucherEntitlement>(`/vouchers/${code}/finish-service`, token);
}

/** No body — same discipline as `finishService`. Only succeeds for an `ACTIVE` (or legacy
 *  `OTP_REQUESTED`) `PRODUCT_PICKUP` entitlement. */
export function markProductPickedUp(token: string | null, code: string) {
  return apiPost<VoucherEntitlement>(`/vouchers/${code}/pick-up`, token);
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
