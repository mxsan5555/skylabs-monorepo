import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

const createRazorpayRefundMock = vi.fn();
vi.mock('./payment.service', () => ({ createRazorpayRefund: (...args: unknown[]) => createRazorpayRefundMock(...args) }));

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { createRefund } from './refund.service';

const prismaMock = vi.mocked(prisma, true);

const ADMIN_ID = 'd0000000-0000-4000-8000-000000000001';
const ORDER_ITEM_ID = 'd0000000-0000-4000-8000-000000000002';
const PAYMENT_ID = 'd0000000-0000-4000-8000-000000000003';
const ENTITLEMENT_ID = 'd0000000-0000-4000-8000-000000000004';
const ENTITLEMENT_2_ID = 'd0000000-0000-4000-8000-000000000005';
const DISPUTE_ID = 'd0000000-0000-4000-8000-000000000006';

beforeEach(() => {
  vi.clearAllMocks();
});

function orderItemFixture() {
  return { id: ORDER_ITEM_ID, orderId: 'order-1' };
}

function razorpayPaymentFixture() {
  return { id: PAYMENT_ID, orderId: 'order-1', status: 'PAID', provider: 'RAZORPAY', providerPaymentId: 'pay_123' };
}

function codPaymentFixture() {
  return { id: PAYMENT_ID, orderId: 'order-1', status: 'PAID', provider: 'COD', providerPaymentId: null };
}

function entitlementFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITLEMENT_ID,
    orderItemId: ORDER_ITEM_ID,
    grossAmount: new Prisma.Decimal('1000.00'),
    memberShareAmount: new Prisma.Decimal('800.00'), // 20% commission
    payoutItemId: null,
    preDisputeStatus: null,
    adjustments: [],
    ...overrides,
  };
}

describe('createRefund — guards', () => {
  it('404s when the order item does not exist', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(null);
    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 100, type: 'PARTIAL' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects with CONFLICT when there is no successful payment to refund against', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 100, type: 'PARTIAL' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires entitlementId when the order item has more than one voucher (multi-quantity SERVICE line)', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(razorpayPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture(), entitlementFixture({ id: ENTITLEMENT_2_ID })] as never);

    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 100, type: 'PARTIAL' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('404s when the specified entitlementId does not belong to this order item', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(razorpayPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture(), entitlementFixture({ id: ENTITLEMENT_2_ID })] as never);

    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, entitlementId: 'not-a-real-entitlement', amount: 100, type: 'PARTIAL' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects with CONFLICT when no voucher exists yet for this order item', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(razorpayPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 100, type: 'PARTIAL' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects an amount greater than the remaining refundable amount', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(razorpayPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture()] as never);

    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 1200, type: 'PARTIAL' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a FULL refund whose amount does not equal the exact remaining refundable amount', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(razorpayPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture()] as never);

    await expect(
      createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 999, type: 'FULL' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

/**
 * Feature: Full vs. partial refund arithmetic
 * Scenario: the SettlementAdjustment posted is `amount * (memberShareAmount / grossAmount)`,
 * negated — i.e. the MEMBER's proportional share of whatever was refunded to the customer, never
 * the full refunded amount itself (the commission portion was never the member's money to begin
 * with).
 */
describe('createRefund — full vs. partial arithmetic (gross 1000, memberShare 800 = 80% ratio)', () => {
  it('a FULL refund (₹1000) posts a REFUND adjustment of -₹800 and VOIDs the entitlement (pre-payout)', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(razorpayPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture()] as never);
    createRazorpayRefundMock.mockResolvedValue({ id: 'rfnd_1', status: 'processed' });
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-1' } as never);
    prismaMock.settlementAdjustment.create.mockResolvedValue({} as never);
    prismaMock.purchaseEntitlement.update.mockResolvedValue({} as never);

    await createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 1000, type: 'FULL' });

    expect(createRazorpayRefundMock).toHaveBeenCalledWith('pay_123', 100000); // paise
    expect(prismaMock.settlementAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entitlementId: ENTITLEMENT_ID, type: 'REFUND', amount: expect.anything() }),
    });
    const adjustmentAmount = (prismaMock.settlementAdjustment.create.mock.calls[0][0] as { data: { amount: Prisma.Decimal } }).data.amount;
    expect(adjustmentAmount.toFixed(2)).toBe('-800.00');
    expect(prismaMock.purchaseEntitlement.update).toHaveBeenCalledWith({
      where: { id: ENTITLEMENT_ID },
      data: { settlementStatus: 'VOID', preDisputeStatus: null },
    });
  });

  it('a PARTIAL refund (₹200) posts a REFUND adjustment of -₹160 and leaves settlementStatus untouched', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(codPaymentFixture() as never); // COD — no gateway call
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture()] as never);
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-2' } as never);
    prismaMock.settlementAdjustment.create.mockResolvedValue({} as never);

    await createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 200, type: 'PARTIAL' });

    expect(createRazorpayRefundMock).not.toHaveBeenCalled(); // COD — cash was never collected via Razorpay
    const adjustmentAmount = (prismaMock.settlementAdjustment.create.mock.calls[0][0] as { data: { amount: Prisma.Decimal } }).data.amount;
    expect(adjustmentAmount.toFixed(2)).toBe('-160.00');
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled(); // PARTIAL pre-payout: ledger-only, status untouched
  });

  it('refund AFTER payout posts a RECOVERY adjustment and leaves the entitlement (and the original MemberPayout) completely untouched', async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(codPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture({ payoutItemId: 'payout-item-1' })] as never);
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-3' } as never);
    prismaMock.settlementAdjustment.create.mockResolvedValue({} as never);

    await createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 1000, type: 'FULL' });

    expect(prismaMock.settlementAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'RECOVERY' }),
    });
    // history is never rewritten: the entitlement's settlementStatus (PAID) and the original
    // MemberPayout row are both left untouched — no MemberPayout write method exists in this
    // domain at all (payouts are append-only: created once, never mutated), so the absence of
    // any purchaseEntitlement.update call is the complete guarantee here.
    expect(prismaMock.purchaseEntitlement.update).not.toHaveBeenCalled();
  });

  it("auto-resolves the linked dispute as REFUNDED and, for a PARTIAL post-dispute refund, restores the entitlement's preDisputeStatus", async () => {
    prismaMock.orderItem.findUnique.mockResolvedValue(orderItemFixture() as never);
    prismaMock.payment.findFirst.mockResolvedValue(codPaymentFixture() as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([entitlementFixture({ preDisputeStatus: 'ON_HOLD' })] as never);
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-4' } as never);
    prismaMock.settlementAdjustment.create.mockResolvedValue({} as never);
    prismaMock.purchaseDispute.findUnique.mockResolvedValue({ id: DISPUTE_ID, status: 'OPEN' } as never);
    prismaMock.purchaseDispute.update.mockResolvedValue({} as never);
    prismaMock.purchaseEntitlement.update.mockResolvedValue({} as never);

    await createRefund(ADMIN_ID, { orderItemId: ORDER_ITEM_ID, amount: 200, type: 'PARTIAL', disputeId: DISPUTE_ID });

    expect(prismaMock.purchaseDispute.update).toHaveBeenCalledWith({
      where: { id: DISPUTE_ID },
      data: expect.objectContaining({ status: 'RESOLVED', resolutionType: 'REFUNDED' }),
    });
    expect(prismaMock.purchaseEntitlement.update).toHaveBeenCalledWith({
      where: { id: ENTITLEMENT_ID },
      data: { settlementStatus: 'ON_HOLD', preDisputeStatus: null },
    });
  });
});
