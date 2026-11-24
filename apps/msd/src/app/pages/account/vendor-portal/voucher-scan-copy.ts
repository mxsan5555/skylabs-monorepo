import { formatLongDate } from '../../../../utils/format';
import type { VoucherScanResult } from '../../../../api/rbac/vouchers';

/**
 * Plain-language copy for a voucher scan result the vendor can't act on (every `VoucherScanResult`
 * except `VALID`) — shared between the Scan QR page's inline error and the Voucher Fulfilment
 * page's direct-URL error card, so the same result never reads differently in the two places.
 */
export function scanResultCopy(result: Exclude<VoucherScanResult, 'VALID'>, entitlement: { completedAt: string | null; qrExpiresAt: string | null }): string {
  switch (result) {
    case 'ALREADY_USED':
      return entitlement.completedAt ? `Already used on ${formatLongDate(entitlement.completedAt)}` : 'Already used';
    case 'EXPIRED':
      return entitlement.qrExpiresAt ? `Expired on ${formatLongDate(entitlement.qrExpiresAt)}` : 'Expired';
    case 'WRONG_MEMBER_BRANCH':
      return 'This voucher is for another spa';
    case 'PAYMENT_NOT_COMPLETE':
      return 'Payment not completed';
    case 'NOT_QR_ELIGIBLE':
      return "Products don't need a QR. Use the Picked up button on the orders page.";
    case 'CANCELLED_REFUNDED':
      return 'This purchase was cancelled or refunded';
    case 'NEEDS_REVIEW':
      return 'This voucher needs admin review — contact support';
  }
}

/** A scanned/looked-up code that doesn't match any voucher at all (404) — the one case
 *  `scanResultCopy` can't cover, since there is no `VoucherScanResult` for "not a voucher". */
export const UNKNOWN_QR_COPY = "This QR isn't a My Spa Deal voucher";
