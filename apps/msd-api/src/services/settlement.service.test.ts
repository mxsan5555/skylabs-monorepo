import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/notification.service', () => ({
  notifyVendorOwner: vi.fn(),
  notifySuperAdmins: vi.fn(),
  notifyOrderConfirmed: vi.fn(),
  shortOrderNumber: (id: string) => `ORD-${id.slice(-8).toUpperCase()}`,
}));

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import {
  createEntitlementsForOrder,
  updateFinanceSettings,
  setVendorCommissionRate,
  recordMemberPayout,
  listMemberSettlements,
  getAccountsOverview,
} from './settlement.service';

const prismaMock = vi.mocked(prisma, true);

const ORDER_ID = 'a0000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = 'a0000000-0000-4000-8000-000000000002';
const VENDOR_ID = 'a0000000-0000-4000-8000-000000000003';
const ADMIN_ID = 'a0000000-0000-4000-8000-000000000004';
const ITEM_ID = 'a0000000-0000-4000-8000-000000000005';
const PRODUCT_ITEM_ID = 'a0000000-0000-4000-8000-000000000006';
const BRANCH_ID = 'a0000000-0000-4000-8000-000000000007';
const ENTITLEMENT_ID = 'a0000000-0000-4000-8000-000000000008';
const PAYOUT_ID = 'a0000000-0000-4000-8000-000000000009';

const financeSettingsFixture = {
  id: 'singleton',
  defaultCommissionRatePercent: new Prisma.Decimal('10'),
  serviceHoldHours: 24,
  productReturnHoldHours: 168,
  completionOtpExpiryMinutes: 10,
  completionOtpMaxAttempts: 5,
  completionOtpResendCooldownSeconds: 60,
  updatedByUserId: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Feature: Entitlement generation (the hook called from all 5 of payment.service.ts's
 * CONFIRMED-transition sites)
 * Scenario: idempotent no-op on replay; multi-quantity SERVICE items split evenly into N
 * independent entitlements whose grossAmounts sum EXACTLY to lineTotal (rounding remainder on
 * the last unit); a PRODUCT item always gets exactly one entitlement regardless of quantity;
 * commission is resolved once (vendor override wins over the global default) and snapshotted.
 *
 * Given: an order's items, a resolved vendor commission rate, and FinanceSettings
 * When: createEntitlementsForOrder(tx, orderId) runs
 * Then: idempotent-replay creates nothing; a qty-3 SERVICE line creates 3 entitlements whose
 *       gross amounts reconcile exactly to lineTotal; a PRODUCT line creates exactly 1
 *
 * Edge cases:
 * - an order with no items is a no-op
 * - a vendor with no commissionRatePercent override falls back to the global default
 */
describe('createEntitlementsForOrder', () => {
  it('is an idempotent no-op when an entitlement already exists for this order — never creates a second set of vouchers', async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: ITEM_ID, orderId: ORDER_ID, itemType: 'SERVICE', quantity: 3, lineTotal: new Prisma.Decimal('1000.00'), vendorId: VENDOR_ID, branchId: BRANCH_ID, dealId: 'deal-1', therapistId: null, productId: null } as never,
    ]);
    prismaMock.purchaseEntitlement.findFirst.mockResolvedValue({ id: ENTITLEMENT_ID } as never);

    await createEntitlementsForOrder(prismaMock as never, ORDER_ID);

    expect(prismaMock.purchaseEntitlement.create).not.toHaveBeenCalled();
    expect(prismaMock.order.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('is a no-op when the order has no items at all', async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    await createEntitlementsForOrder(prismaMock as never, ORDER_ID);
    expect(prismaMock.purchaseEntitlement.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.create).not.toHaveBeenCalled();
  });

  it('splits a qty-3 SERVICE line into 3 independent entitlements whose grossAmounts sum EXACTLY to lineTotal, remainder absorbed by the last unit', async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: ITEM_ID, orderId: ORDER_ID, itemType: 'SERVICE', quantity: 3, lineTotal: new Prisma.Decimal('1000.00'), vendorId: VENDOR_ID, branchId: BRANCH_ID, dealId: 'deal-1', therapistId: null, productId: null } as never,
    ]);
    prismaMock.purchaseEntitlement.findFirst.mockResolvedValue(null);
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({ customerId: CUSTOMER_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, commissionRatePercent: null }] as never);
    prismaMock.purchaseEntitlement.create.mockResolvedValue({} as never);

    await createEntitlementsForOrder(prismaMock as never, ORDER_ID);

    expect(prismaMock.purchaseEntitlement.create).toHaveBeenCalledTimes(3);
    const calls = prismaMock.purchaseEntitlement.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

    // Every unit is independently addressable (sequenceNo 1..3, same orderItemId) and carries its
    // own voucher code, deal-prefixed (MSD-DL-…).
    expect(calls.map((d) => d.sequenceNo)).toEqual([1, 2, 3]);
    expect(calls.every((d) => d.orderItemId === ITEM_ID)).toBe(true);
    expect(calls.every((d) => typeof d.voucherCode === 'string' && (d.voucherCode as string).startsWith('MSD-DL-'))).toBe(true);
    expect(calls.every((d) => d.fulfilmentKind === 'SERVICE_SESSION')).toBe(true);

    const gross = calls.map((d) => (d.grossAmount as Prisma.Decimal).toFixed(2));
    const commission = calls.map((d) => (d.commissionAmount as Prisma.Decimal).toFixed(2));
    const memberShare = calls.map((d) => (d.memberShareAmount as Prisma.Decimal).toFixed(2));

    expect(gross).toEqual(['333.33', '333.33', '333.34']);
    expect(commission).toEqual(['33.33', '33.33', '33.33']);
    expect(memberShare).toEqual(['300.00', '300.00', '300.01']);

    const sumGross = calls.reduce((s, d) => s.add(d.grossAmount as Prisma.Decimal), new Prisma.Decimal(0));
    expect(sumGross.toFixed(2)).toBe('1000.00'); // reconciles exactly to lineTotal, every time

    // Completing/disputing one unit must never reach the others — each create is its own row
    // with its own id, never a shared/batched record.
    expect(new Set(calls.map((d) => d.sequenceNo)).size).toBe(3);
  });

  it('creates exactly ONE entitlement for a PRODUCT line regardless of quantity', async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: PRODUCT_ITEM_ID, orderId: ORDER_ID, itemType: 'PRODUCT', quantity: 5, lineTotal: new Prisma.Decimal('250.00'), vendorId: VENDOR_ID, branchId: null, dealId: null, therapistId: null, productId: 'product-1' } as never,
    ]);
    prismaMock.purchaseEntitlement.findFirst.mockResolvedValue(null);
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({ customerId: CUSTOMER_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, commissionRatePercent: null }] as never);
    prismaMock.purchaseEntitlement.create.mockResolvedValue({} as never);

    await createEntitlementsForOrder(prismaMock as never, ORDER_ID);

    expect(prismaMock.purchaseEntitlement.create).toHaveBeenCalledTimes(1);
    const data = (prismaMock.purchaseEntitlement.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.sequenceNo).toBe(1);
    expect(data.fulfilmentKind).toBe('PRODUCT_PICKUP');
    expect((data.grossAmount as Prisma.Decimal).toFixed(2)).toBe('250.00');
    expect((data.voucherCode as string).startsWith('MSD-PR-')).toBe(true);
  });

  it("resolves the vendor's own commissionRatePercent override instead of the global default when one is set", async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: ITEM_ID, orderId: ORDER_ID, itemType: 'SERVICE', quantity: 1, lineTotal: new Prisma.Decimal('100.00'), vendorId: VENDOR_ID, branchId: BRANCH_ID, dealId: null, therapistId: 'therapist-1', productId: null } as never,
    ]);
    prismaMock.purchaseEntitlement.findFirst.mockResolvedValue(null);
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({ customerId: CUSTOMER_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never); // default 10%
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, commissionRatePercent: new Prisma.Decimal('25') }] as never);
    prismaMock.purchaseEntitlement.create.mockResolvedValue({} as never);

    await createEntitlementsForOrder(prismaMock as never, ORDER_ID);

    const data = (prismaMock.purchaseEntitlement.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect((data.commissionRatePercent as Prisma.Decimal).toString()).toBe('25');
    expect((data.commissionAmount as Prisma.Decimal).toFixed(2)).toBe('25.00'); // 25% of 100, not the 10% default
    expect((data.voucherCode as string).startsWith('MSD-TH-')).toBe(true);
  });
});

/**
 * Feature: Historical commission preservation
 * Scenario: changing FinanceSettings' global default or a vendor's own override must never touch
 * any already-created PurchaseEntitlement row — the snapshot taken at creation time is permanent.
 *
 * Given: entitlements already exist for a vendor
 * When: updateFinanceSettings or setVendorCommissionRate is called
 * Then: only FinanceSettings/Vendor is written — PurchaseEntitlement is never read or written
 */
describe('updateFinanceSettings / setVendorCommissionRate — never touch existing entitlements', () => {
  it('updateFinanceSettings only writes FinanceSettings, never PurchaseEntitlement', async () => {
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.financeSettings.update.mockResolvedValue({ ...financeSettingsFixture, defaultCommissionRatePercent: new Prisma.Decimal('50') } as never);

    await updateFinanceSettings(ADMIN_ID, { defaultCommissionRatePercent: 50 });

    expect(prismaMock.financeSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ defaultCommissionRatePercent: 50, updatedByUserId: ADMIN_ID }) }),
    );
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('setVendorCommissionRate only writes Vendor, never PurchaseEntitlement', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.member.update.mockResolvedValue({ id: VENDOR_ID, commissionRatePercent: new Prisma.Decimal('15') } as never);

    await setVendorCommissionRate(VENDOR_ID, 15);

    expect(prismaMock.member.update).toHaveBeenCalledWith({ where: { id: VENDOR_ID }, data: { commissionRatePercent: 15 } });
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('setVendorCommissionRate 404s for a vendor that does not exist', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    await expect(setVendorCommissionRate(VENDOR_ID, 15)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Member payout — double-allocation prevention
 * Scenario: recordMemberPayout's idempotencyKey short-circuits a true retry; a not-yet-eligible
 * entitlement is rejected outright; the real double-allocation guard is the DB-level
 * `MemberPayoutItem.entitlementId` unique constraint — simulated here as a thrown unique-
 * constraint error from `memberPayoutItem.create`, which must propagate (never be swallowed into
 * a false "success").
 */
describe('recordMemberPayout', () => {
  const vendorFixture = {
    id: VENDOR_ID,
    bankAccountHolder: 'ABC Spa',
    bankName: 'HDFC',
    bankAccountNumber: '1234567890',
    bankIfsc: 'HDFC0001',
    upiId: null,
  };
  const now = new Date('2026-06-01T00:00:00Z');
  const readyEntitlement = {
    id: ENTITLEMENT_ID,
    vendorId: VENDOR_ID,
    settlementStatus: 'ON_HOLD',
    holdUntil: new Date('2026-05-01T00:00:00Z'), // in the past relative to `now`
    memberShareAmount: new Prisma.Decimal('400.00'),
    adjustments: [],
  };

  it('replays an existing payout by idempotencyKey without re-reading the vendor or entitlements', async () => {
    prismaMock.memberPayout.findUnique.mockResolvedValue({ id: PAYOUT_ID, items: [] } as never);

    const result = await recordMemberPayout(ADMIN_ID, VENDOR_ID, { entitlementIds: [ENTITLEMENT_ID], idempotencyKey: 'key-1' });

    expect(result).toMatchObject({ id: PAYOUT_ID });
    expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.findMany).not.toHaveBeenCalled();
  });

  it('rejects when the vendor has incomplete bank details', async () => {
    prismaMock.memberPayout.findUnique.mockResolvedValue(null);
    prismaMock.member.findUnique.mockResolvedValue({ ...vendorFixture, bankAccountNumber: null } as never);

    await expect(recordMemberPayout(ADMIN_ID, VENDOR_ID, { entitlementIds: [ENTITLEMENT_ID] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects with CONFLICT (never silently proceeds) when a selected entitlement is not actually Ready for Payout', async () => {
    prismaMock.memberPayout.findUnique.mockResolvedValue(null);
    prismaMock.member.findUnique.mockResolvedValue(vendorFixture as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([
      { ...readyEntitlement, settlementStatus: 'PENDING_FULFILMENT' }, // not ON_HOLD yet
    ] as never);

    await expect(recordMemberPayout(ADMIN_ID, VENDOR_ID, { entitlementIds: [ENTITLEMENT_ID] })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.memberPayout.create).not.toHaveBeenCalled();
  });

  it('allocates a Ready-for-Payout entitlement, marks it PAID, and snapshots the vendor bank details', async () => {
    prismaMock.memberPayout.findUnique.mockResolvedValue(null);
    prismaMock.member.findUnique.mockResolvedValue(vendorFixture as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([readyEntitlement] as never);
    prismaMock.memberPayout.create.mockResolvedValue({ id: PAYOUT_ID } as never);
    prismaMock.memberPayoutItem.create.mockResolvedValue({ id: 'item-1' } as never);
    prismaMock.memberPayout.findUniqueOrThrow.mockResolvedValue({ id: PAYOUT_ID, items: [{ id: 'item-1' }] } as never);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await recordMemberPayout(ADMIN_ID, VENDOR_ID, { entitlementIds: [ENTITLEMENT_ID], idempotencyKey: 'key-2' });

    expect(prismaMock.memberPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: VENDOR_ID,
          bankAccountHolderSnapshot: 'ABC Spa',
          bankAccountNumberSnapshot: '1234567890',
          bankIfscSnapshot: 'HDFC0001',
        }),
      }),
    );
    expect(prismaMock.purchaseEntitlement.update).toHaveBeenCalledWith({
      where: { id: ENTITLEMENT_ID },
      data: { settlementStatus: 'PAID', payoutItemId: 'item-1' },
    });
    vi.useRealTimers();
  });

  it('propagates a DB unique-constraint violation on MemberPayoutItem.entitlementId instead of silently succeeding twice — THIS is what prevents double-allocation under concurrent requests', async () => {
    prismaMock.memberPayout.findUnique.mockResolvedValue(null);
    prismaMock.member.findUnique.mockResolvedValue(vendorFixture as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([readyEntitlement] as never);
    prismaMock.memberPayout.create.mockResolvedValue({ id: PAYOUT_ID } as never);
    const uniqueConstraintError = Object.assign(new Error('Unique constraint failed on the fields: (`entitlementId`)'), { code: 'P2002' });
    prismaMock.memberPayoutItem.create.mockRejectedValueOnce(uniqueConstraintError);

    await expect(
      recordMemberPayout(ADMIN_ID, VENDOR_ID, { entitlementIds: [ENTITLEMENT_ID], idempotencyKey: 'key-3' }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // The error propagated BEFORE the entitlement was ever flipped to PAID — never a partial,
    // silently-successful double-payout.
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Member Settlements — acceptance fixture (ABC Spa)
 * Scenario: a vendor with 3 independent entitlements — a pending massage (₹800 payable), an
 * on-hold therapist session (₹1,200 payable, hold not yet expired), and an already-eligible
 * product (₹400 payable, hold expired) — aggregates to exactly pendingFulfilment=800,
 * onHold=1200, readyForPayout=400 (derived purely from holdUntil vs. now, no stored field).
 */
describe('listMemberSettlements — ABC Spa acceptance fixture', () => {
  it('reproduces ₹3,000 gross / ₹600 commission / ₹2,400 member liability split as ₹800 pending / ₹1,200 on hold / ₹400 ready', async () => {
    const now = new Date('2026-06-15T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, businessName: 'ABC Spa', bankAccountNumber: '123', bankIfsc: 'IFSC0001' }] as never);
    prismaMock.member.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([
      { memberShareAmount: new Prisma.Decimal('800.00'), settlementStatus: 'PENDING_FULFILMENT', holdUntil: null, adjustments: [] }, // pending massage
      { memberShareAmount: new Prisma.Decimal('1200.00'), settlementStatus: 'ON_HOLD', holdUntil: new Date('2026-07-01T00:00:00Z'), adjustments: [] }, // on-hold therapist session (future hold)
      { memberShareAmount: new Prisma.Decimal('400.00'), settlementStatus: 'ON_HOLD', holdUntil: new Date('2026-06-01T00:00:00Z'), adjustments: [] }, // eligible product (hold already expired)
    ] as never);

    const { items } = await listMemberSettlements({ page: 1, pageSize: 20 });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ vendorId: VENDOR_ID, businessName: 'ABC Spa' });
    expect(items[0].pendingFulfilment.toFixed(2)).toBe('800.00');
    expect(items[0].onHold.toFixed(2)).toBe('1200.00');
    expect(items[0].readyForPayout.toFixed(2)).toBe('400.00');
    expect(items[0].paid.toFixed(2)).toBe('0.00');

    vi.useRealTimers();
  });
});

/**
 * Feature: Member Settlements list — masked bank reference + primary branch + `status=ready`
 * Scenario: the list response never carries the full bank account number (detail page only,
 * untouched); it carries the vendor's oldest branch's name/city when one exists; and an optional
 * `status=ready` filters the vendor set down to only those with `readyForPayout > 0`, still
 * paginating the FILTERED set (never the unfiltered one).
 */
describe('listMemberSettlements — masked bank reference, primary branch, status=ready filter', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("masks the vendor's bank account number to the last 4 digits, never the full number", async () => {
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, businessName: 'ABC Spa', bankAccountNumber: '1234567890', bankIfsc: 'IFSC0001' }] as never);
    prismaMock.member.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    const { items } = await listMemberSettlements({ page: 1, pageSize: 20 });

    expect(items[0].bankReferenceMasked).toBe('••••7890');
    expect(JSON.stringify(items[0])).not.toContain('1234567890');
  });

  it('returns null bankReferenceMasked when no bank account is on file', async () => {
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, businessName: 'ABC Spa', bankAccountNumber: null, bankIfsc: null }] as never);
    prismaMock.member.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    const { items } = await listMemberSettlements({ page: 1, pageSize: 20 });

    expect(items[0].bankReferenceMasked).toBeNull();
  });

  it("includes the vendor's oldest branch's name/city as primaryBranchName/primaryBranchCity", async () => {
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, businessName: 'ABC Spa', bankAccountNumber: null, bankIfsc: null }] as never);
    prismaMock.member.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([{ vendorId: VENDOR_ID, name: 'Gorakhpur Branch', city: 'Gorakhpur' }] as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    const { items } = await listMemberSettlements({ page: 1, pageSize: 20 });

    expect(items[0].primaryBranchName).toBe('Gorakhpur Branch');
    expect(items[0].primaryBranchCity).toBe('Gorakhpur');
  });

  it('returns null primaryBranchName/City when the vendor has no branch at all', async () => {
    prismaMock.member.findMany.mockResolvedValue([{ id: VENDOR_ID, businessName: 'ABC Spa', bankAccountNumber: null, bankIfsc: null }] as never);
    prismaMock.member.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    const { items } = await listMemberSettlements({ page: 1, pageSize: 20 });

    expect(items[0].primaryBranchName).toBeNull();
    expect(items[0].primaryBranchCity).toBeNull();
  });

  it('status=ready filters out a vendor with zero readyForPayout, never touching vendor.count/skip/take for pagination', async () => {
    const VENDOR_B_ID = 'a0000000-0000-4000-8000-00000000000a';
    prismaMock.member.findMany.mockResolvedValue([
      { id: VENDOR_ID, businessName: 'ABC Spa', bankAccountNumber: null, bankIfsc: null },
      { id: VENDOR_B_ID, businessName: 'XYZ Salon', bankAccountNumber: null, bankIfsc: null },
    ] as never);
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.purchaseEntitlement.findMany.mockImplementation((args: unknown) => {
      const vendorId = (args as { where: { vendorId: string } }).where.vendorId;
      if (vendorId === VENDOR_ID) {
        return Promise.resolve([
          { memberShareAmount: new Prisma.Decimal('400.00'), settlementStatus: 'ON_HOLD', holdUntil: new Date('2026-06-01T00:00:00Z'), adjustments: [] },
        ] as never);
      }
      return Promise.resolve([]); // VENDOR_B has nothing ready
    });

    const { items, total } = await listMemberSettlements({ page: 1, pageSize: 20, status: 'ready' });

    expect(items).toHaveLength(1);
    expect(items[0].vendorId).toBe(VENDOR_ID);
    expect(total).toBe(1);
    // status=ready computes aggregates for every matching vendor up front rather than paginating
    // the vendor table first — vendor.count is never called on this path.
    expect(prismaMock.member.count).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Accounts Overview — eligible-member-count alongside readyForPayout's amount
 * Scenario: the SAME "ON_HOLD + holdUntil passed" predicate `readyForPayout` already sums, now
 * also counted by DISTINCT vendorId — all 7 pre-existing fields stay unchanged.
 */
describe('getAccountsOverview — readyForPayoutMemberCount', () => {
  it('counts DISTINCT vendors eligible for payout, additive to the existing 7 fields', async () => {
    prismaMock.purchaseEntitlement.findMany.mockImplementation((args: unknown) => {
      const a = args as { distinct?: string[] };
      if (a?.distinct) {
        // Two eligible entitlements for the SAME vendor -> exactly 1 distinct vendor.
        return Promise.resolve([{ vendorId: VENDOR_ID }] as never);
      }
      return Promise.resolve([] as never); // the main `all` aggregation read
    });
    prismaMock.purchaseEntitlement.aggregate.mockResolvedValue({ _sum: { memberShareAmount: new Prisma.Decimal('800.00') } } as never);

    const overview = await getAccountsOverview();

    expect(overview.readyForPayoutMemberCount).toBe(1);
    expect(overview.readyForPayout.toFixed(2)).toBe('800.00');
    expect(overview).toHaveProperty('collections');
    expect(overview).toHaveProperty('commission');
    expect(overview).toHaveProperty('memberLiability');
    expect(overview).toHaveProperty('pendingFulfilment');
    expect(overview).toHaveProperty('onHold');
    expect(overview).toHaveProperty('paid');
  });

  it('is 0 when no vendor currently has an eligible entitlement', async () => {
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([] as never);
    prismaMock.purchaseEntitlement.aggregate.mockResolvedValue({ _sum: { memberShareAmount: null } } as never);

    const overview = await getAccountsOverview();

    expect(overview.readyForPayoutMemberCount).toBe(0);
  });
});
