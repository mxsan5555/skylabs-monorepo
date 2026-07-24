import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma-client';

let server: import('node:http').Server;
let baseUrl: string;
let userToken: string;
let testUserId: string;

const TEST_USER_EMAIL = 'test-wishlist-spec@example.com';

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json as Record<string, unknown> };
}

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'Test Wishlist Spec', roles: ['USER'] },
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
  await prisma.wishlistItem.deleteMany({ where: { userId: testUserId } });
});

describe('wishlist', () => {
  it('adding the same deal twice via PUT is idempotent (no duplicate rows)', async () => {
    await api('PUT', '/me/wishlist/d-01');
    const res = await api('PUT', '/me/wishlist/d-01');
    expect(res.status).toBe(204);

    const count = await prisma.wishlistItem.count({ where: { userId: testUserId, dealId: 'd-01' } });
    expect(count).toBe(1);
  });

  it('GET returns hydrated deal cards for wishlisted items', async () => {
    await api('PUT', '/me/wishlist/d-01');
    const res = await api('GET', '/me/wishlist');
    expect(res.status).toBe(200);
    const items = res.body.items as { id: string; title: string }[];
    expect(items.some((i) => i.id === 'd-01')).toBe(true);
  });

  it('DELETE removes the item', async () => {
    await api('PUT', '/me/wishlist/d-01');
    await api('DELETE', '/me/wishlist/d-01');
    const count = await prisma.wishlistItem.count({ where: { userId: testUserId, dealId: 'd-01' } });
    expect(count).toBe(0);
  });

  it('sync merges a batch of localStorage ids without duplicating existing ones', async () => {
    await api('PUT', '/me/wishlist/d-01');
    const res = await api('POST', '/me/wishlist/sync', { dealIds: ['d-01', 'd-02'] });

    expect(res.status).toBe(200);
    const count = await prisma.wishlistItem.count({ where: { userId: testUserId } });
    expect(count).toBe(2);
  });
});
