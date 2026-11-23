import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type EntitlementStatus, type SettlementStatus } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import { getFinanceSettings } from './settlement.service';
import { shortOrderNumber } from './notification.service';
import { validateMediaFile } from './media-validation.service';
import { writeMediaFile } from '../lib/media-storage';
import type { MediaFile } from './media.service';

/**
 * Voucher verification + service/product fulfilment — the member-facing half of the Purchase
 * Verification flow. Every mutating action here resolves the caller's own Vendor via
 * `getVendorByOwnerUserId` and 404s (never confirms existence) if the voucher doesn't belong to
 * that vendor, same "404 not 403" discipline as `order.service.ts#getMyOrderOrThrow`.
 */

const ENTITLEMENT_INCLUDE = {
  orderItem: { select: { order: { select: { id: true, status: true } }, itemName: true } },
  customer: { select: { id: true, name: true, phone: true } },
  branch: { select: { name: true } },
  adjustments: { select: { amount: true } },
} as const;

/**
 * Every state a scanned/looked-up voucher can resolve to. Ownership (`WRONG_MEMBER_BRANCH`) is
 * checked first and always wins — never leak a voucher's fulfilment kind or status to a vendor
 * who doesn't own it. `NOT_QR_ELIGIBLE` covers a product code (products are never QR-redeemable).
 * `PAYMENT_NOT_COMPLETE` (an unpaid order) and `NEEDS_REVIEW` (disputed/voided/anomalous) used to
 * be one combined `ADMIN_REVIEW_REQUIRED` bucket — split so the scan screen can show "Payment not
 * completed" instead of a generic "needs review" message. `EXPIRED` is the QR's own independent
 * 30-day window (D40) — distinct from `ALREADY_USED`, which always wins when both could apply (a
 * used-then-later-expired voucher says "already used", not "expired").
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

async function findEntitlementOrThrow(code: string) {
  const entitlement = await prisma.purchaseEntitlement.findUnique({ where: { voucherCode: code }, include: ENTITLEMENT_INCLUDE });
  if (!entitlement) throw new ApiError('NOT_FOUND', 'Voucher not found');
  return entitlement;
}

/** Resolves the caller's own Vendor and asserts the voucher belongs to it — the one real
 *  authorization check every mutating voucher action shares. */
async function assertCallerOwnsVoucher(callerUserId: string, code: string) {
  const entitlement = await findEntitlementOrThrow(code);
  const vendor = await getVendorByOwnerUserId(callerUserId);
  if (!vendor || vendor.id !== entitlement.vendorId) {
    throw new ApiError('FORBIDDEN', 'This voucher does not belong to your business');
  }
  return entitlement;
}

/**
 * The one eligibility classification every voucher action shares — `verifyVoucher` (the scan-time
 * check) and the atomic `updateMany` guards in `finishService`/`markProductPickedUp` encode the
 * SAME rules, so there is never a second, looser copy of "is this voucher usable" drifting out of
 * sync. Order matters (first match wins): ownership first (never leak a voucher's state to the
 * wrong vendor), then QR-eligibility (a product code was scanned), then closed/blocked states,
 * then payment/order problems, then already-used (more specific than expired), then the QR
 * window, then `VALID`.
 */
function classifyVoucher(
  entitlement: {
    entitlementStatus: EntitlementStatus;
    settlementStatus: SettlementStatus;
    vendorId: string;
    fulfilmentKind: string;
    qrExpiresAt: Date | null;
    orderItem: { order: { status: string } };
  },
  vendor: { id: string } | null,
): VoucherScanResult {
  if (!vendor || vendor.id !== entitlement.vendorId) return 'WRONG_MEMBER_BRANCH';
  if (entitlement.fulfilmentKind !== 'SERVICE_SESSION') return 'NOT_QR_ELIGIBLE';
  if (entitlement.entitlementStatus === 'CANCELLED' || entitlement.entitlementStatus === 'REFUNDED' || entitlement.settlementStatus === 'VOID') {
    return 'CANCELLED_REFUNDED';
  }
  if (entitlement.settlementStatus === 'DISPUTED_BLOCKED') return 'NEEDS_REVIEW';
  if (entitlement.orderItem.order.status === 'PENDING_PAYMENT') return 'PAYMENT_NOT_COMPLETE';
  if (entitlement.orderItem.order.status === 'CANCELLED') return 'NEEDS_REVIEW';
  if (entitlement.entitlementStatus === 'COMPLETED') return 'ALREADY_USED';
  if (!entitlement.qrExpiresAt || entitlement.qrExpiresAt.getTime() <= Date.now()) return 'EXPIRED';
  return 'VALID';
}

/**
 * Read-only — never mutates state. A voucher that simply doesn't exist is a 404 (route-level
 * error), not one of the `VoucherScanResult` states. This is the single check the scan flow runs
 * on every decode AND the one the Voucher Fulfilment page re-runs on every mount — "reachable only
 * from a scan" is enforced by always re-verifying here, never by trusting how the page was opened.
 *
 * `customerPhone` is plain, unmasked (the vendor needs to actually contact this customer — see
 * PLANNING.md's resolved decision); email is dropped entirely, no vendor screen needs it.
 * `completedAt` drives the "Already used on <date>" copy; `serviceStartedAt` drives the "Service
 * in progress, started <time>" copy. Still exactly one `findUnique` — no
 * `update`/`updateMany` call is ever added here.
 */
export async function verifyVoucher(callerUserId: string, code: string) {
  const entitlement = await findEntitlementOrThrow(code);
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const result = classifyVoucher(entitlement, vendor);

  // Same "payable = memberShareAmount + Σadjustments" formula already used everywhere else this
  // is computed (e.g. settlement.service.ts's own aggregates) — never a second, divergent one.
  const memberShareAmount = entitlement.adjustments
    .reduce((sum, a) => sum.add(a.amount), new Prisma.Decimal(entitlement.memberShareAmount))
    .toFixed(2);

  return {
    result,
    entitlement: {
      voucherCode: entitlement.voucherCode,
      itemName: entitlement.orderItem.itemName,
      fulfilmentKind: entitlement.fulfilmentKind,
      entitlementStatus: entitlement.entitlementStatus,
      customerName: entitlement.customer.name,
      customerPhone: entitlement.customer.phone,
      orderId: entitlement.orderItem.order.id,
      orderNumber: shortOrderNumber(entitlement.orderItem.order.id),
      branchName: entitlement.branch?.name ?? null,
      grossAmount: new Prisma.Decimal(entitlement.grossAmount).toFixed(2),
      memberShareAmount,
      settlementStatus: entitlement.settlementStatus,
      purchasedAt: entitlement.createdAt,
      qrExpiresAt: entitlement.qrExpiresAt,
      completedAt: entitlement.completedAt,
      serviceStartedAt: entitlement.serviceStartedAt,
    },
  };
}

export async function startService(callerUserId: string, code: string) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  if (entitlement.fulfilmentKind !== 'SERVICE_SESSION') {
    throw new ApiError('VALIDATION_ERROR', 'Only a service voucher can be started');
  }
  const result = await prisma.purchaseEntitlement.updateMany({
    where: { id: entitlement.id, entitlementStatus: 'ACTIVE' },
    data: { entitlementStatus: 'STARTED', serviceStartedAt: new Date() },
  });
  if (result.count === 0) throw new ApiError('CONFLICT', 'This voucher has already been started or completed');
  return prisma.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
}

export async function shipProduct(callerUserId: string, code: string, input: { carrier: string; trackingNumber: string }) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  if (entitlement.fulfilmentKind === 'SERVICE_SESSION') {
    throw new ApiError('VALIDATION_ERROR', 'Only a product voucher can be shipped');
  }
  const result = await prisma.purchaseEntitlement.updateMany({
    where: { id: entitlement.id, entitlementStatus: 'ACTIVE' },
    data: { entitlementStatus: 'STARTED', fulfilmentKind: 'PRODUCT_SHIPPED', carrier: input.carrier, trackingNumber: input.trackingNumber, shippedAt: new Date() },
  });
  if (result.count === 0) throw new ApiError('CONFLICT', 'This voucher has already been shipped or completed');
  return prisma.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
}

function holdHoursFor(fulfilmentKind: string, settings: { serviceHoldHours: number; productReturnHoldHours: number }) {
  return fulfilmentKind === 'SERVICE_SESSION' ? settings.serviceHoldHours : settings.productReturnHoldHours;
}

/**
 * Vendor confirms a service is finished — reached only after a QR scan already validated the
 * voucher (`verifyVoucher`) and the vendor tapped "Start service" (`startService`). `SERVICE_SESSION`
 * entitlements only (a deal or direct therapist booking) — never a product, see
 * `markProductPickedUp` for that. No OTP anywhere in this path: no `CompletionOtpChallenge` row is
 * ever created, sent, or checked.
 *
 * Accepts `STARTED` (the normal path) and `OTP_REQUESTED` (a voucher that was mid-OTP before that
 * system was retired — treated identically to `STARTED` so it isn't permanently stuck; see
 * PLANNING.md's migration note). Deliberately does NOT re-check `qrExpiresAt` here — the window
 * was already validated at scan time, and a service legitimately in progress should not expire out
 * from under itself while the vendor is finishing it.
 *
 * Evaluated in ONE guarded `updateMany`, atomically, server-side only (the request carries no
 * status value for the server to trust) — same "conditional-update-and-check-the-count"
 * discipline `startService`/`shipProduct`/`markProductPickedUp` use, so two concurrent finish
 * calls for the same voucher can never both succeed. Never reads or writes `Deal`/`DealPackage`/
 * `Therapist`/`Branch` — the catalog listing is untouched.
 */
export async function finishService(callerUserId: string, code: string) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  if (entitlement.fulfilmentKind !== 'SERVICE_SESSION') {
    throw new ApiError('VALIDATION_ERROR', 'Only a deal or therapist-booking voucher can be finished this way');
  }

  const settings = await getFinanceSettings();
  const holdUntil = new Date(Date.now() + holdHoursFor(entitlement.fulfilmentKind, settings) * 60 * 60 * 1000);

  const result = await prisma.purchaseEntitlement.updateMany({
    where: {
      id: entitlement.id,
      entitlementStatus: { in: ['STARTED', 'OTP_REQUESTED'] },
      settlementStatus: { notIn: ['VOID', 'DISPUTED_BLOCKED'] },
      orderItem: { order: { status: { in: ['CONFIRMED', 'COMPLETED'] } } },
    },
    data: {
      entitlementStatus: 'COMPLETED',
      completedAt: new Date(),
      redeemedByUserId: callerUserId,
      settlementStatus: 'ON_HOLD',
      holdUntil,
    },
  });
  if (result.count === 0) {
    throw new ApiError('CONFLICT', 'This service can no longer be finished — it may already be completed or on hold for review');
  }
  return prisma.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
}

/**
 * Vendor confirms a product was picked up by the customer in person — one tap, no OTP, no QR
 * (products are never QR-eligible, see `classifyVoucher`). The voucher code is always sourced
 * from the vendor's own Orders/Order Detail list, never typed in by anyone. Mirrors
 * `finishService`'s shape exactly, just gated to `PRODUCT_PICKUP` and `ACTIVE`/`OTP_REQUESTED`
 * (pickup has no separate "start" step the way a service does).
 */
export async function markProductPickedUp(callerUserId: string, code: string) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  if (entitlement.fulfilmentKind !== 'PRODUCT_PICKUP') {
    throw new ApiError('VALIDATION_ERROR', 'Only a product awaiting pickup can be marked picked up');
  }

  const settings = await getFinanceSettings();
  const holdUntil = new Date(Date.now() + holdHoursFor(entitlement.fulfilmentKind, settings) * 60 * 60 * 1000);

  const result = await prisma.purchaseEntitlement.updateMany({
    where: {
      id: entitlement.id,
      entitlementStatus: { in: ['ACTIVE', 'OTP_REQUESTED'] },
      settlementStatus: { notIn: ['VOID', 'DISPUTED_BLOCKED'] },
      orderItem: { order: { status: { in: ['CONFIRMED', 'COMPLETED'] } } },
    },
    data: {
      entitlementStatus: 'COMPLETED',
      completedAt: new Date(),
      redeemedByUserId: callerUserId,
      settlementStatus: 'ON_HOLD',
      holdUntil,
    },
  });
  if (result.count === 0) {
    throw new ApiError('CONFLICT', 'This item can no longer be marked picked up — it may already be done or on hold for review');
  }
  return prisma.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
}

/**
 * Manual evidence workflow (photo + optional note) — deliberately not an auto "Delivered"
 * checkbox (no QR/courier-API integration exists — see the final report's own gap note).
 * Validated as a 'document' (PDF/JPG/JPEG/PNG, up to 5MB, no 30-80KB floor) rather than the
 * catalog-image profile ('image', 30-80KB) — a real phone photo of a delivered parcel is not a
 * pre-compressed web thumbnail, same reasoning as `vendor-document.service.ts`'s KYC uploads.
 */
export async function recordDeliveryEvidence(callerUserId: string, code: string, file: MediaFile, note: string | undefined) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  if (entitlement.fulfilmentKind !== 'PRODUCT_SHIPPED') {
    throw new ApiError('VALIDATION_ERROR', 'Delivery evidence can only be recorded for a shipped product voucher');
  }
  const validated = validateMediaFile(file.buffer, 'document');
  const { storageKey } = await writeMediaFile(`entitlement-evidence/${entitlement.id}`, file.buffer, validated.extension, 'private');
  const settings = await getFinanceSettings();
  const holdUntil = new Date(Date.now() + holdHoursFor(entitlement.fulfilmentKind, settings) * 60 * 60 * 1000);

  const result = await prisma.purchaseEntitlement.updateMany({
    where: { id: entitlement.id, entitlementStatus: 'STARTED' },
    data: {
      entitlementStatus: 'COMPLETED',
      completedAt: new Date(),
      settlementStatus: 'ON_HOLD',
      holdUntil,
      deliveryEvidenceStorageKey: storageKey,
      deliveryEvidenceNote: note,
    },
  });
  if (result.count === 0) throw new ApiError('CONFLICT', 'This voucher is not awaiting delivery evidence');
  return prisma.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
}

// ─── Pending fulfilment (vendor's Orders page, screens 1/6) ───────────────────

const OPEN_ENTITLEMENT_STATUSES: EntitlementStatus[] = ['ACTIVE', 'STARTED', 'OTP_REQUESTED'];

export interface PendingServiceRow {
  id: string;
  voucherCode: string;
  itemName: string;
  kind: 'DEAL' | 'THERAPIST';
  customerPhone: string | null;
  validTill: Date | null;
  orderId: string;
}

export interface PendingProductRow {
  id: string;
  voucherCode: string;
  itemName: string;
  fulfilmentKind: 'PRODUCT_PICKUP' | 'PRODUCT_SHIPPED';
  customerPhone: string | null;
  orderId: string;
}

/**
 * The Orders page's "Services waiting" / "Products to give or send" lists — the caller's own
 * vendor's still-open entitlements, oldest-waiting-first. Replaces the old searchable/paginated
 * Service Queue: these render as plain counted lists now, never a searchable table — search by
 * voucher code is gone entirely (scanning is the only way to act on a service voucher; a product
 * action is one tap from this same list, no lookup needed).
 */
export async function listPendingFulfilment(callerUserId: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  if (!vendor) throw new ApiError('NOT_FOUND', 'Complete your business profile first');

  const base = { vendorId: vendor.id, entitlementStatus: { in: OPEN_ENTITLEMENT_STATUSES } } as const;

  const [services, products] = await Promise.all([
    prisma.purchaseEntitlement.findMany({
      where: { ...base, fulfilmentKind: 'SERVICE_SESSION' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        voucherCode: true,
        qrExpiresAt: true,
        orderItem: { select: { itemName: true, dealId: true, therapistId: true, orderId: true } },
        customer: { select: { phone: true } },
      },
    }),
    prisma.purchaseEntitlement.findMany({
      where: { ...base, fulfilmentKind: { in: ['PRODUCT_PICKUP', 'PRODUCT_SHIPPED'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        voucherCode: true,
        fulfilmentKind: true,
        orderItem: { select: { itemName: true, orderId: true } },
        customer: { select: { phone: true } },
      },
    }),
  ]);

  const servicesWaiting: PendingServiceRow[] = services.map((e) => ({
    id: e.id,
    voucherCode: e.voucherCode,
    itemName: e.orderItem.itemName,
    // Deal and direct Therapist-booking lines are mutually exclusive (settlement.service.ts's
    // own `voucherPrefixFor` relies on the same distinction) — no "neither" case to handle here.
    kind: e.orderItem.therapistId ? 'THERAPIST' : 'DEAL',
    customerPhone: e.customer.phone,
    validTill: e.qrExpiresAt,
    orderId: e.orderItem.orderId,
  }));

  const productsPending: PendingProductRow[] = products.map((e) => ({
    id: e.id,
    voucherCode: e.voucherCode,
    itemName: e.orderItem.itemName,
    fulfilmentKind: e.fulfilmentKind as 'PRODUCT_PICKUP' | 'PRODUCT_SHIPPED',
    customerPhone: e.customer.phone,
    orderId: e.orderItem.orderId,
  }));

  return { servicesWaiting, productsPending };
}
