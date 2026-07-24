import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma-client';

let server: import('node:http').Server;
let baseUrl: string;
let userToken: string;
let dealId: string;
let companyId: string;
let pricingPlanId: string;
let locationId: string;
let testUserId: string;

const TEST_USER_EMAIL = 'test-reviews-spec@example.com';

async function api(method: string, path: string, body?: unknown, token = userToken) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as Record<string, unknown> };
}

async function createOrderItem(itemStatus: 'PENDING' | 'REDEEMED') {
  const order = await prisma.order.create({
    data: {
      orderNumber: `TESTREVIEW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
            bookingDate: '2026-08-01',
            bookingTime: '10:00',
            voucherCode: `TESTREVIEW-${Math.random().toString(36).slice(2, 10)}`,
            itemStatus,
          },
        ],
      },
    },
    include: { items: true },
  });
  return order.items[0];
}

beforeAll(async () => {
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: 'd-01' },
    include: { pricingPlans: true, locationLinks: true },
  });
  dealId = deal.id;
  companyId = deal.companyId;
  pricingPlanId = deal.pricingPlans[0].id;
  locationId = deal.locationLinks[0].locationId;

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'Test Reviews Spec', roles: ['USER'] },
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
  await prisma.deal.update({ where: { id: dealId }, data: { ratingAvg: 0, ratingCount: 0 } });
  await prisma.company.update({ where: { id: companyId }, data: { ratingAvg: 0, ratingCount: 0 } });
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

afterEach(async () => {
  await prisma.review.deleteMany({ where: { userId: testUserId } });
  await prisma.order.deleteMany({ where: { userId: testUserId } });
});

describe('POST /me/reviews', () => {
  it('rejects a review for an item that has not been redeemed', async () => {
    const item = await createOrderItem('PENDING');
    const res = await api('POST', '/me/reviews', { orderItemId: item.id, rating: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REVIEW_NOT_ELIGIBLE');
  });

  it('creates a review for a redeemed item and updates the deal rating rollup', async () => {
    const item = await createOrderItem('REDEEMED');
    const res = await api('POST', '/me/reviews', { orderItemId: item.id, rating: 4, title: 'Nice', body: 'Good experience' });

    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(4);

    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(Number(deal.ratingAvg)).toBe(4);
    expect(deal.ratingCount).toBe(1);
  });

  it('rejects a second review for the same order item', async () => {
    const item = await createOrderItem('REDEEMED');
    await api('POST', '/me/reviews', { orderItemId: item.id, rating: 5 });

    const res = await api('POST', '/me/reviews', { orderItemId: item.id, rating: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REVIEW_ALREADY_EXISTS');
  });

  it('rejects an unauthenticated request', async () => {
    const item = await createOrderItem('REDEEMED');
    const res = await api('POST', '/me/reviews', { orderItemId: item.id, rating: 5 }, '');
    expect(res.status).toBe(401);
  });
});

describe('GET /deals/:slug/reviews', () => {
  it('lists only published reviews with a rating breakdown', async () => {
    const item = await createOrderItem('REDEEMED');
    await api('POST', '/me/reviews', { orderItemId: item.id, rating: 5 });

    const res = await fetch(`${baseUrl}/api/deals/serenity-spa-summer-glow/reviews`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.breakdown['5']).toBeGreaterThan(0);
  });
});
