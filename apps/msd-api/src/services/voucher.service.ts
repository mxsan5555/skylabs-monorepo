import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type EntitlementStatus } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import { getFinanceSettings, maskBankAccountNumber } from './settlement.service';
import { shortOrderNumber } from './notification.service';
import { validateMediaFile } from './media-validation.service';
import { writeMediaFile } from '../lib/media-storage';
import { sendOtp as sendSmsOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';
import type { MediaFile } from './media.service';

/**
 * Voucher verification + service/product fulfilment — the member-facing half of the Purchase
 * Verification flow. Every mutating action here resolves the caller's own Vendor via
 * `getVendorByOwnerUserId` and 404s (never confirms existence) if the voucher doesn't belong to
 * that vendor, same "404 not 403" discipline as `order.service.ts#getMyOrderOrThrow`.
 */

const ENTITLEMENT_INCLUDE = {
  orderItem: { select: { order: { select: { id: true, status: true } }, itemName: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  branch: { select: { name: true } },
  adjustments: { select: { amount: true } },
} as const;

export type VoucherVerifyResult = 'VALID' | 'ALREADY_USED' | 'EXPIRED' | 'CANCELLED_REFUNDED' | 'WRONG_MEMBER_BRANCH' | 'ADMIN_REVIEW_REQUIRED';

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
 * Safe, non-mutating projection of "the latest unverified CompletionOtpChallenge" for the
 * resumable verification page's OTP step — looked up the exact same way
 * `requestCompletionOtp`/`completeVoucher` already find it (`findFirst` on
 * `{ entitlementId, verifiedAt: null }`, newest first). NEVER includes `hashedOtp` or any
 * plaintext (there is no plaintext stored anywhere in this schema) — only timing/attempt
 * metadata the frontend needs to render "OTP sent, N attempts left, resend available at …"
 * without re-sending.
 */
async function projectOtpChallenge(entitlementId: string) {
  const [settings, challenge] = await Promise.all([
    getFinanceSettings(),
    prisma.completionOtpChallenge.findFirst({
      where: { entitlementId, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  if (!challenge) return undefined;
  return {
    requestedAt: challenge.lastSentAt,
    expiresAt: challenge.expiresAt,
    attempts: challenge.attempts,
    maxAttempts: settings.completionOtpMaxAttempts,
    resendAvailableAt: new Date(challenge.lastSentAt.getTime() + settings.completionOtpResendCooldownSeconds * 1000),
  };
}

/**
 * Read-only — never mutates state. Returns one of the exact result states the spec lists; a
 * voucher that simply doesn't exist is a 404 (route-level error), not one of these states.
 * `EXPIRED` has no backing field yet (no per-voucher expiry concept was part of the approved data
 * model — see the final report's own "known gap" note) — included in the result union for
 * forward API-shape compatibility, never actually returned today.
 *
 * Also the resumable Verification page's entire data source: masked
 * `customerPhoneMasked`/`customerEmailMasked` (same `••••<last4>` convention as
 * `settlement.service.ts#maskBankAccountNumber`, reused literally rather than re-implemented)
 * and, only when `entitlementStatus === 'OTP_REQUESTED'`, an `otpChallenge` block (see
 * `projectOtpChallenge` above) — omitted entirely otherwise, never `null`. Still exactly one
 * `findUnique` + (conditionally) one more read — no `update`/`updateMany` call is ever added here.
 */
export async function verifyVoucher(callerUserId: string, code: string) {
  const entitlement = await findEntitlementOrThrow(code);
  const vendor = await getVendorByOwnerUserId(callerUserId);

  let result: VoucherVerifyResult;
  if (!vendor || vendor.id !== entitlement.vendorId) {
    result = 'WRONG_MEMBER_BRANCH';
  } else if (!['CONFIRMED', 'COMPLETED'].includes(entitlement.orderItem.order.status)) {
    result = 'ADMIN_REVIEW_REQUIRED';
  } else if (entitlement.entitlementStatus === 'CANCELLED' || entitlement.entitlementStatus === 'REFUNDED' || entitlement.settlementStatus === 'VOID') {
    result = 'CANCELLED_REFUNDED';
  } else if (entitlement.settlementStatus === 'DISPUTED_BLOCKED') {
    result = 'ADMIN_REVIEW_REQUIRED';
  } else if (entitlement.entitlementStatus === 'COMPLETED') {
    result = 'ALREADY_USED';
  } else {
    result = 'VALID';
  }

  const otpChallenge = entitlement.entitlementStatus === 'OTP_REQUESTED' ? await projectOtpChallenge(entitlement.id) : undefined;

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
      customerPhoneMasked: maskBankAccountNumber(entitlement.customer.phone),
      customerEmailMasked: maskBankAccountNumber(entitlement.customer.email),
      orderId: entitlement.orderItem.order.id,
      orderNumber: shortOrderNumber(entitlement.orderItem.order.id),
      branchName: entitlement.branch?.name ?? null,
      grossAmount: new Prisma.Decimal(entitlement.grossAmount).toFixed(2),
      memberShareAmount,
      settlementStatus: entitlement.settlementStatus,
      ...(otpChallenge ? { otpChallenge } : {}),
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
  const { storageKey } = await writeMediaFile('entitlement-evidence', entitlement.id, file.buffer, validated.extension);
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
      recordedByUserId: callerUserId,
    },
  });
  if (result.count === 0) throw new ApiError('CONFLICT', 'This voucher is not awaiting delivery evidence');
  return prisma.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
}

// ─── Completion OTP (service completion / product pickup) ────────────────────

function isPhoneIdentifier(identifier: string): boolean {
  return !identifier.includes('@');
}

const OTP_HASH_ROUNDS = 10;

export async function requestCompletionOtp(callerUserId: string, code: string) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  if (entitlement.entitlementStatus !== 'ACTIVE' && entitlement.entitlementStatus !== 'STARTED' && entitlement.entitlementStatus !== 'OTP_REQUESTED') {
    throw new ApiError('CONFLICT', 'This voucher is not awaiting completion');
  }
  if (entitlement.fulfilmentKind === 'PRODUCT_SHIPPED') {
    throw new ApiError('VALIDATION_ERROR', 'A shipped product is completed via delivery evidence, not an OTP');
  }

  const settings = await getFinanceSettings();
  const lastChallenge = await prisma.completionOtpChallenge.findFirst({
    where: { entitlementId: entitlement.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (lastChallenge) {
    const cooldownMs = settings.completionOtpResendCooldownSeconds * 1000;
    const elapsed = Date.now() - lastChallenge.lastSentAt.getTime();
    if (elapsed < cooldownMs) {
      throw new ApiError('RATE_LIMITED', `Please wait before requesting another OTP (${Math.ceil((cooldownMs - elapsed) / 1000)}s)`);
    }
  }

  const customer = entitlement.customer;
  const identifier = customer.phone ?? customer.email;
  if (!identifier) throw new ApiError('SERVER_ERROR', 'This customer has no phone or email on file to send the OTP to');

  const otp = crypto.randomInt(100000, 999999).toString();
  const hashedOtp = await bcrypt.hash(otp, OTP_HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + settings.completionOtpExpiryMinutes * 60 * 1000);
  const purpose = entitlement.fulfilmentKind === 'SERVICE_SESSION' ? 'SERVICE_COMPLETION' : 'PRODUCT_PICKUP';

  await prisma.$transaction([
    prisma.completionOtpChallenge.create({
      data: {
        entitlementId: entitlement.id,
        purpose,
        hashedOtp,
        expiresAt,
        resendCount: lastChallenge ? lastChallenge.resendCount + 1 : 0,
        lastSentAt: new Date(),
        requestedByUserId: callerUserId,
      },
    }),
    prisma.purchaseEntitlement.updateMany({
      where: { id: entitlement.id, entitlementStatus: { in: ['ACTIVE', 'STARTED'] } },
      data: { entitlementStatus: 'OTP_REQUESTED' },
    }),
  ]);

  // Member never sees the plaintext OTP through this (or any) API response — it's sent directly
  // to the CUSTOMER's own identifier, same provider functions `otp.service.ts` uses for login.
  const delivered = isPhoneIdentifier(identifier) ? await sendSmsOtp(identifier, otp) : await sendOtpEmail(identifier, otp);
  if (!delivered) {
    throw new ApiError('SERVER_ERROR', 'Failed to send the completion OTP — please try again in a moment');
  }
}

/**
 * Member submits the OTP the customer read out to them. Guards against two concurrent `complete`
 * calls succeeding for the same voucher with a CONDITIONAL `updateMany` (not a blind `update`) —
 * only the first one flips state; the second gets a clean "already completed" conflict, never a
 * duplicate financial eligibility (see PurchaseEntitlement's own schema doc comment).
 */
export async function completeVoucher(callerUserId: string, code: string, otp: string) {
  const entitlement = await assertCallerOwnsVoucher(callerUserId, code);
  const settings = await getFinanceSettings();

  const challenge = await prisma.completionOtpChallenge.findFirst({
    where: { entitlementId: entitlement.id, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw new ApiError('UNAUTHORIZED', 'No pending OTP for this voucher — request one first');
  if (challenge.expiresAt.getTime() < Date.now()) throw new ApiError('UNAUTHORIZED', 'OTP has expired — request a new one');
  if (challenge.attempts >= settings.completionOtpMaxAttempts) {
    throw new ApiError('RATE_LIMITED', 'Too many incorrect attempts — request a new OTP');
  }

  const isMatch = await bcrypt.compare(otp, challenge.hashedOtp);
  if (!isMatch) {
    await prisma.completionOtpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError('UNAUTHORIZED', 'Incorrect OTP');
  }

  const holdUntil = new Date(Date.now() + holdHoursFor(entitlement.fulfilmentKind, settings) * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const result = await tx.purchaseEntitlement.updateMany({
      where: { id: entitlement.id, entitlementStatus: { in: ['STARTED', 'OTP_REQUESTED'] } },
      data: { entitlementStatus: 'COMPLETED', completedAt: new Date(), settlementStatus: 'ON_HOLD', holdUntil },
    });
    if (result.count === 0) throw new ApiError('CONFLICT', 'This voucher has already been completed');
    await tx.completionOtpChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date() } });
    return tx.purchaseEntitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
  });
}

// ─── Service Queue (member-facing list of own entitlements) ──────────────────

/** Not yet closed out — sorts before `CLOSED_ENTITLEMENT_STATUSES` on the Service Queue. */
const ACTIONABLE_ENTITLEMENT_STATUSES: EntitlementStatus[] = ['ACTIVE', 'STARTED', 'OTP_REQUESTED'];
const CLOSED_ENTITLEMENT_STATUSES: EntitlementStatus[] = ['COMPLETED', 'CANCELLED', 'REFUNDED'];

/** Narrow, list-row-only select — deliberately omits `adjustments`/`completionOtps`/`disputes`
 *  (none needed for a queue row, and including a to-many relation here would multiply rows). */
const QUEUE_SELECT = {
  id: true,
  voucherCode: true,
  entitlementStatus: true,
  fulfilmentKind: true,
  settlementStatus: true,
  orderItem: { select: { itemName: true } },
  customer: { select: { name: true } },
} as const;

type QueueRow = Prisma.PurchaseEntitlementGetPayload<{ select: typeof QUEUE_SELECT }>;

function queueWhere(vendorId: string, statuses: EntitlementStatus[], search?: string): Prisma.PurchaseEntitlementWhereInput {
  return {
    vendorId,
    entitlementStatus: { in: statuses },
    ...(search
      ? {
          OR: [
            { voucherCode: { contains: search, mode: 'insensitive' as const } },
            { orderItem: { is: { itemName: { contains: search, mode: 'insensitive' as const } } } },
            { customer: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
}

function mapQueueRow(row: QueueRow) {
  return {
    id: row.id,
    voucherCode: row.voucherCode,
    itemName: row.orderItem.itemName,
    customerName: row.customer.name,
    entitlementStatus: row.entitlementStatus,
    fulfilmentKind: row.fulfilmentKind,
    settlementStatus: row.settlementStatus,
  };
}

/**
 * Service Queue — the caller's own vendor's `PurchaseEntitlement` rows, paginated/searchable.
 * One DB row = one queue row by construction (`QUEUE_SELECT` includes no to-many relation), so
 * there is no de-duplication step. Actionable rows (`ACTIONABLE_ENTITLEMENT_STATUSES` — not yet
 * COMPLETED/CANCELLED/REFUNDED) sort before closed ones; rather than leaning on the DB's native
 * enum declaration order (fragile — breaks silently if the enum is ever reordered), this runs the
 * two groups as two separate `count`+`findMany` queries, each ordered by recency, and stitches
 * them into one page — at most 4 queries total, same "batch, never a fragile shortcut" discipline
 * as the rest of this codebase.
 */
export async function listMyVoucherQueue(callerUserId: string, opts: { page: number; pageSize: number; search?: string }) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  if (!vendor) throw new ApiError('NOT_FOUND', 'Complete your business profile first');

  const actionableWhere = queueWhere(vendor.id, ACTIONABLE_ENTITLEMENT_STATUSES, opts.search);
  const closedWhere = queueWhere(vendor.id, CLOSED_ENTITLEMENT_STATUSES, opts.search);

  const [actionableTotal, closedTotal] = await Promise.all([
    prisma.purchaseEntitlement.count({ where: actionableWhere }),
    prisma.purchaseEntitlement.count({ where: closedWhere }),
  ]);
  const total = actionableTotal + closedTotal;
  const skip = (opts.page - 1) * opts.pageSize;

  let rows: QueueRow[];
  if (skip < actionableTotal) {
    const fromActionable = await prisma.purchaseEntitlement.findMany({
      where: actionableWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: opts.pageSize,
      select: QUEUE_SELECT,
    });
    const remaining = opts.pageSize - fromActionable.length;
    const fromClosed =
      remaining > 0 && closedTotal > 0
        ? await prisma.purchaseEntitlement.findMany({
            where: closedWhere,
            orderBy: { createdAt: 'desc' },
            take: remaining,
            select: QUEUE_SELECT,
          })
        : [];
    rows = [...fromActionable, ...fromClosed];
  } else {
    rows = await prisma.purchaseEntitlement.findMany({
      where: closedWhere,
      orderBy: { createdAt: 'desc' },
      skip: skip - actionableTotal,
      take: opts.pageSize,
      select: QUEUE_SELECT,
    });
  }

  return { items: rows.map(mapQueueRow), total };
}
