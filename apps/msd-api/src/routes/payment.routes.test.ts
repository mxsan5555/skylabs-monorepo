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

describe('POST /api/v1/orders/me/:id/verify-payment', () => {
  it('4/11. verifies a correct signature, marks Payment PAID and Order CONFIRMED', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
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
    prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'FAILED' });
    const res = await request(app)
      .post(`/api/v1/orders/me/${ORDER_ID}/verify-payment`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ razorpay_order_id: 'order_test123', razorpay_payment_id: 'pay_test123', razorpay_signature: 'not-the-real-signature' });
    expect(res.status).toBe(422);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('12. the Order update on success only ever touches status — never total/subtotal (historical amount preserved)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
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
    prismaMock.payment.findUnique.mockResolvedValue({ ...paymentFixture, status: 'PAID' });
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

describe('POST /api/v1/payments/webhook/razorpay', () => {
  const capturedEvent = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_test123', order_id: 'order_test123' } } } };
  const failedEvent = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_test123', order_id: 'order_test123', error_description: 'Card declined' } } } };

  it('rejects a request with an invalid/missing signature', async () => {
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', 'bad-signature').send(capturedEvent);
    expect(res.status).toBe(401);
    expect(prismaMock.payment.findUnique).not.toHaveBeenCalled();
  });

  it('10. processes a valid payment.captured event — Payment PAID, Order CONFIRMED', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'PAID' });
    prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', providerPaymentId: 'pay_test123' }) }),
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith({ where: { id: ORDER_ID }, data: { status: 'CONFIRMED' } });
  });

  it('6. processes a valid payment.failed event — Payment FAILED with the provider reason, Order untouched', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(paymentFixture);
    prismaMock.payment.update.mockResolvedValue({ ...paymentFixture, status: 'FAILED', failureReason: 'Card declined' });
    const signature = signWebhook(failedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(failedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failureReason: 'Card declined' }) }),
    );
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('9. a duplicate delivery of the same event is a no-op (idempotent)', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ ...paymentFixture, status: 'PAID' }); // already processed
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('never creates anything from an unknown/unrecognized providerOrderId — never trusts payload identifiers alone', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    const signature = signWebhook(capturedEvent);
    const res = await request(app).post('/api/v1/payments/webhook/razorpay').set('x-razorpay-signature', signature).send(capturedEvent);
    expect(res.status).toBe(200); // still ack — Razorpay would retry forever on a non-2xx for an event we simply don't recognize
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});
