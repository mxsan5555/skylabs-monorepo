import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type Member } from '../generated/prisma-client';
import { nextVoucherCode, type VoucherPrefix } from '../lib/voucher';
import { notifyVendorOwner } from './notification.service';
import crypto from 'crypto';

/**
 * Accounts / Member Settlements / Purchase Verification — the money side of the new domain. See
 * the approved plan (ticklish-marinating-reef.md) for the full design; this file owns:
 * `FinanceSettings` CRUD, `createEntitlementsForOrder` (the hook called from every one of
 * `payment.service.ts`'s 5 CONFIRMED-transition sites), the Accounts Overview aggregates, the
 * Customer Payments list, and Member Settlements list/detail/payout-recording.
 */

const FINANCE_SETTINGS_ID = 'singleton';

export async function getFinanceSettings() {
  return prisma.financeSettings.upsert({
    where: { id: FINANCE_SETTINGS_ID },
    update: {},
    create: { id: FINANCE_SETTINGS_ID },
  });
}

export async function updateFinanceSettings(
  userId: string,
  input: Partial<{
    defaultCommissionRatePercent: number;
    serviceHoldHours: number;
    productReturnHoldHours: number;
    completionOtpExpiryMinutes: number;
    completionOtpMaxAttempts: number;
    completionOtpResendCooldownSeconds: number;
  }>,
) {
  await getFinanceSettings(); // ensure the singleton row exists before a partial update
  return prisma.financeSettings.update({
    where: { id: FINANCE_SETTINGS_ID },
    data: { ...input, updatedByUserId: userId },
  });
}

export async function setVendorCommissionRate(vendorId: string, commissionRatePercent: number | null) {
  const vendor = await prisma.member.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new ApiError('NOT_FOUND', 'Vendor not found');
  return prisma.member.update({ where: { id: vendorId }, data: { commissionRatePercent } });
}

/** `vendor.commissionRatePercent` override wins; otherwise the global default. Resolved ONCE per
 *  entitlement, at creation time, and snapshotted permanently (see PurchaseEntitlement's own
 *  schema doc comment) — never re-resolved later. */
function resolveCommissionRate(vendor: Pick<Member, 'commissionRatePercent'>, settings: { defaultCommissionRatePercent: Prisma.Decimal }): Prisma.Decimal {
  return vendor.commissionRatePercent != null ? new Prisma.Decimal(vendor.commissionRatePercent) : new Prisma.Decimal(settings.defaultCommissionRatePercent);
}

function voucherPrefixFor(item: { dealId: string | null; therapistId: string | null; productId: string | null }): VoucherPrefix {
  if (item.dealId) return 'DL';
  if (item.therapistId) return 'TH';
  return 'PR';
}

/** Splits `lineTotal` evenly across `units` whole-paise amounts, with the rounding remainder
 *  absorbed entirely by the LAST unit — so `Σ returned === lineTotal` exactly, every time. */
function splitEvenly(lineTotal: Prisma.Decimal, units: number): Prisma.Decimal[] {
  const cents = lineTotal.mul(100).round();
  const perUnit = cents.div(units).floor();
  const remainder = cents.sub(perUnit.mul(units));
  const out: Prisma.Decimal[] = [];
  for (let i = 0; i < units; i++) {
    const unitCents = i === units - 1 ? perUnit.add(remainder) : perUnit;
    out.push(unitCents.div(100));
  }
  return out;
}

/**
 * The hook called from all 5 of `payment.service.ts`'s CONFIRMED-transition sites, inside the
 * SAME `$transaction` as `finalizeCartForOrder`/`notifyOrderConfirmed`. Idempotent: no-ops if any
 * entitlement already exists for this order's items (mirrors the idempotent-replay discipline
 * already established at every one of those call sites — a webhook retry or a stray double-call
 * must never create a second set of vouchers for the same order).
 *
 * One `PurchaseEntitlement` per unit of quantity for a SERVICE item (so each unit is an
 * independently redeemable/payable voucher), exactly ONE per PRODUCT item regardless of quantity
 * — see this file's own module doc comment / PurchaseEntitlement's schema doc comment for why.
 */
export async function createEntitlementsForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  if (items.length === 0) return;

  const existing = await tx.purchaseEntitlement.findFirst({ where: { orderItemId: { in: items.map((i) => i.id) } } });
  if (existing) return; // already created for this order — idempotent no-op

  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { customerId: true } });
  const settings = await tx.financeSettings.upsert({ where: { id: FINANCE_SETTINGS_ID }, update: {}, create: { id: FINANCE_SETTINGS_ID } });

  const vendorIds = [...new Set(items.map((i) => i.vendorId))];
  const vendors = await tx.member.findMany({ where: { id: { in: vendorIds } }, select: { id: true, commissionRatePercent: true } });
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  for (const item of items) {
    const vendor = vendorById.get(item.vendorId);
    if (!vendor) continue; // defensive — every OrderItem.vendorId is a real FK, should never happen
    const commissionRatePercent = resolveCommissionRate(vendor, settings);
    const isService = item.itemType === 'SERVICE';
    const units = isService ? item.quantity : 1;
    const grossAmounts = splitEvenly(new Prisma.Decimal(item.lineTotal), units);
    const prefix = voucherPrefixFor(item);

    for (let seq = 1; seq <= units; seq++) {
      const grossAmount = grossAmounts[seq - 1];
      const commissionAmount = grossAmount.mul(commissionRatePercent).div(100).toDecimalPlaces(2);
      const memberShareAmount = grossAmount.sub(commissionAmount);
      const voucherCode = await nextVoucherCode(prefix);

      await tx.purchaseEntitlement.create({
        data: {
          orderItemId: item.id,
          sequenceNo: seq,
          voucherCode,
          customerId: order.customerId,
          vendorId: item.vendorId,
          branchId: item.branchId,
          // See this file's own doc comment on `voucherPrefixFor`/the module header for why a
          // fresh PRODUCT entitlement always starts PICKUP — `POST /vouchers/:code/ship` is what
          // flips it to PRODUCT_SHIPPED, since checkout collects no pickup-vs-ship choice today.
          fulfilmentKind: isService ? 'SERVICE_SESSION' : 'PRODUCT_PICKUP',
          grossAmount,
          commissionRatePercent,
          commissionAmount,
          memberShareAmount,
        },
      });
    }
  }
}

// ─── Accounts Overview ────────────────────────────────────────────────────────

export async function getAccountsOverview() {
  const now = new Date();
  const [all, readyForPayout, readyForPayoutVendors] = await Promise.all([
    prisma.purchaseEntitlement.findMany({
      select: { grossAmount: true, commissionAmount: true, memberShareAmount: true, settlementStatus: true, adjustments: { select: { amount: true } } },
    }),
    prisma.purchaseEntitlement.aggregate({
      where: { settlementStatus: 'ON_HOLD', holdUntil: { lte: now } },
      _sum: { memberShareAmount: true },
    }),
    // Same "Ready for Payout" predicate as the aggregate above, just counting DISTINCT vendors
    // instead of summing amounts — Prisma has no `_count: { distinct }` on `aggregate`, so this
    // is a narrow `findMany` + `distinct` instead of a second raw amount.
    prisma.purchaseEntitlement.findMany({
      where: { settlementStatus: 'ON_HOLD', holdUntil: { lte: now } },
      select: { vendorId: true },
      distinct: ['vendorId'],
    }),
  ]);

  const zero = new Prisma.Decimal(0);
  let collections = zero;
  let commission = zero;
  let memberLiability = zero;
  let pendingFulfilment = zero;
  let onHold = zero;
  let paid = zero;

  for (const row of all) {
    const payable = row.adjustments.reduce((sum, a) => sum.add(a.amount), new Prisma.Decimal(row.memberShareAmount));
    collections = collections.add(row.grossAmount);
    commission = commission.add(row.commissionAmount);
    if (row.settlementStatus === 'VOID' || row.settlementStatus === 'FAILED') continue;
    if (row.settlementStatus === 'PAID') {
      paid = paid.add(payable);
      continue;
    }
    memberLiability = memberLiability.add(payable);
    if (row.settlementStatus === 'PENDING_FULFILMENT') pendingFulfilment = pendingFulfilment.add(payable);
    if (row.settlementStatus === 'ON_HOLD' || row.settlementStatus === 'DISPUTED_BLOCKED' || row.settlementStatus === 'PROCESSING') {
      onHold = onHold.add(payable);
    }
  }

  return {
    collections,
    commission,
    memberLiability,
    pendingFulfilment,
    onHold,
    readyForPayout: readyForPayout._sum.memberShareAmount ?? zero,
    paid,
    // Additive — count of distinct vendors currently eligible for payout (the "Ready for Payout"
    // strip's member count), alongside the pre-existing amount above. Every field above this one
    // is unchanged.
    readyForPayoutMemberCount: readyForPayoutVendors.length,
  };
}

// ─── Customer Payments ────────────────────────────────────────────────────────

interface CustomerPaymentsOpts {
  page: number;
  pageSize: number;
  vendorId?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
}

function customerPaymentsWhere(opts: Omit<CustomerPaymentsOpts, 'page' | 'pageSize'>): Prisma.OrderWhereInput {
  return {
    status: { in: ['CONFIRMED', 'COMPLETED'] },
    ...(opts.vendorId ? { items: { some: { vendorId: opts.vendorId } } } : {}),
    ...(opts.createdFrom || opts.createdTo
      ? { createdAt: { ...(opts.createdFrom ? { gte: new Date(opts.createdFrom) } : {}), ...(opts.createdTo ? { lte: new Date(opts.createdTo) } : {}) } }
      : {}),
    ...(opts.search
      ? {
          OR: [
            { vendorNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } },
            { customer: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
}

export async function listCustomerPayments(opts: CustomerPaymentsOpts) {
  const where = customerPaymentsWhere(opts);
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        payments: { select: { provider: true, status: true, amount: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total };
}

export async function listCustomerPaymentsForExport(opts: Omit<CustomerPaymentsOpts, 'page' | 'pageSize'>) {
  const where = customerPaymentsWhere(opts);
  return prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      payments: { select: { provider: true, status: true, amount: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
}

// ─── Member Settlements ───────────────────────────────────────────────────────

const VENDOR_SETTLEMENT_SELECT = { id: true, businessName: true, bankAccountNumber: true, bankIfsc: true } as const;
type VendorForSettlement = Prisma.MemberGetPayload<{ select: typeof VENDOR_SETTLEMENT_SELECT }>;

/** Last-4-digits-only display reference (e.g. `••••1234`) — the full `Vendor.bankAccountNumber`
 *  stays detail-page-only (`getMemberSettlementDetail`, untouched); this list response never
 *  carries it. `null` when no bank account is on file at all (distinct from an empty string).
 *  Exported: `voucher.service.ts#verifyVoucher` reuses this exact convention (not a second
 *  copy) to mask the customer's phone/email destination for the OTP step. */
export function maskBankAccountNumber(accountNumber: string | null): string | null {
  if (!accountNumber) return null;
  return `••••${accountNumber.slice(-4)}`;
}

/** One extra query, never N+1 — a vendor's "primary" branch for display purposes is just its
 *  oldest one (no dedicated primary-branch flag exists on Branch today); every vendor's branches
 *  are fetched in a single `IN (...)` query and reduced to a first-by-createdAt map in memory. */
async function primaryBranchByVendorId(vendorIds: string[]): Promise<Map<string, { name: string; city: string | null }>> {
  const map = new Map<string, { name: string; city: string | null }>();
  if (vendorIds.length === 0) return map;
  const branches = await prisma.branch.findMany({
    where: { vendorId: { in: vendorIds } },
    orderBy: { createdAt: 'asc' },
    select: { vendorId: true, name: true, city: true },
  });
  for (const branch of branches) {
    if (!map.has(branch.vendorId)) map.set(branch.vendorId, { name: branch.name, city: branch.city });
  }
  return map;
}

async function buildMemberSettlementRow(vendor: VendorForSettlement, branch: { name: string; city: string | null } | undefined) {
  const now = new Date();
  const rows = await prisma.purchaseEntitlement.findMany({
    where: { vendorId: vendor.id },
    select: { memberShareAmount: true, settlementStatus: true, holdUntil: true, adjustments: { select: { amount: true } } },
  });
  const zero = new Prisma.Decimal(0);
  let pendingFulfilment = zero;
  let onHold = zero;
  let readyForPayout = zero;
  let paid = zero;
  for (const row of rows) {
    const payable = row.adjustments.reduce((sum, a) => sum.add(a.amount), new Prisma.Decimal(row.memberShareAmount));
    if (row.settlementStatus === 'PENDING_FULFILMENT') pendingFulfilment = pendingFulfilment.add(payable);
    else if (row.settlementStatus === 'ON_HOLD' && row.holdUntil && row.holdUntil <= now) readyForPayout = readyForPayout.add(payable);
    else if (row.settlementStatus === 'ON_HOLD' || row.settlementStatus === 'DISPUTED_BLOCKED') onHold = onHold.add(payable);
    else if (row.settlementStatus === 'PAID') paid = paid.add(payable);
  }
  return {
    vendorId: vendor.id,
    businessName: vendor.businessName,
    bankDetailsOnFile: Boolean(vendor.bankAccountNumber && vendor.bankIfsc),
    bankReferenceMasked: maskBankAccountNumber(vendor.bankAccountNumber),
    primaryBranchName: branch?.name ?? null,
    primaryBranchCity: branch?.city ?? null,
    pendingFulfilment,
    onHold,
    readyForPayout,
    paid,
  };
}

export async function listMemberSettlements(opts: { page: number; pageSize: number; search?: string; status?: 'ready' }) {
  const where: Prisma.MemberWhereInput = opts.search
    ? { businessName: { contains: opts.search, mode: 'insensitive' as const } }
    : {};

  // `status=ready` ("Review Payouts" deep link) filters on `readyForPayout > 0` — a derived
  // aggregate, not a Vendor column, so it can't be pushed into the `where` above. Every matching
  // vendor's aggregate is computed first, filtered, THEN paginated in memory.
  if (opts.status === 'ready') {
    const vendors = await prisma.member.findMany({ where, orderBy: { businessName: 'asc' }, select: VENDOR_SETTLEMENT_SELECT });
    const branchByVendor = await primaryBranchByVendorId(vendors.map((v) => v.id));
    const allItems = await Promise.all(vendors.map((v) => buildMemberSettlementRow(v, branchByVendor.get(v.id))));
    const filtered = allItems.filter((item) => item.readyForPayout.gt(0));
    const start = (opts.page - 1) * opts.pageSize;
    return { items: filtered.slice(start, start + opts.pageSize), total: filtered.length };
  }

  const [vendors, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: { businessName: 'asc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: VENDOR_SETTLEMENT_SELECT,
    }),
    prisma.member.count({ where }),
  ]);
  const branchByVendor = await primaryBranchByVendorId(vendors.map((v) => v.id));
  const items = await Promise.all(vendors.map((v) => buildMemberSettlementRow(v, branchByVendor.get(v.id))));

  return { items, total };
}

export async function getMemberSettlementDetail(vendorId: string) {
  const vendor = await prisma.member.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new ApiError('NOT_FOUND', 'Vendor not found');

  const [entitlements, payouts] = await Promise.all([
    prisma.purchaseEntitlement.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      include: { adjustments: true, orderItem: { select: { itemName: true, orderId: true } } },
    }),
    prisma.memberPayout.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, include: { items: true } }),
  ]);

  const payoutIds = payouts.map((p) => p.id);
  const auditTrail = payoutIds.length
    ? await prisma.auditLog.findMany({ where: { targetType: 'MEMBER_PAYOUT', targetId: { in: payoutIds } }, orderBy: { createdAt: 'desc' } })
    : [];

  const now = new Date();
  const eligibleItems = entitlements.filter((e) => e.settlementStatus === 'ON_HOLD' && e.holdUntil && e.holdUntil <= now);

  return {
    vendor: {
      id: vendor.id,
      businessName: vendor.businessName,
      bankAccountHolder: vendor.bankAccountHolder,
      bankName: vendor.bankName,
      bankAccountNumber: vendor.bankAccountNumber,
      bankIfsc: vendor.bankIfsc,
      upiId: vendor.upiId,
    },
    statement: entitlements,
    eligibleItems,
    payoutHistory: payouts,
    auditTrail,
  };
}

/**
 * Records a manual bank transfer that has ALREADY happened outside this system (no live
 * payout-API integration exists — no RazorpayX/similar credentials configured, see this file's
 * own module doc comment). Every selected entitlement must currently be "Ready for Payout"
 * (`settlementStatus === 'ON_HOLD' && holdUntil <= now`) — the derived state, never trusted from
 * the caller. `MemberPayoutItem.entitlementId`'s DB-level `@unique` is what actually prevents
 * double-allocation under concurrent requests; the `idempotencyKey` guards the "admin
 * double-clicks Record Payment" case on top of that.
 */
export async function recordMemberPayout(
  adminUserId: string,
  vendorId: string,
  input: { entitlementIds: string[]; reference?: string; transferDate?: string; proofStorageKey?: string; idempotencyKey?: string },
) {
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();

  const existingByKey = await prisma.memberPayout.findUnique({ where: { idempotencyKey }, include: { items: true } });
  if (existingByKey) return existingByKey; // true idempotent replay

  const vendor = await prisma.member.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new ApiError('NOT_FOUND', 'Vendor not found');
  if (!vendor.bankAccountNumber || !vendor.bankIfsc || !vendor.bankAccountHolder) {
    throw new ApiError('VALIDATION_ERROR', "This member's bank details are incomplete — add them before recording a payout.");
  }

  const now = new Date();
  const entitlements = await prisma.purchaseEntitlement.findMany({
    where: { id: { in: input.entitlementIds } },
    include: { adjustments: true },
  });
  if (entitlements.length !== input.entitlementIds.length) {
    throw new ApiError('NOT_FOUND', 'One or more entitlements were not found');
  }
  const notReady = entitlements.filter(
    (e) => e.vendorId !== vendorId || e.settlementStatus !== 'ON_HOLD' || !e.holdUntil || e.holdUntil > now,
  );
  if (notReady.length > 0) {
    throw new ApiError('CONFLICT', 'One or more selected items are not Ready for Payout', {
      entitlementIds: notReady.map((e) => e.id),
    });
  }

  const amount = entitlements.reduce(
    (sum, e) => sum.add(e.adjustments.reduce((s, a) => s.add(a.amount), new Prisma.Decimal(e.memberShareAmount))),
    new Prisma.Decimal(0),
  );

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.memberPayout.create({
      data: {
        vendorId,
        amount,
        status: 'PAID',
        bankAccountHolderSnapshot: vendor.bankAccountHolder!,
        bankNameSnapshot: vendor.bankName,
        bankAccountNumberSnapshot: vendor.bankAccountNumber!,
        bankIfscSnapshot: vendor.bankIfsc!,
        upiIdSnapshot: vendor.upiId,
        reference: input.reference,
        transferDate: input.transferDate ? new Date(input.transferDate) : now,
        proofStorageKey: input.proofStorageKey,
        idempotencyKey,
        recordedByUserId: adminUserId,
      },
    });

    for (const entitlement of entitlements) {
      const payable = entitlement.adjustments.reduce((s, a) => s.add(a.amount), new Prisma.Decimal(entitlement.memberShareAmount));
      const item = await tx.memberPayoutItem.create({ data: { payoutId: created.id, entitlementId: entitlement.id, amount: payable } });
      await tx.purchaseEntitlement.update({ where: { id: entitlement.id }, data: { settlementStatus: 'PAID', payoutItemId: item.id } });
    }

    await notifyVendorOwner(tx, vendorId, {
      type: 'PAYOUT_RECORDED',
      title: 'Payout Recorded',
      message: `A bank transfer of ₹${amount.toFixed(2)} has been recorded for your account.`,
      entityType: 'MEMBER_PAYOUT',
      entityId: created.id,
    });

    return tx.memberPayout.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } });
  });

  return payout;
}
