import request from 'supertest';
import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../lib/razorpay', () => ({
  razorpay: { orders: { create: vi.fn() } },
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { razorpay } from '../lib/razorpay';
import { env } from '../config/env';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);
const razorpayMock = vi.mocked(razorpay, true);

const CUSTOMER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const OTHER_CUSTOMER_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const ORDER_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const PAYMENT_ID = 'd0d0d0d0-0000-4000-8000-000000000004';

const ORDER_ID_2 = 'e0e0e0e0-0000-4000-8000-000000000005';

const orderFixture = {
  id: ORDER_ID,
  customerId: CUSTOMER_ID,
  vendorId: 'vendor-1',
  branchId: 'branch-1',
  type: 'PRODUCT',
  status: 'PENDING_PAYMENT',
  total: '398.00',
  items: [],
};

const orderFixture2 = { ...orderFixture, id: ORDER_ID_2, total: '199.00' };

const paymentFixture = {
  id: PAYMENT_ID,
  orderId: ORDER_ID,
  provider: 'RAZORPAY',
  providerOrderId: 'order_test123',
  providerPaymentId: null,
  amount: '398.00',
  currency: 'INR',
  status: 'CREATED',
  signatureVerified: false,
};

function signWebhook(body: unknown): string {
  return crypto.createHmac('sha256', env.razorpayWebhookSecret).update(JSON.stringify(body)).digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  // Every successful payment path now also calls notifyOrderConfirmed (see notification.service.ts)
  // — harmless no-op defaults here (zero order items -> zero vendors to notify, zero superadmins)
  // for every test in this file that isn't specifically asserting notification behavior.
  prismaMock.orderItem.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe('POST /api/v1/orders/me/:id/pay', () => {
  it('15. returns 401 with no token', async () => {
    const res = await request(app).post(`/api/v1/orders/me/${ORDER_ID}/pay`);
    expect(res.status).toBe(401);
  });

  it('2/16. 404s for another customer\'s order (never confirms existence)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(404);
    expect(razorpayMock.orders.create).not.toHaveBeenCalled();
  });

  it('13. a vendor-role token cannot pay an order it does not own — same 404 isolation as any caller', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: 'vendor-user-1', roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });

  it('1. creates a Razorpay order using the server-side Order.total, in paise', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    razorpayMock.orders.create.mockResolvedValue({ id: 'order_test123', amount: 39800, currency: 'INR' });
    prismaMock.payment.create.mockResolvedValue(paymentFixture);
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(razorpayMock.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 39800, currency: 'INR' }));
  });

  it('3. ignores any client-supplied amount — there is no amount field to spoof in the first place', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    razorpayMock.orders.create.mockResolvedValue({ id: 'order_test123', amount: 39800, currency: 'INR' });
    prismaMock.payment.create.mockResolvedValue(paymentFixture);
    await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ amount: 1, total: 1 }); // attempted spoof — route reads req.params.id + server Order only
    expect(razorpayMock.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 39800 }));
  });

  it('surfaces a clean 500 with a real message (never an opaque crash) when the Razorpay SDK call itself fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    razorpayMock.orders.create.mockRejectedValue(new Error('Razorpay: authentication failed'));
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Could not start the payment — please try again in a moment.');
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    // The real SDK error is still logged server-side for diagnosis — never silently discarded.
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ context: 'razorpay.orders.create' }));
    consoleErrorSpy.mockRestore();
  });

  it('7/8. reuses an existing non-terminal Payment instead of creating a second one (retry / duplicate click)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(paymentFixture); // an attempt already in flight
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.providerOrderId).toBe('order_test123');
    expect(razorpayMock.orders.create).not.toHaveBeenCalled();
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  it('rejects paying for an order that is not PENDING_PAYMENT', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(409);
  });

  it('14. never returns the Razorpay key secret or any credential, only the public keyId', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    razorpayMock.orders.create.mockResolvedValue({ id: 'order_test123', amount: 39800, currency: 'INR' });
    prismaMock.payment.create.mockResolvedValue(paymentFixture);
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.body.data.keyId).toBe(env.razorpayKeyId);
    expect(JSON.stringify(res.body)).not.toContain(env.razorpayKeySecret);
  });
});

describe('POST /api/v1/orders/me/:id/pay-cod', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`);
    expect(res.status).toBe(401);
  });

  it("404s for another customer's order (never confirms existence)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(404);
  });

  it('creates a CREATED-status COD payment and confirms the order — never marks it PAID', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.create.mockResolvedValue({ ...paymentFixture, provider: 'COD', providerOrderId: `cod_${ORDER_ID}`, status: 'CREATED' });
    prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(prismaMock.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'COD', status: 'CREATED' }) }),
    );
    // Never PAID for COD — cash hasn't actually been collected.
    expect(prismaMock.payment.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });

  it('rejects COD confirmation for an order that is not PENDING_PAYMENT', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });

  describe('order-confirmed notifications', () => {
    it('a successful COD confirmation notifies the order\'s vendor(s) + Superadmin', async () => {
      prismaMock.order.findUnique.mockResolvedValue(orderFixture);
      prismaMock.payment.create.mockResolvedValue({ ...paymentFixture, provider: 'COD', status: 'CREATED' });
      prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
      prismaMock.orderItem.findMany.mockResolvedValue([{ vendorId: 'vendor-1' }]);
      prismaMock.vendor.findUnique.mockResolvedValue({ ownerUserId: 'vendor-1-owner' });
      prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }]);

      const res = await request(app)
        .post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`)
        .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));

      expect(res.status).toBe(200);
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recipientUserId: 'vendor-1-owner', recipientType: 'VENDOR', type: 'ORDER_RECEIVED', entityType: 'ORDER', entityId: ORDER_ID }),
        }),
      );
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ recipientUserId: 'superadmin-1', recipientType: 'SUPERADMIN', type: 'ORDER_RECEIVED' }),
        }),
      );
    });

    it('a multi-vendor order notifies each distinct vendor exactly once, never duplicated', async () => {
      prismaMock.order.findUnique.mockResolvedValue(orderFixture);
      prismaMock.payment.create.mockResolvedValue({ ...paymentFixture, provider: 'COD', status: 'CREATED' });
      prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
      prismaMock.orderItem.findMany.mockResolvedValue([{ vendorId: 'vendor-A' }, { vendorId: 'vendor-A' }, { vendorId: 'vendor-B' }]);
      prismaMock.vendor.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ ownerUserId: where.id === 'vendor-A' ? 'owner-A' : 'owner-B' }),
      );
      prismaMock.user.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`)
        .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));

      expect(res.status).toBe(200);
      const vendorNotifications = prismaMock.notification.create.mock.calls.filter(
        ([arg]) => arg.data.recipientType === 'VENDOR',
      );
      expect(vendorNotifications).toHaveLength(2); // vendor-A once, vendor-B once — never 3
    });

    it('a rejected COD confirmation (not PENDING_PAYMENT) creates zero notifications', async () => {
      prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
      await request(app)
        .post(`/api/v1/orders/me/${ORDER_ID}/pay-cod`)
        .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });
  });
});

describe('POST /api/v1/orders/me/:id/verify-payment', () => {
  it('4/11. verifies a correct signature, marks Payment PAID and Order CONFIRMED', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'PAID', providerPaymentId: 'pay_test123', signatureVerified: true });
    prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const signature = crypto.createHmac('sha256', env.razorpayKeySecret).update('order_test123|pay_test123').digest('hex');
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: signature });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', providerPaymentId: 'pay_test123', signatureVerified: true }) }),
    );
  });

  it('5/11. rejects an invalid signature — Payment marked FAILED, Order untouched', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'FAILED' });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: 'not-the-real-signature' });
    expect(res.status).toBe(422);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('rejects a same-length-but-wrong hex signature (exercises the crypto.timingSafeEqual code path, not just the length-mismatch fallback)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'FAILED' });
    // Real signature is a 64-char hex (sha256 digest) — flip its first hex char so length
    // matches exactly but content doesn't, forcing the comparison through
    // crypto.timingSafeEqual itself rather than the defensive length pre-check.
    const realSignature = crypto.createHmac('sha256', env.razorpayKeySecret).update('order_test123|pay_test123').digest('hex');
    const wrongSameLength = (realSignature[0] === 'a' ? 'b' : 'a') + realSignature.slice(1);
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: wrongSameLength });
    expect(res.status).toBe(422);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('12. the Order update on success only ever touches status — never total/subtotal (historical amount preserved)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'PAID' });
    prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const signature = crypto.createHmac('sha256', env.razorpayKeySecret).update('order_test123|pay_test123').digest('hex');
    await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: signature });
    expect(prismaMock.order.update).toHaveBeenCalledWith({ where: { id: ORDER_ID }, data: { status: 'CONFIRMED' } });
  });

  it('is idempotent — verifying an already-PAID payment again is a no-op, not a re-processing', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findFirst.mockResolvedValue({ ...paymentFixture, status: 'PAID' });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: 'irrelevant-already-paid' });
    expect(res.status).toBe(200);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('16. 404s verifying a payment for another customer\'s order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: 'x' });
    expect(res.status).toBe(404);
  });
});

/**
 * Feature: Combined checkout batch payment (Deal + Therapist + Product together — one checkout
 * action, one Razorpay payment intent, multiple Order rows under the hood).
 * Scenario: /pay-batch, /pay-batch/cod, /pay-batch/verify — previously zero test coverage
 * despite payment.service.ts's `*Batch` functions mirroring the well-tested single-order path.
 *
 * Given: a customer with 2 PENDING_PAYMENT orders from one combined checkout
 * When: they pay for the batch (Razorpay or COD) and, for Razorpay, verify the signature
 * Then: a single Razorpay order intent covers the whole batch (or, for COD, both orders move
 *       straight to CONFIRMED together)
 *
 * Edge cases:
 * - one order in the batch not owned by the caller -> 404, nothing charged
 * - one order in the batch not PENDING_PAYMENT -> 409, nothing charged
 * - an invalid batch signature marks every payment in the batch FAILED, no order confirmed
 */
describe('POST /api/v1/orders/pay-batch', () => {
  function findOrderById(orders: Record<string, unknown>[]) {
    return ({ where }: { where: { id: string } }) => Promise.resolve(orders.find((o) => o.id === where.id) ?? null);
  }

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/orders/pay-batch').send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(401);
  });

  it('creates a single Razorpay order covering the combined total of every order in the batch', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, orderFixture2]));
    prismaMock.payment.findFirst.mockResolvedValue(null);
    razorpayMock.orders.create.mockResolvedValue({ id: 'order_batch123', amount: 59700, currency: 'INR' });
    prismaMock.payment.createMany.mockResolvedValue({ count: 2 });
    const res = await request(app)
      .post('/api/v1/orders/pay-batch')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(200);
    expect(razorpayMock.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 59700 })); // 398 + 199 in paise
    expect(prismaMock.payment.createMany).toHaveBeenCalled();
  });

  it('404s (not 500) when one order in the batch belongs to a different customer', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, { ...orderFixture2, customerId: OTHER_CUSTOMER_ID }]));
    const res = await request(app)
      .post('/api/v1/orders/pay-batch')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(404);
    expect(razorpayMock.orders.create).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when one order in the batch is not PENDING_PAYMENT', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, { ...orderFixture2, status: 'CONFIRMED' }]));
    const res = await request(app)
      .post('/api/v1/orders/pay-batch')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(409);
    expect(razorpayMock.orders.create).not.toHaveBeenCalled();
  });

  it('422s an empty orderIds array (schema-level, before touching Prisma)', async () => {
    const res = await request(app)
      .post('/api/v1/orders/pay-batch')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [] });
    expect(res.status).toBe(422);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/orders/pay-batch/cod', () => {
  function findOrderById(orders: Record<string, unknown>[]) {
    return ({ where }: { where: { id: string } }) => Promise.resolve(orders.find((o) => o.id === where.id) ?? null);
  }

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/orders/pay-batch/cod').send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(401);
  });

  it('confirms every order in the batch together via COD, never marking any of them PAID', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, orderFixture2]));
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock));
    prismaMock.payment.create.mockResolvedValue({ ...paymentFixture, provider: 'COD', status: 'CREATED' });
    prismaMock.order.update.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ ...(where.id === ORDER_ID ? orderFixture : orderFixture2), status: 'CONFIRMED' }),
    );
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/cod')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((o: { status: string }) => o.status === 'CONFIRMED')).toBe(true);
    expect(prismaMock.payment.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });

  it('returns a clean 409 (not a raw 500) when one order in the batch is not PENDING_PAYMENT', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, { ...orderFixture2, status: 'CANCELLED' }]));
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/cod')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2] });
    expect(res.status).toBe(409);
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/orders/pay-batch/verify', () => {
  function findOrderById(orders: Record<string, unknown>[]) {
    return ({ where }: { where: { id: string } }) => Promise.resolve(orders.find((o) => o.id === where.id) ?? null);
  }
  const batchPaymentA = { ...paymentFixture, id: 'pay-a', orderId: ORDER_ID, providerOrderId: 'order_batch123' };
  const batchPaymentB = { ...paymentFixture, id: 'pay-b', orderId: ORDER_ID_2, providerOrderId: 'order_batch123' };

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/verify')
      .send({ orderIds: [ORDER_ID, ORDER_ID_2], razorpay_order_id: 'x', razorpay_payment_id: 'y', razorpay_signature: 'z' });
    expect(res.status).toBe(401);
  });

  it('verifies a correct batch signature, marking every Payment PAID and every Order CONFIRMED together', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, orderFixture2]));
    prismaMock.payment.findMany.mockResolvedValue([batchPaymentA, batchPaymentB]);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock));
    prismaMock.payment.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.order.update.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ ...(where.id === ORDER_ID ? orderFixture : orderFixture2), status: 'CONFIRMED' }),
    );
    const signature = crypto.createHmac('sha256', env.razorpayKeySecret).update('order_batch123|pay_test123').digest('hex');
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/verify')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2], razorpay_order_id: 'order_batch123', razorpay_payment_id: 'pay_test123', razorpay_signature: signature });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });

  it('rejects an invalid batch signature — every Payment in the batch marked FAILED, no Order confirmed', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, orderFixture2]));
    prismaMock.payment.findMany.mockResolvedValue([batchPaymentA, batchPaymentB]);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 2 });
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/verify')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2], razorpay_order_id: 'order_batch123', razorpay_payment_id: 'pay_test123', razorpay_signature: 'not-the-real-signature' });
    expect(res.status).toBe(422);
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when one order in the batch was already settled by a different payment attempt', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, { ...orderFixture2, status: 'CONFIRMED' }]));
    prismaMock.payment.findMany.mockResolvedValue([batchPaymentA, batchPaymentB]);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 2 });
    const signature = crypto.createHmac('sha256', env.razorpayKeySecret).update('order_batch123|pay_test123').digest('hex');
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/verify')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2], razorpay_order_id: 'order_batch123', razorpay_payment_id: 'pay_test123', razorpay_signature: signature });
    expect(res.status).toBe(409);
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('404s (not 500) verifying a batch where one order does not belong to the caller', async () => {
    prismaMock.order.findUnique.mockImplementation(findOrderById([orderFixture, { ...orderFixture2, customerId: OTHER_CUSTOMER_ID }]));
    const res = await request(app)
      .post('/api/v1/orders/pay-batch/verify')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderIds: [ORDER_ID, ORDER_ID_2], razorpay_order_id: 'order_batch123', razorpay_payment_id: 'pay_test123', razorpay_signature: 'irrelevant' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/payments/webhook/razorpay', () => {
  const capturedEvent = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test123', order_id: 'order_test123' } } } };
  const failedEvent = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_test123', order_id: 'order_test123', error_description: 'Card declined' } } } };

  it('rejects a request with an invalid/missing signature', async () => {
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', 'bad-signature').send(capturedEvent);
    expect(res.status).toBe(401);
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it('10. processes a valid payment.captured event — Payment PAID, Order CONFIRMED', async () => {
    prismaMock.payment.findMany.mockResolvedValue([paymentFixture]);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    // handleWebhookEvent re-reads the now-CONFIRMED orders (updateMany doesn't return rows) so
    // it can finalize each one's linked Cart — the read must resolve even though this fixture's
    // Cart has no pendingOrderId pointing at it (finalizeCartForOrder is then a no-op).
    prismaMock.order.findMany.mockResolvedValue([orderFixture]);
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', providerPaymentId: 'pay_test123' }) }),
    );
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({ where: { id: { in: [ORDER_ID] } }, data: { status: 'CONFIRMED' } });
  });

  it('6. processes a valid payment.failed event — Payment FAILED with the provider reason, Order untouched', async () => {
    prismaMock.payment.findMany.mockResolvedValue([paymentFixture]);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    const signature = signWebhook(failedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(failedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failureReason: 'Card declined' }) }),
    );
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('9. a duplicate delivery of the same event is a no-op (idempotent)', async () => {
    prismaMock.payment.findMany.mockResolvedValue([{ ...paymentFixture, status: 'PAID' }]); // already processed
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    // Already-terminal (PAID) is filtered out before any write — a retry must never create a
    // second notification for the same real confirmation event.
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('a real payment.captured event notifies the order\'s vendor(s) + Superadmin exactly once', async () => {
    prismaMock.payment.findMany.mockResolvedValue([paymentFixture]);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.order.findMany.mockResolvedValue([orderFixture]);
    prismaMock.orderItem.findMany.mockResolvedValue([{ vendorId: 'vendor-1' }]);
    prismaMock.vendor.findUnique.mockResolvedValue({ ownerUserId: 'vendor-1-owner' });
    prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }]);
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2); // 1 vendor + 1 superadmin, never duplicated
  });

  it('never creates anything from an unknown/unrecognized providerOrderId — never trusts payload identifiers alone', async () => {
    prismaMock.payment.findMany.mockResolvedValue([]);
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200); // still ack — Razorpay would retry forever on a non-2xx for an event we simply don't recognize
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});
