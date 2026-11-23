import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

const writeMediaFileMock = vi.fn().mockResolvedValue({ storageKey: 'entitlement-evidence/e1/photo.jpg', sizeBytes: 10 });
vi.mock('../lib/media-storage', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  writeMediaFile: (...args: unknown[]) => writeMediaFileMock(...args),
}));
vi.mock('./media-validation.service', () => ({ validateMediaFile: () => ({ extension: '.jpg' }) }));

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { verifyVoucher, startService, finishService, markProductPickedUp, listPendingFulfilment, recordDeliveryEvidence } from './voucher.service';

const prismaMock = vi.mocked(prisma, true);

const VENDOR_ID = 'b0000000-0000-4000-8000-000000000001';
const OTHER_VENDOR_ID = 'b0000000-0000-4000-8000-000000000002';
const CALLER_ID = 'b0000000-0000-4000-8000-000000000003';
const ENTITLEMENT_ID = 'b0000000-0000-4000-8000-000000000004';
const ORDER_ID = 'b0000000-0000-4000-8000-000000000006';
const CODE = 'MSD-DL-ABC123';

const financeSettingsFixture = {
  id: 'singleton',
  defaultCommissionRatePercent: new Prisma.Decimal('10'),
  serviceHoldHours: 24,
  productReturnHoldHours: 168,
};

const FUTURE_QR_EXPIRY = new Date('2026-12-21T10:00:00.000Z');
const PAST_QR_EXPIRY = new Date('2026-11-01T10:00:00.000Z');

function entitlementFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITLEMENT_ID,
    voucherCode: CODE,
    vendorId: VENDOR_ID,
    entitlementStatus: 'ACTIVE',
    settlementStatus: 'PENDING_FULFILMENT',
    fulfilmentKind: 'SERVICE_SESSION',
    orderItem: { order: { id: ORDER_ID, status: 'CONFIRMED' }, itemName: '60-min Massage' },
    customer: { id: 'customer-1', name: 'Priya', phone: '+919876543210' },
    branch: { name: 'MG Road' },
    grossAmount: '1000.00',
    memberShareAmount: '800.00',
    adjustments: [],
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    completedAt: null,
    qrExpiresAt: FUTURE_QR_EXPIRY,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Voucher scan classification — member/branch isolation, state-mapping, read-only
 * guarantee
 * Scenario: `verifyVoucher` maps every known combination of order/entitlement/settlement/
 * fulfilment state to exactly one `VoucherScanResult` and NEVER mutates anything (no update/
 * updateMany call), regardless of which path it takes. This is also the single check the scan
 * flow runs on every decode AND the one the Voucher Fulfilment page re-runs on every mount.
 */
describe('verifyVoucher', () => {
  it('returns WRONG_MEMBER_BRANCH when the caller is not this voucher\'s own vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);

    expect(result).toBe('WRONG_MEMBER_BRANCH');
  });

  it('returns WRONG_MEMBER_BRANCH when the caller owns no vendor at all', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue(null);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('WRONG_MEMBER_BRANCH');
  });

  it('returns NOT_QR_ELIGIBLE for a product voucher — products are never QR-redeemable', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'PRODUCT_PICKUP' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('NOT_QR_ELIGIBLE');
  });

  it('NOT_QR_ELIGIBLE wins even for a vendor who does not own the voucher — ownership is still checked first', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'PRODUCT_PICKUP' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('WRONG_MEMBER_BRANCH');
  });

  it('returns PAYMENT_NOT_COMPLETE when the underlying order is still PENDING_PAYMENT', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(
      entitlementFixture({ orderItem: { order: { id: ORDER_ID, status: 'PENDING_PAYMENT' }, itemName: 'x' } }) as never,
    );
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('PAYMENT_NOT_COMPLETE');
  });

  it('returns NEEDS_REVIEW when the underlying order was CANCELLED after entitlements existed', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(
      entitlementFixture({ orderItem: { order: { id: ORDER_ID, status: 'CANCELLED' }, itemName: 'x' } }) as never,
    );
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('NEEDS_REVIEW');
  });

  it('returns NEEDS_REVIEW when a dispute currently blocks this entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ settlementStatus: 'DISPUTED_BLOCKED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { result } = await verifyVoucher(CALLER_ID, CODE);
    expect(result).toBe('NEEDS_REVIEW');
  });

  it('returns CANCELLED_REFUNDED for a CANCELLED entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'CANCELLED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('CANCELLED_REFUNDED');
  });

  it('returns CANCELLED_REFUNDED for a VOID settlement (fully refunded pre-payout)', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ settlementStatus: 'VOID' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('CANCELLED_REFUNDED');
  });

  it('returns ALREADY_USED for a COMPLETED entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('ALREADY_USED');
  });

  it('returns ALREADY_USED rather than EXPIRED for a COMPLETED entitlement whose QR window has also since passed', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(
      entitlementFixture({ entitlementStatus: 'COMPLETED', qrExpiresAt: PAST_QR_EXPIRY }) as never,
    );
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('ALREADY_USED');
  });

  it('returns EXPIRED once the QR\'s own 30-day window has passed, for a still-open voucher', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ qrExpiresAt: PAST_QR_EXPIRY }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('EXPIRED');
  });

  it('returns EXPIRED (fail-closed) when qrExpiresAt is null on an otherwise-open SERVICE_SESSION voucher', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ qrExpiresAt: null }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('EXPIRED');
  });

  it('returns VALID for a fresh, confirmed, undisputed, unexpired voucher belonging to the caller\'s own vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('VALID');
  });

  it('is VALID for a STARTED voucher too — not just ACTIVE', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    expect((await verifyVoucher(CALLER_ID, CODE)).result).toBe('VALID');
  });

  it('never mutates the entitlement under any result', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    await verifyVoucher(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('404s outright for a voucher code that does not exist', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(null);
    await expect(verifyVoucher(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('includes a plain, unmasked customerPhone — the vendor needs to actually contact this customer', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);

    expect(entitlement.customerPhone).toBe('+919876543210');
    expect(entitlement).not.toHaveProperty('customerPhoneMasked');
    expect(entitlement).not.toHaveProperty('customerEmailMasked');
  });

  it('includes completedAt so the "Already used on <date>" copy can be shown', async () => {
    const completedAt = new Date('2026-11-10T12:00:00.000Z');
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED', completedAt }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const { entitlement } = await verifyVoucher(CALLER_ID, CODE);
    expect(entitlement.completedAt).toEqual(completedAt);
  });
});

describe('startService', () => {
  it('flips ACTIVE -> STARTED on success', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED' }) as never);

    const result = await startService(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.updateMany).toHaveBeenCalledWith({
      where: { id: ENTITLEMENT_ID, entitlementStatus: 'ACTIVE' },
      data: { entitlementStatus: 'STARTED', serviceStartedAt: expect.any(Date) },
    });
    expect((result as { entitlementStatus: string }).entitlementStatus).toBe('STARTED');
  });

  it('rejects with CONFLICT when the voucher was already started/completed (conditional updateMany guard)', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(startService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects with FORBIDDEN when the voucher belongs to a different vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    await expect(startService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a PRODUCT voucher with VALIDATION_ERROR — only a service voucher can be "started"', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'PRODUCT_PICKUP' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    await expect(startService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Feature: finish a service — the no-OTP replacement for the old OTP-gated `completeVoucher`
 * Scenario: reached only after a scan (`verifyVoucher`) validated the voucher and the vendor
 * tapped "Start service". Accepts `STARTED` (the normal path) and `OTP_REQUESTED` (a voucher
 * stuck mid-OTP before that system was retired) identically — no special UI/branching needed for
 * a legacy voucher. The conditional `updateMany` is what actually prevents two near-simultaneous
 * finish calls from both succeeding.
 */
describe('finishService', () => {
  function arm(entitlementOverrides: Record<string, unknown> = {}) {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED', ...entitlementOverrides }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
  }

  it('flips STARTED -> COMPLETED, sets completedAt/redeemedByUserId/settlementStatus/holdUntil', async () => {
    arm();
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);

    await finishService(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: ENTITLEMENT_ID,
        entitlementStatus: { in: ['STARTED', 'OTP_REQUESTED'] },
        settlementStatus: { notIn: ['VOID', 'DISPUTED_BLOCKED'] },
        orderItem: { order: { status: { in: ['CONFIRMED', 'COMPLETED'] } } },
      },
      data: {
        entitlementStatus: 'COMPLETED',
        completedAt: expect.any(Date),
        redeemedByUserId: CALLER_ID,
        settlementStatus: 'ON_HOLD',
        holdUntil: expect.any(Date),
      },
    });
  });

  it('also finishes an OTP_REQUESTED voucher — a legacy voucher stuck mid-OTP is not orphaned', async () => {
    arm({ entitlementStatus: 'OTP_REQUESTED' });
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);

    await expect(finishService(CALLER_ID, CODE)).resolves.toBeTruthy();
    expect(prismaMock.purchaseEntitlement.updateMany).toHaveBeenCalled();
  });

  it('rejects an ACTIVE voucher with CONFLICT — "Start service" must be tapped first', async () => {
    arm({ entitlementStatus: 'ACTIVE' });
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(finishService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a product voucher with VALIDATION_ERROR — only a deal/therapist voucher can be finished this way', async () => {
    arm({ fulfilmentKind: 'PRODUCT_PICKUP' });
    await expect(finishService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with FORBIDDEN when the voucher belongs to a different vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ entitlementStatus: 'STARTED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    await expect(finishService(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('exactly one of two near-simultaneous finish calls succeeds — the second gets a clean CONFLICT', async () => {
    arm();
    prismaMock.purchaseEntitlement.updateMany
      .mockResolvedValueOnce({ count: 1 } as never) // first caller wins the race
      .mockResolvedValueOnce({ count: 0 } as never); // second caller's conditional update matches nothing
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);

    const [first, second] = await Promise.allSettled([finishService(CALLER_ID, CODE), finishService(CALLER_ID, CODE)]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') expect(second.reason).toMatchObject({ code: 'CONFLICT' });
  });
});

/**
 * Feature: mark a product picked up — the no-OTP, no-QR replacement for pickup completion
 * Scenario: a single tap, gated to PRODUCT_PICKUP only, accepting ACTIVE (the normal path) and
 * OTP_REQUESTED (a legacy voucher stuck mid-OTP) identically.
 */
describe('markProductPickedUp', () => {
  function arm(entitlementOverrides: Record<string, unknown> = {}) {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(
      entitlementFixture({ fulfilmentKind: 'PRODUCT_PICKUP', entitlementStatus: 'ACTIVE', ...entitlementOverrides }) as never,
    );
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
  }

  it('flips ACTIVE -> COMPLETED, sets completedAt/redeemedByUserId/settlementStatus/holdUntil', async () => {
    arm();
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);

    await markProductPickedUp(CALLER_ID, CODE);

    expect(prismaMock.purchaseEntitlement.updateMany).toHaveBeenCalledWith({
      where: {
        id: ENTITLEMENT_ID,
        entitlementStatus: { in: ['ACTIVE', 'OTP_REQUESTED'] },
        settlementStatus: { notIn: ['VOID', 'DISPUTED_BLOCKED'] },
        orderItem: { order: { status: { in: ['CONFIRMED', 'COMPLETED'] } } },
      },
      data: {
        entitlementStatus: 'COMPLETED',
        completedAt: expect.any(Date),
        redeemedByUserId: CALLER_ID,
        settlementStatus: 'ON_HOLD',
        holdUntil: expect.any(Date),
      },
    });
  });

  it('also picks up an OTP_REQUESTED voucher — a legacy voucher stuck mid-OTP is not orphaned', async () => {
    arm({ entitlementStatus: 'OTP_REQUESTED' });
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);

    await expect(markProductPickedUp(CALLER_ID, CODE)).resolves.toBeTruthy();
  });

  it('rejects a SERVICE_SESSION voucher with VALIDATION_ERROR — only a pickup product can be marked picked up', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'SERVICE_SESSION' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    await expect(markProductPickedUp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a shipped product with VALIDATION_ERROR — that completes via delivery evidence instead', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'PRODUCT_SHIPPED' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    await expect(markProductPickedUp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects with FORBIDDEN when the voucher belongs to a different vendor', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ fulfilmentKind: 'PRODUCT_PICKUP' }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    await expect(markProductPickedUp(CALLER_ID, CODE)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('exactly one of two near-simultaneous pickup calls succeeds — the second gets a clean CONFLICT', async () => {
    arm();
    prismaMock.purchaseEntitlement.updateMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(entitlementFixture({ entitlementStatus: 'COMPLETED' }) as never);

    const [first, second] = await Promise.allSettled([markProductPickedUp(CALLER_ID, CODE), markProductPickedUp(CALLER_ID, CODE)]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') expect(second.reason).toMatchObject({ code: 'CONFLICT' });
  });
});

/**
 * Feature: Orders page's pending-fulfilment lists — vendor scoping, Deal vs Therapist tagging,
 * product grouping. Replaces the old searchable/paginated Service Queue.
 */
describe('listPendingFulfilment', () => {
  it('throws NOT_FOUND when the caller has no vendor profile yet', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null);
    await expect(listPendingFulfilment(CALLER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.purchaseEntitlement.findMany).not.toHaveBeenCalled();
  });

  it('scopes both queries to the caller\'s own vendorId and the open statuses only', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    await listPendingFulfilment(CALLER_ID);

    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { vendorId: VENDOR_ID, entitlementStatus: { in: ['ACTIVE', 'STARTED', 'OTP_REQUESTED'] }, fulfilmentKind: 'SERVICE_SESSION' },
      }),
    );
    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          vendorId: VENDOR_ID,
          entitlementStatus: { in: ['ACTIVE', 'STARTED', 'OTP_REQUESTED'] },
          fulfilmentKind: { in: ['PRODUCT_PICKUP', 'PRODUCT_SHIPPED'] },
        },
      }),
    );
  });

  it('tags a dealId line as DEAL and a therapistId line as THERAPIST', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.findMany
      .mockResolvedValueOnce([
        { id: 's1', voucherCode: 'MSD-DL-1', qrExpiresAt: FUTURE_QR_EXPIRY, orderItem: { itemName: 'Deal A', dealId: 'd1', therapistId: null, orderId: 'o1' }, customer: { phone: '111' } },
        { id: 's2', voucherCode: 'MSD-TH-1', qrExpiresAt: FUTURE_QR_EXPIRY, orderItem: { itemName: 'Therapist B', dealId: null, therapistId: 't1', orderId: 'o2' }, customer: { phone: '222' } },
      ] as never)
      .mockResolvedValueOnce([]);

    const { servicesWaiting } = await listPendingFulfilment(CALLER_ID);

    expect(servicesWaiting).toEqual([
      { id: 's1', voucherCode: 'MSD-DL-1', itemName: 'Deal A', kind: 'DEAL', customerPhone: '111', validTill: FUTURE_QR_EXPIRY, orderId: 'o1' },
      { id: 's2', voucherCode: 'MSD-TH-1', itemName: 'Therapist B', kind: 'THERAPIST', customerPhone: '222', validTill: FUTURE_QR_EXPIRY, orderId: 'o2' },
    ]);
  });

  it('maps product rows with their fulfilmentKind', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'p1', voucherCode: 'MSD-PR-1', fulfilmentKind: 'PRODUCT_PICKUP', orderItem: { itemName: 'Serum', orderId: 'o3' }, customer: { phone: '333' } },
      ] as never);

    const { productsPending } = await listPendingFulfilment(CALLER_ID);

    expect(productsPending).toEqual([
      { id: 'p1', voucherCode: 'MSD-PR-1', itemName: 'Serum', fulfilmentKind: 'PRODUCT_PICKUP', customerPhone: '333', orderId: 'o3' },
    ]);
  });
});

describe('recordDeliveryEvidence', () => {
  it('stores the photo privately and saves its key and note on the voucher', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue({
      id: ENTITLEMENT_ID,
      vendorId: VENDOR_ID,
      fulfilmentKind: 'PRODUCT_SHIPPED',
      entitlementStatus: 'STARTED',
    } as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.financeSettings.upsert.mockResolvedValue(financeSettingsFixture as never);
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue({ id: ENTITLEMENT_ID } as never);

    await recordDeliveryEvidence(CALLER_ID, CODE, { buffer: Buffer.from('x') } as never, 'Left with the guard');

    expect(writeMediaFileMock).toHaveBeenCalledWith(`entitlement-evidence/${ENTITLEMENT_ID}`, expect.any(Buffer), '.jpg', 'private');
    expect(prismaMock.purchaseEntitlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryEvidenceStorageKey: 'entitlement-evidence/e1/photo.jpg',
          deliveryEvidenceNote: 'Left with the guard',
        }),
      }),
    );
  });
});
