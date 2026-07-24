import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma-client';

/** Route-level test of the webhook endpoint's signature verification + event
 *  handling — the same scenario verified manually against a real Razorpay test
 *  order during implementation (see PAYMENTS.md), automated here with a
 *  self-signed synthetic payload against the local dev DB.
 *
 *  Uses a real listening server + native fetch (not supertest) — the webhook
 *  signature is computed over exact raw bytes, and superagent's body handling
 *  doesn't guarantee byte-for-byte passthrough for a Buffer the way a real
 *  HTTP client does. */
let server: Server;
let baseUrl: string;
const TEST_USER_ID = 'test-user-webhook-spec';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;

async function postWebhook(rawBody: string, signature: string | undefined) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== undefined) headers['X-Razorpay-Signature'] = signature;
  const res = await fetch(`${baseUrl}/api/payments/webhook/razorpay`, {
    method: 'POST',
    headers,
    body: rawBody,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let dealId: string;
let pricingPlanId: string;
let locationId: string;

function signedBody(body: unknown) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex');
  return { raw, signature };
}

function webhookEvent(event: 'payment.captured' | 'payment.failed', orderId: string, paymentId: string) {
  return {
    entity: 'event',
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          method: event === 'payment.captured' ? 'upi' : undefined,
          error_description: event === 'payment.failed' ? 'Card declined by issuer.' : undefined,
        },
      },
    },
  };
}

async function createPendingOrder(providerOrderId: string) {
  const order = await prisma.order.create({
    data: {
      orderNumber: `TESTWH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: TEST_USER_ID,
      contactName: 'Test',
      contactPhone: '+919800000000',
      contactEmail: 'test@example.com',
      subtotalAmount: 10000,
      payableAmount: 10000,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      items: {
        create: [
          {
            dealId,
            dealTitle: 'Test Deal',
            companyName: 'Test Co',
            heroImageUrl: 'https://example.com/x.jpg',
            pricingPlanId,
            planName: 'Test plan',
            unitPriceAmount: 10000,
            locationId,
            locationName: 'Test location',
            addressLine: '1 Test St',
            quantity: 1,
            bookingDate: '2026-08-01',
            bookingTime: '10:00',
            voucherCode: `TESTWH-${Math.random().toString(36).slice(2, 10)}`,
          },
        ],
      },
    },
  });
  await prisma.payment.create({
    data: { orderId: order.id, provider: 'razorpay', providerOrderId, amount: 10000, status: 'CREATED' },
  });
  return order;
}

beforeAll(async () => {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: 'd-01' },
    include: { pricingPlans: true, locationLinks: true },
  });
  dealId = deal.id;
  pricingPlanId = deal.pricingPlans[0].id;
  locationId = deal.locationLinks[0].locationId;

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

afterEach(async () => {
  await prisma.order.deleteMany({ where: { userId: TEST_USER_ID } });
});

describe('POST /api/payments/webhook/razorpay', () => {
  it('rejects a request with a wrong signature', async () => {
    const { raw } = signedBody(webhookEvent('payment.captured', 'order_route_spec_1', 'pay_route_1'));
    const res = await postWebhook(raw, 'deadbeef'.repeat(8));

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('invalid_signature');
  });

  it('rejects a request with no signature header', async () => {
    const { raw } = signedBody(webhookEvent('payment.captured', 'order_route_spec_1', 'pay_route_1'));
    const res = await postWebhook(raw, undefined);

    expect(res.status).toBe(400);
  });

  it('processes a validly-signed payment.captured event end to end', async () => {
    const order = await createPendingOrder('order_route_spec_captured');
    const { raw, signature } = signedBody(webhookEvent('payment.captured', 'order_route_spec_captured', 'pay_route_captured'));

    const res = await postWebhook(raw, signature);
    expect(res.status).toBe(200);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true } });
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.items[0].itemStatus).toBe('CONFIRMED');
    expect(updated.payments[0].status).toBe('CAPTURED');
    expect(updated.payments[0].providerPaymentId).toBe('pay_route_captured');
  });

  it('processes a validly-signed payment.failed event and leaves the order retryable', async () => {
    const order = await createPendingOrder('order_route_spec_failed');
    const { raw, signature } = signedBody(webhookEvent('payment.failed', 'order_route_spec_failed', 'pay_route_failed'));

    const res = await postWebhook(raw, signature);
    expect(res.status).toBe(200);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true } });
    expect(updated.status).toBe('PENDING_PAYMENT');
    expect(updated.items[0].itemStatus).toBe('PENDING');
    expect(updated.payments[0].status).toBe('FAILED');
    expect(updated.payments[0].failureReason).toBe('Card declined by issuer.');
  });

  it('is idempotent when the same captured event is redelivered', async () => {
    await createPendingOrder('order_route_spec_dup');
    const { raw, signature } = signedBody(webhookEvent('payment.captured', 'order_route_spec_dup', 'pay_route_dup'));

    await postWebhook(raw, signature);
    const secondRes = await postWebhook(raw, signature);

    expect(secondRes.status).toBe(200);
    const paymentCount = await prisma.payment.count({ where: { providerOrderId: 'order_route_spec_dup' } });
    expect(paymentCount).toBe(1);
  });
});
