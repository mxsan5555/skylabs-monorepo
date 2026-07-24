import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

import { createApp } from '../../app';
import { prisma } from '../../lib/prisma-client';

let server: import('node:http').Server;
let baseUrl: string;
let guestToken: string | undefined;

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(guestToken ? { 'X-Guest-Token': guestToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (json.guestToken) guestToken = json.guestToken;
  return { status: res.status, body: json as Record<string, unknown> };
}

beforeAll(async () => {
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
  if (guestToken) {
    await prisma.cart.deleteMany({ where: { guestToken } });
    guestToken = undefined;
  }
});

describe('gift card application in cart totals', () => {
  it('applies the gift card balance up to the cart subtotal, capping at zero payable', async () => {
    const giftCard = await prisma.giftCard.create({
      data: { code: `TESTGC-${Date.now()}`, initialBalanceAmount: 1_000_000, balanceAmount: 1_000_000, status: 'ACTIVE' },
    });

    await api('POST', '/cart/items', { dealId: 'd-01', quantity: 1 });
    const applied = await api('POST', '/cart/gift-card', { code: giftCard.code });

    expect(applied.status).toBe(200);
    const payable = (applied.body.payable as { amount: number }).amount;
    expect(payable).toBe(0); // gift card balance (₹10,000) exceeds the deal price

    await prisma.giftCard.delete({ where: { id: giftCard.id } });
  });

  it('applies only a partial amount when the gift card balance is smaller than the subtotal', async () => {
    const giftCard = await prisma.giftCard.create({
      data: { code: `TESTGC-${Date.now()}`, initialBalanceAmount: 10000, balanceAmount: 10000, status: 'ACTIVE' },
    });

    const cart = await api('POST', '/cart/items', { dealId: 'd-01', quantity: 1 });
    const subtotal = (cart.body.subtotal as { amount: number }).amount;
    const applied = await api('POST', '/cart/gift-card', { code: giftCard.code });

    const giftCardApplied = (applied.body.giftCardApplied as { amount: number }).amount;
    const payable = (applied.body.payable as { amount: number }).amount;
    expect(giftCardApplied).toBe(10000);
    expect(payable).toBe(subtotal - 10000);

    await prisma.giftCard.delete({ where: { id: giftCard.id } });
  });

  it('rejects an invalid/unknown gift card code', async () => {
    await api('POST', '/cart/items', { dealId: 'd-01', quantity: 1 });
    const res = await api('POST', '/cart/gift-card', { code: 'NOT-A-REAL-CODE' });
    expect(res.status).toBe(409);
  });

  it('removing the gift card restores the full payable amount', async () => {
    const giftCard = await prisma.giftCard.create({
      data: { code: `TESTGC-${Date.now()}`, initialBalanceAmount: 10000, balanceAmount: 10000, status: 'ACTIVE' },
    });
    const cart = await api('POST', '/cart/items', { dealId: 'd-01', quantity: 1 });
    const subtotal = (cart.body.subtotal as { amount: number }).amount;
    await api('POST', '/cart/gift-card', { code: giftCard.code });

    const removed = await api('DELETE', '/cart/gift-card');
    expect((removed.body.payable as { amount: number }).amount).toBe(subtotal);
    expect(removed.body.giftCardCode).toBeNull();

    await prisma.giftCard.delete({ where: { id: giftCard.id } });
  });
});
