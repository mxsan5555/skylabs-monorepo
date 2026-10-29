import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

const getMyOrderOrThrowMock = vi.fn();
const finalizeCartForOrderMock = vi.fn();
vi.mock('./order.service', () => ({
  getMyOrderOrThrow: (...args: unknown[]) => getMyOrderOrThrowMock(...args),
  finalizeCartForOrder: (...args: unknown[]) => finalizeCartForOrderMock(...args),
}));

const notifyOrderConfirmedMock = vi.fn();
vi.mock('./notification.service', () => ({ notifyOrderConfirmed: (...args: unknown[]) => notifyOrderConfirmedMock(...args) }));

const createEntitlementsForOrderMock = vi.fn();
vi.mock('./settlement.service', () => ({ createEntitlementsForOrder: (...args: unknown[]) => createEntitlementsForOrderMock(...args) }));

import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import {
  verifyPayment,
  createCodPayment,
  createCodBatchPayment,
  verifyBatchPayment,
  handleWebhookEvent,
} from './payment.service';

const prismaMock = vi.mocked(prisma, true);

const CUSTOMER_ID = 'e0000000-0000-4000-8000-000000000001';
const ORDER_ID = 'e0000000-0000-4000-8000-000000000002';
const ORDER_ID_2 = 'e0000000-0000-4000-8000-000000000003';
const PAYMENT_ID = 'e0000000-0000-4000-8000-000000000004';

function razorpaySignatureFor(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex');
}

function pendingOrder(id = ORDER_ID) {
  return { id, status: 'PENDING_PAYMENT', total: 500 };
}

beforeEach(() => {
  vi.clearAllMocks();
  finalizeCartForOrderMock.mockResolvedValue(undefined);
  notifyOrderConfirmedMock.mockResolvedValue(undefined);
  createEntitlementsForOrderMock.mockResolvedValue(undefined);
});

/**
 * Feature: Entitlement-generation wiring — all 5 of payment.service.ts's own CONFIRMED-
 * transition sites must call createEntitlementsForOrder(tx, orderId) inside the SAME transaction
 * that flips Order.status to CONFIRMED, exactly once per order, every time.
 */
describe('createEntitlementsForOrder wiring — call site 1/5: createCodPayment', () => {
  it('calls createEntitlementsForOrder(tx, orderId) once the order is marked CONFIRMED', async () => {
    getMyOrderOrThrowMock.mockResolvedValue(pendingOrder());
    prismaMock.payment.create.mockResolvedValue({ id: PAYMENT_ID } as never);
    prismaMock.order.update.mockResolvedValue({ id: ORDER_ID, status: 'CONFIRMED' } as never);

    await createCodPayment(CUSTOMER_ID, ORDER_ID);

    expect(createEntitlementsForOrderMock).toHaveBeenCalledTimes(1);
    expect(createEntitlementsForOrderMock).toHaveBeenCalledWith(expect.anything(), ORDER_ID);
  });

  it('a second call on an order that is no longer PENDING_PAYMENT never re-creates entitlements', async () => {
    getMyOrderOrThrowMock.mockResolvedValue({ id: ORDER_ID, status: 'CONFIRMED', total: 500 });
    await expect(createCodPayment(CUSTOMER_ID, ORDER_ID)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(createEntitlementsForOrderMock).not.toHaveBeenCalled();
  });
});

describe('createEntitlementsForOrder wiring — call site 2/5: createCodBatchPayment', () => {
  it('calls createEntitlementsForOrder once PER ORDER in the batch', async () => {
    getMyOrderOrThrowMock.mockImplementation((_cust: string, id: string) => Promise.resolve(pendingOrder(id)));
    prismaMock.payment.create.mockResolvedValue({} as never);
    prismaMock.order.update.mockImplementation((args: unknown) => Promise.resolve({ id: (args as { where: { id: string } }).where.id, status: 'CONFIRMED' }) as never);

    await createCodBatchPayment(CUSTOMER_ID, [ORDER_ID, ORDER_ID_2]);

    expect(createEntitlementsForOrderMock).toHaveBeenCalledTimes(2);
    expect(createEntitlementsForOrderMock).toHaveBeenCalledWith(expect.anything(), ORDER_ID);
    expect(createEntitlementsForOrderMock).toHaveBeenCalledWith(expect.anything(), ORDER_ID_2);
  });
});

describe('createEntitlementsForOrder wiring — call site 3/5: verifyPayment', () => {
  const RAZORPAY_ORDER_ID = 'rzp_order_1';
  const RAZORPAY_PAYMENT_ID = 'rzp_pay_1';

  it('calls createEntitlementsForOrder exactly once on a fresh, valid signature verification', async () => {
    getMyOrderOrThrowMock.mockResolvedValue(pendingOrder());
    prismaMock.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: 'CREATED', providerOrderId: RAZORPAY_ORDER_ID } as never);
    prismaMock.payment.update.mockResolvedValue({ id: PAYMENT_ID, status: 'PAID' } as never);
    prismaMock.order.update.mockResolvedValue({ id: ORDER_ID, status: 'CONFIRMED' } as never);

    const signature = razorpaySignatureFor(RAZORPAY_ORDER_ID, RAZORPAY_PAYMENT_ID);
    await verifyPayment(CUSTOMER_ID, ORDER_ID, {
      razorpay_order_id: RAZORPAY_ORDER_ID,
      razorpay_payment_id: RAZORPAY_PAYMENT_ID,
      razorpay_signature: signature,
    });

    expect(createEntitlementsForOrderMock).toHaveBeenCalledTimes(1);
    expect(createEntitlementsForOrderMock).toHaveBeenCalledWith(expect.anything(), ORDER_ID);
  });

  it('is idempotent — re-verifying an already-PAID payment is a no-op, never a second entitlement pass', async () => {
    getMyOrderOrThrowMock.mockResolvedValue({ id: ORDER_ID, status: 'CONFIRMED', total: 500 });
    prismaMock.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: 'PAID', providerOrderId: RAZORPAY_ORDER_ID } as never);

    await verifyPayment(CUSTOMER_ID, ORDER_ID, {
      razorpay_order_id: RAZORPAY_ORDER_ID,
      razorpay_payment_id: RAZORPAY_PAYMENT_ID,
      razorpay_signature: 'irrelevant-since-already-paid',
    });

    expect(createEntitlementsForOrderMock).not.toHaveBeenCalled();
  });

  it('never creates entitlements when the signature fails verification', async () => {
    getMyOrderOrThrowMock.mockResolvedValue(pendingOrder());
    prismaMock.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID, status: 'CREATED', providerOrderId: RAZORPAY_ORDER_ID } as never);
    prismaMock.payment.update.mockResolvedValue({} as never);

    await expect(
      verifyPayment(CUSTOMER_ID, ORDER_ID, {
        razorpay_order_id: RAZORPAY_ORDER_ID,
        razorpay_payment_id: RAZORPAY_PAYMENT_ID,
        razorpay_signature: 'deliberately-wrong',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(createEntitlementsForOrderMock).not.toHaveBeenCalled();
  });
});

describe('createEntitlementsForOrder wiring — call site 4/5: verifyBatchPayment', () => {
  const RAZORPAY_ORDER_ID = 'rzp_batch_1';
  const RAZORPAY_PAYMENT_ID = 'rzp_batch_pay_1';

  it('calls createEntitlementsForOrder once PER ORDER in a verified batch', async () => {
    getMyOrderOrThrowMock.mockImplementation((_cust: string, id: string) => Promise.resolve(pendingOrder(id)));
    prismaMock.payment.findMany.mockResolvedValue([
      { id: 'p1', orderId: ORDER_ID, status: 'CREATED', providerOrderId: RAZORPAY_ORDER_ID },
      { id: 'p2', orderId: ORDER_ID_2, status: 'CREATED', providerOrderId: RAZORPAY_ORDER_ID },
    ] as never);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.order.update.mockImplementation((args: unknown) => Promise.resolve({ id: (args as { where: { id: string } }).where.id, status: 'CONFIRMED' }) as never);

    const signature = razorpaySignatureFor(RAZORPAY_ORDER_ID, RAZORPAY_PAYMENT_ID);
    await verifyBatchPayment(CUSTOMER_ID, [ORDER_ID, ORDER_ID_2], {
      razorpay_order_id: RAZORPAY_ORDER_ID,
      razorpay_payment_id: RAZORPAY_PAYMENT_ID,
      razorpay_signature: signature,
    });

    expect(createEntitlementsForOrderMock).toHaveBeenCalledTimes(2);
  });
});

describe('createEntitlementsForOrder wiring — call site 5/5: handleWebhookEvent (payment.captured)', () => {
  it('calls createEntitlementsForOrder once per newly-confirmed order on a captured-payment webhook', async () => {
    prismaMock.payment.findMany.mockResolvedValue([
      { id: PAYMENT_ID, orderId: ORDER_ID, status: 'CREATED', providerOrderId: 'rzp_webhook_order_1' },
    ] as never);
    prismaMock.order.findMany.mockResolvedValue([{ id: ORDER_ID, status: 'PENDING_PAYMENT' }] as never);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 } as never);

    await handleWebhookEvent({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'rzp_captured_1', order_id: 'rzp_webhook_order_1' } } },
    });

    expect(createEntitlementsForOrderMock).toHaveBeenCalledTimes(1);
    expect(createEntitlementsForOrderMock).toHaveBeenCalledWith(expect.anything(), ORDER_ID);
  });

  it('is idempotent on a duplicate webhook retry — all Payments already terminal is a no-op', async () => {
    prismaMock.payment.findMany.mockResolvedValue([
      { id: PAYMENT_ID, orderId: ORDER_ID, status: 'PAID', providerOrderId: 'rzp_webhook_order_1' },
    ] as never);

    await handleWebhookEvent({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'rzp_captured_1', order_id: 'rzp_webhook_order_1' } } },
    });

    expect(createEntitlementsForOrderMock).not.toHaveBeenCalled();
  });

  it('never creates entitlements for an unrelated event (payment.failed)', async () => {
    prismaMock.payment.findMany.mockResolvedValue([
      { id: PAYMENT_ID, orderId: ORDER_ID, status: 'CREATED', providerOrderId: 'rzp_webhook_order_1' },
    ] as never);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 } as never);

    await handleWebhookEvent({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'rzp_failed_1', order_id: 'rzp_webhook_order_1', error_description: 'card declined' } } },
    });

    expect(createEntitlementsForOrderMock).not.toHaveBeenCalled();
  });
});

/**
 * Feature: `refund.processed`/`refund.failed` webhook — the async confirmation path for a
 * refund `createRefund` already applied synchronously. Must be idempotent on retry (Razorpay
 * resends on any non-2xx) and must never touch a Refund row that isn't ours or is already
 * terminal, mirroring the payment-side terminal-state guard tested above.
 */
describe('handleWebhookEvent — refund.processed / refund.failed', () => {
  const REFUND_ID = 'e0000000-0000-4000-8000-000000000005';
  const PROVIDER_REFUND_ID = 'rfnd_live_1';

  it('marks a REQUESTED Refund PROCESSED on refund.processed', async () => {
    prismaMock.refund.findUnique.mockResolvedValue({ id: REFUND_ID, status: 'REQUESTED' } as never);

    await handleWebhookEvent({
      event: 'refund.processed',
      payload: { refund: { entity: { id: PROVIDER_REFUND_ID, status: 'processed' } } },
    });

    expect(prismaMock.refund.update).toHaveBeenCalledWith({
      where: { id: REFUND_ID },
      data: { status: 'PROCESSED', processedAt: expect.any(Date) },
    });
  });

  it('marks a REQUESTED Refund FAILED on refund.failed', async () => {
    prismaMock.refund.findUnique.mockResolvedValue({ id: REFUND_ID, status: 'REQUESTED' } as never);

    await handleWebhookEvent({
      event: 'refund.failed',
      payload: { refund: { entity: { id: PROVIDER_REFUND_ID, status: 'failed' } } },
    });

    expect(prismaMock.refund.update).toHaveBeenCalledWith({ where: { id: REFUND_ID }, data: { status: 'FAILED' } });
  });

  it('is idempotent on a duplicate refund.processed retry — an already-PROCESSED Refund is a no-op', async () => {
    prismaMock.refund.findUnique.mockResolvedValue({ id: REFUND_ID, status: 'PROCESSED' } as never);

    await handleWebhookEvent({
      event: 'refund.processed',
      payload: { refund: { entity: { id: PROVIDER_REFUND_ID, status: 'processed' } } },
    });

    expect(prismaMock.refund.update).not.toHaveBeenCalled();
  });

  it('is a no-op for an already-FAILED Refund receiving a late refund.processed retry', async () => {
    prismaMock.refund.findUnique.mockResolvedValue({ id: REFUND_ID, status: 'FAILED' } as never);

    await handleWebhookEvent({
      event: 'refund.processed',
      payload: { refund: { entity: { id: PROVIDER_REFUND_ID, status: 'processed' } } },
    });

    expect(prismaMock.refund.update).not.toHaveBeenCalled();
  });

  it('is a no-op for a providerRefundId that is not ours', async () => {
    prismaMock.refund.findUnique.mockResolvedValue(null);

    await handleWebhookEvent({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_not_ours', status: 'processed' } } },
    });

    expect(prismaMock.refund.update).not.toHaveBeenCalled();
  });

  it('never calls createEntitlementsForOrder for a refund event (not a payment-confirmation path)', async () => {
    prismaMock.refund.findUnique.mockResolvedValue({ id: REFUND_ID, status: 'REQUESTED' } as never);

    await handleWebhookEvent({
      event: 'refund.processed',
      payload: { refund: { entity: { id: PROVIDER_REFUND_ID, status: 'processed' } } },
    });

    expect(createEntitlementsForOrderMock).not.toHaveBeenCalled();
  });
});
