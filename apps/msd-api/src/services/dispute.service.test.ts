import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { raiseDispute, resolveDispute, getDisputeOrThrow, getDisputeAttentionSummary } from './dispute.service';

const prismaMock = vi.mocked(prisma, true);

const CUSTOMER_ID = 'c0000000-0000-4000-8000-000000000001';
const OTHER_CUSTOMER_ID = 'c0000000-0000-4000-8000-000000000002';
const VENDOR_ID = 'c0000000-0000-4000-8000-000000000003';
const ADMIN_ID = 'c0000000-0000-4000-8000-000000000004';
const MASSAGE_ENTITLEMENT_ID = 'c0000000-0000-4000-8000-000000000005';
const PRODUCT_ENTITLEMENT_ID = 'c0000000-0000-4000-8000-000000000006';
const THERAPIST_ENTITLEMENT_ID = 'c0000000-0000-4000-8000-000000000007';
const DISPUTE_ID = 'c0000000-0000-4000-8000-000000000008';

beforeEach(() => {
  vi.clearAllMocks();
  // notifyVendorOwner/notifySuperAdmins run for real (not mocked) inside raiseDispute's own
  // transaction — arm their own Prisma reads to safe no-ops so they never crash the test.
  prismaMock.vendor.findUnique.mockResolvedValue(null); // notifyVendorOwner: no owner on file -> no-op
  prismaMock.user.findMany.mockResolvedValue([]); // notifySuperAdmins: nobody to notify -> no-op
});

function massageEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    id: MASSAGE_ENTITLEMENT_ID,
    orderItemId: 'order-item-massage',
    customerId: CUSTOMER_ID,
    vendorId: VENDOR_ID,
    voucherCode: 'MSD-DL-M1',
    settlementStatus: 'ON_HOLD',
    ...overrides,
  };
}

/**
 * Feature: Raising a dispute — ownership + single-entitlement scoping
 * Scenario: ownership of the targeted entitlement is checked server-side (404, never 403, on a
 * mismatch); opening a dispute blocks ONLY that one entitlement — never any sibling on the same
 * order/vendor — by construction (the update's `where` always targets exactly one `id`).
 *
 * Given: a customer's own completed massage entitlement (ON_HOLD), with sibling entitlements on
 * the SAME order/vendor (an eligible product, an on-hold therapist session)
 * When: the customer raises a dispute against the massage entitlement only
 * Then: only the massage entitlement's settlementStatus moves to DISPUTED_BLOCKED (with
 *       preDisputeStatus snapshotted as ON_HOLD); the sibling entitlements are never read or
 *       written by this call
 *
 * Edge cases:
 * - a dispute against someone else's entitlement 404s, never 403
 * - a second dispute against an already-DISPUTED_BLOCKED entitlement conflicts
 */
describe('raiseDispute', () => {
  it("404s (never 403) when the targeted entitlement does not belong to this customer", async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(massageEntitlement({ customerId: OTHER_CUSTOMER_ID }) as never);

    await expect(
      raiseDispute(CUSTOMER_ID, { entitlementId: MASSAGE_ENTITLEMENT_ID, reason: 'Not as described' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.purchaseDispute.create).not.toHaveBeenCalled();
  });

  it('404s when the entitlement id does not exist at all', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(null);
    await expect(
      raiseDispute(CUSTOMER_ID, { entitlementId: MASSAGE_ENTITLEMENT_ID, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects with CONFLICT when a dispute is already open for this entitlement', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(massageEntitlement({ settlementStatus: 'DISPUTED_BLOCKED' }) as never);
    await expect(
      raiseDispute(CUSTOMER_ID, { entitlementId: MASSAGE_ENTITLEMENT_ID, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.purchaseDispute.create).not.toHaveBeenCalled();
  });

  it("blocks ONLY the targeted entitlement — the update's where clause never widens to the order or vendor", async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(massageEntitlement() as never); // ON_HOLD
    prismaMock.purchaseDispute.create.mockResolvedValue({ id: DISPUTE_ID, orderItemId: 'order-item-massage' } as never);
    prismaMock.purchaseEntitlement.update.mockResolvedValue({} as never);

    await raiseDispute(CUSTOMER_ID, { entitlementId: MASSAGE_ENTITLEMENT_ID, reason: 'Service was cut short' });

    expect(prismaMock.purchaseEntitlement.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.purchaseEntitlement.update).toHaveBeenCalledWith({
      where: { id: MASSAGE_ENTITLEMENT_ID },
      data: { preDisputeStatus: 'ON_HOLD', settlementStatus: 'DISPUTED_BLOCKED' },
    });
    // Sibling entitlements (product/therapist, same order/vendor) are never touched by this call.
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PRODUCT_ENTITLEMENT_ID } }),
    );
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: THERAPIST_ENTITLEMENT_ID } }),
    );
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('creates the dispute scoped to the entitlement\'s own orderItemId and vendorId notification target', async () => {
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(massageEntitlement() as never);
    prismaMock.purchaseDispute.create.mockResolvedValue({ id: DISPUTE_ID } as never);
    prismaMock.purchaseEntitlement.update.mockResolvedValue({} as never);

    await raiseDispute(CUSTOMER_ID, { entitlementId: MASSAGE_ENTITLEMENT_ID, reason: 'x', description: 'details' });

    expect(prismaMock.purchaseDispute.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderItemId: 'order-item-massage',
        entitlementId: MASSAGE_ENTITLEMENT_ID,
        customerId: CUSTOMER_ID,
        reason: 'x',
        description: 'details',
      }),
    });
  });
});

describe('getDisputeOrThrow', () => {
  it('404s for an unknown dispute id', async () => {
    prismaMock.purchaseDispute.findUnique.mockResolvedValue(null);
    await expect(getDisputeOrThrow(DISPUTE_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/**
 * Feature: Dispute resolution — REFUNDED leaves the entitlement to refund.service.ts;
 * NO_ACTION/OTHER restores the pre-dispute settlementStatus
 */
describe('resolveDispute', () => {
  function disputeFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: DISPUTE_ID,
      status: 'OPEN',
      entitlementId: MASSAGE_ENTITLEMENT_ID,
      entitlement: { preDisputeStatus: 'ON_HOLD' },
      ...overrides,
    };
  }

  it('rejects CONFLICT when the dispute is already RESOLVED', async () => {
    prismaMock.purchaseDispute.findUnique.mockResolvedValue(disputeFixture({ status: 'RESOLVED' }) as never);
    await expect(resolveDispute(ADMIN_ID, DISPUTE_ID, { resolutionType: 'NO_ACTION' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('NO_ACTION restores the entitlement\'s settlementStatus from its preDisputeStatus snapshot', async () => {
    prismaMock.purchaseDispute.findUnique.mockResolvedValue(disputeFixture() as never);
    prismaMock.purchaseDispute.update.mockResolvedValue({ id: DISPUTE_ID, status: 'RESOLVED' } as never);
    prismaMock.purchaseEntitlement.update.mockResolvedValue({} as never);

    await resolveDispute(ADMIN_ID, DISPUTE_ID, { resolutionType: 'NO_ACTION', resolutionNotes: 'Investigated, found nothing wrong' });

    expect(prismaMock.purchaseEntitlement.update).toHaveBeenCalledWith({
      where: { id: MASSAGE_ENTITLEMENT_ID },
      data: { settlementStatus: 'ON_HOLD', preDisputeStatus: null },
    });
  });

  it('REFUNDED does NOT touch the entitlement at all — the money movement is a separate POST /refunds call', async () => {
    prismaMock.purchaseDispute.findUnique.mockResolvedValue(disputeFixture() as never);
    prismaMock.purchaseDispute.update.mockResolvedValue({ id: DISPUTE_ID, status: 'RESOLVED' } as never);

    await resolveDispute(ADMIN_ID, DISPUTE_ID, { resolutionType: 'REFUNDED' });

    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Accounts Overview's "Refunds & disputes attention" tile
 * Scenario: open-dispute count is a plain `purchaseDispute.count({status:'OPEN'})`; the blocked
 * amount sums `memberShareAmount` + any adjustments across DISPUTED_BLOCKED entitlements — the
 * SAME "payable" definition getAccountsOverview's `onHold` already uses, never a second one.
 */
describe('getDisputeAttentionSummary', () => {
  it('counts OPEN disputes and sums the adjusted memberShareAmount across DISPUTED_BLOCKED entitlements', async () => {
    prismaMock.purchaseDispute.count.mockResolvedValue(3);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([
      { memberShareAmount: new Prisma.Decimal('300.00'), adjustments: [] },
      { memberShareAmount: new Prisma.Decimal('150.00'), adjustments: [{ amount: new Prisma.Decimal('-50.00') }] },
    ] as never);

    const result = await getDisputeAttentionSummary();

    expect(prismaMock.purchaseDispute.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } });
    expect(prismaMock.purchaseEntitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { settlementStatus: 'DISPUTED_BLOCKED' } }),
    );
    expect(result.openCount).toBe(3);
    expect(result.blockedAmount.toFixed(2)).toBe('400.00'); // 300 + (150 - 50)
  });

  it('is {openCount: 0, blockedAmount: 0} when nothing is open/blocked', async () => {
    prismaMock.purchaseDispute.count.mockResolvedValue(0);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([] as never);

    const result = await getDisputeAttentionSummary();

    expect(result.openCount).toBe(0);
    expect(result.blockedAmount.toFixed(2)).toBe('0.00');
  });
});
