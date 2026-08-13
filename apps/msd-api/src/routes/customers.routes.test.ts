import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);
const resolveMock = vi.mocked(resolveGrantedPermissionKeys);

const CUSTOMER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'b0b0b0b0-0000-4000-8000-000000000002';

const customerFixture = {
  id: CUSTOMER_ID,
  name: 'Priya Sharma',
  phone: '+919810099999',
  email: 'priya@example.com',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  _count: { orders: 3, bookings: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveMock.mockResolvedValue(['customers:view']);
});

describe('GET /api/v1/customers', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/customers');
    expect(res.status).toBe(401);
  });

  it('returns 403 without customers:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('lists customers with order/booking counts, scoped to the customer role', async () => {
    prismaMock.user.findMany.mockResolvedValue([customerFixture]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._count).toEqual({ orders: 3, bookings: 2 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ roles: { some: { role: { key: 'customer' } } } }),
      }),
    );
  });

  it('never leaks a password/OTP/token field — select allow-list only', async () => {
    prismaMock.user.findMany.mockResolvedValue([customerFixture]);
    prismaMock.user.count.mockResolvedValue(1);
    await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.select).toEqual({
      id: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      createdAt: true,
      _count: { select: { orders: true, bookings: true } },
    });
  });

  it('applies search across name/phone/email', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    await request(app)
      .get('/api/v1/customers?search=priya')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { name: { contains: 'priya', mode: 'insensitive' } },
      { phone: { contains: 'priya', mode: 'insensitive' } },
      { email: { contains: 'priya', mode: 'insensitive' } },
    ]);
  });
});

describe('GET /api/v1/customers/:id', () => {
  it('returns 404 for a user that exists but does not hold the customer role', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/customers/${OTHER_USER_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(404);
  });

  it('returns the customer with order/booking counts', async () => {
    prismaMock.user.findFirst.mockResolvedValue(customerFixture);
    const res = await request(app)
      .get(`/api/v1/customers/${CUSTOMER_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Priya Sharma');
    expect(res.body.data._count).toEqual({ orders: 3, bookings: 2 });
  });
});
