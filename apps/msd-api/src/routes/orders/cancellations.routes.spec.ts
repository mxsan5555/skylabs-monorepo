import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma-client';
import jwt from 'jsonwebtoken';

/** Integration test against the local dev Postgres DB, same as payments.service.spec.ts —
 *  exercises the full cancel → refund pipeline through the real HTTP route. */

let server: import('node:http').Server;
let baseUrl: string;
let userToken: string;
let dealId: string;
let pricingPlanId: string;
let locationId: string;

const TEST_USER_EMAIL = 'test-cancel-spec@example.com';
let testUserId: string;

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as Record<string, unknown> };
}

async function createOrderWithItem(bookingDate: string, itemStatus: 'PENDING' | 'CONFIRMED' | 'REDEEMED') {
  const order = await prisma.order.create({
    data: {
      orderNumber: `TESTCANCEL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: testUserId,
      contactName: 'Test',
      contactPhone: '+919800000000',
      contactEmail: 'test@example.com',
      subtotalAmount: 10000,
      payableAmount: 10000,
      status: 'CONFIRMED',
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
            bookingDate,
            bookingTime: '10:00',
            voucherCode: `TESTCANCEL-${Math.random().toString(36).slice(2, 10)}`,
            itemStatus,
          },
        ],
      },
    },
    include: { items: true },
  });
  return { order, item: order.items[0] };
}

beforeAll(async () => {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: 'd-01' },
    include: { pricingPlans: true, locationLinks: true },
  });
  dealId = deal.id;
  pricingPlanId = deal.pricingPlans[0].id;
  locationId = deal.locationLinks[0].locationId;

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'Test Cancel Spec', roles: ['USER'] },
  });
  testUserId = user.id;
  userToken = jwt.sign({ sub: user.id, roles: user.roles }, process.env.JWT_SECRET!, { expiresIn: '1h' });

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

afterEach(async () => {
  await prisma.order.deleteMany({ where: { userId: testUserId } });
});

describe('POST /me/order-items/:id/cancel', () => {
  it('grants a full refund and cancels the order when the booking is far in the future', async () => {
    const { order, item } = await createOrderWithItem('2027-01-01', 'CONFIRMED');

    const res = await api('POST', `/me/order-items/${item.id}/cancel`, { reason: 'CHANGE_OF_PLANS' });

    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('FULL_REFUND');

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, refunds: true } });
    expect(updatedOrder.items[0].itemStatus).toBe('CANCELLED');
    expect(updatedOrder.status).toBe('CANCELLED'); // only item on the order
    expect(updatedOrder.refunds).toHaveLength(1);
    expect(updatedOrder.refunds[0].amount).toBe(10000);
  });

  it('rejects a second cancellation request for the same item (already CANCELLED by the first)', async () => {
    const { item } = await createOrderWithItem('2027-01-01', 'CONFIRMED');
    await api('POST', `/me/order-items/${item.id}/cancel`, { reason: 'OTHER' });

    // The first cancel already flipped itemStatus to CANCELLED, so the sequential retry
    // hits the itemStatus guard — CANCELLATION_ALREADY_REQUESTED only matters as a race-
    // condition safety net for two concurrent requests, not this sequential case.
    const res = await api('POST', `/me/order-items/${item.id}/cancel`, { reason: 'OTHER' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ITEM_NOT_CANCELLABLE');
  });

  it('rejects cancelling an already-redeemed item', async () => {
    const { item } = await createOrderWithItem('2026-08-01', 'REDEEMED');
    const res = await api('POST', `/me/order-items/${item.id}/cancel`, { reason: 'OTHER' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ITEM_NOT_CANCELLABLE');
  });

  it("404s for another user's order item", async () => {
    const otherUser = await prisma.user.upsert({
      where: { email: 'other-cancel-spec@example.com' },
      update: {},
      create: { email: 'other-cancel-spec@example.com', name: 'Other', roles: ['USER'] },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `TESTCANCEL-OTHER-${Date.now()}`,
        userId: otherUser.id,
        contactName: 'Other',
        contactPhone: '+919800000001',
        contactEmail: 'other@example.com',
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
              bookingDate: '2027-01-01',
              bookingTime: '10:00',
              voucherCode: `TESTCANCEL-OTHER-${Math.random().toString(36).slice(2, 10)}`,
              itemStatus: 'CONFIRMED',
            },
          ],
        },
      },
      include: { items: true },
    });

    const res = await api('POST', `/me/order-items/${order.items[0].id}/cancel`, { reason: 'OTHER' });
    expect(res.status).toBe(404);

    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});
