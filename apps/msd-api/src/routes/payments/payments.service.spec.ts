import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

import { prisma } from '../../lib/prisma-client';
import { markPaymentCaptured, markPaymentFailed } from './payments.service';

/** Integration tests against the local dev Postgres DB (same DATABASE_URL the app
 *  itself uses — there's no separate test DB in this repo). Each test creates its
 *  own throwaway Order/Payment rows keyed off the seeded `d-01` deal and cleans up
 *  in afterEach, so it's safe to run alongside manual dev-server testing. */

const TEST_USER_ID = 'test-user-payments-spec';
let dealId: string;
let pricingPlanId: string;
let locationId: string;

async function createPendingOrder(providerOrderId: string) {
  const orderNumber = `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const order = await prisma.order.create({
    data: {
      orderNumber,
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
            voucherCode: `TEST-${Math.random().toString(36).slice(2, 10)}`,
          },
        ],
      },
    },
  });
  const payment = await prisma.payment.create({
    data: { orderId: order.id, provider: 'razorpay', providerOrderId, amount: 10000, status: 'CREATED' },
  });
  return { order, payment };
}

beforeAll(async () => {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: 'd-01' },
    include: { pricingPlans: true, locationLinks: true },
  });
  dealId = deal.id;
  pricingPlanId = deal.pricingPlans[0].id;
  locationId = deal.locationLinks[0].locationId;
});

afterEach(async () => {
  await prisma.order.deleteMany({ where: { userId: TEST_USER_ID } });
});

describe('payments.service', () => {
  it('markPaymentCaptured transitions Payment/Order/OrderItem and clears the cart', async () => {
    const { order } = await createPendingOrder('order_spec_captured_1');
    const cart = await prisma.cart.create({ data: { userId: TEST_USER_ID } });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        dealId,
        pricingPlanId,
        locationId,
        priceSnapshotAmount: 10000,
      },
    });

    await markPaymentCaptured('order_spec_captured_1', 'pay_spec_1', 'UPI');

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true } });
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.items[0].itemStatus).toBe('CONFIRMED');
    expect(updated.payments[0].status).toBe('CAPTURED');
    expect(updated.payments[0].method).toBe('UPI');
    expect(updated.payments[0].capturedAt).toBeInstanceOf(Date);

    const remainingCartItems = await prisma.cartItem.count({ where: { cartId: cart.id } });
    expect(remainingCartItems).toBe(0);

    await prisma.cart.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  it('markPaymentCaptured is idempotent on redelivery', async () => {
    const { order } = await createPendingOrder('order_spec_captured_2');

    await markPaymentCaptured('order_spec_captured_2', 'pay_spec_2', 'CARD');
    const first = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

    await markPaymentCaptured('order_spec_captured_2', 'pay_spec_2_retry', 'CARD');
    const second = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

    expect(second.capturedAt?.getTime()).toBe(first.capturedAt?.getTime());
    expect(second.providerPaymentId).toBe('pay_spec_2'); // not overwritten by the "retry" delivery
    const paymentCount = await prisma.payment.count({ where: { orderId: order.id } });
    expect(paymentCount).toBe(1);
  });

  it('markPaymentFailed records the reason and leaves the order retryable', async () => {
    const { order } = await createPendingOrder('order_spec_failed_1');

    await markPaymentFailed('order_spec_failed_1', 'Insufficient funds in the account.');

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true } });
    expect(updated.status).toBe('PENDING_PAYMENT');
    expect(updated.items[0].itemStatus).toBe('PENDING');
    expect(updated.payments[0].status).toBe('FAILED');
    expect(updated.payments[0].failureReason).toBe('Insufficient funds in the account.');
  });

  it('markPaymentFailed is a no-op once already captured', async () => {
    const { order } = await createPendingOrder('order_spec_captured_then_failed');
    await markPaymentCaptured('order_spec_captured_then_failed', 'pay_spec_3', null);

    await markPaymentFailed('order_spec_captured_then_failed', 'late failure webhook');

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.payments[0].status).toBe('CAPTURED');
    expect(updated.payments[0].failureReason).toBeNull();
  });
});
