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
  _count: { orders: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveMock.mockResolvedValue(['customers:view']);
  // customer.service.ts's loadOrderStats runs 3 groupBy queries per list/get call — default to
  // "no orders" so every pre-existing test here (none of which cares about these stats) doesn't
  // have to mock them individually.
  prismaMock.order.groupBy.mockResolvedValue([]);
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

  it('lists customers with order counts, scoped to the customer role', async () => {
    prismaMock.user.findMany.mockResolvedValue([customerFixture]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]._count).toEqual({ orders: 3 });
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
      _count: { select: { orders: true } },
    });
  });

  /**
   * Feature: Customer order-stats (Net Paid / Awaiting Payment / Last Order)
   * Scenario: these are real money figures computed from `Order.total`/`Order.status` via
   * batched `groupBy` queries (`loadOrderStats`), never a placeholder — and since an Order only
   * ever reaches CONFIRMED/COMPLETED via a verified payment (see msd-api's payment.service.ts),
   * "Net Paid" is exactly the sum of CONFIRMED+COMPLETED order totals, "Awaiting Payment" is the
   * sum of PENDING_PAYMENT order totals. There is no refund concept anywhere in this schema, so
   * no "completed refunds" figure is ever computed or returned.
   */
  it('attaches netPaid/awaitingPayment/lastOrderAt computed from Order groupBy queries', async () => {
    prismaMock.user.findMany.mockResolvedValue([customerFixture]);
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.order.groupBy
      .mockResolvedValueOnce([{ customerId: CUSTOMER_ID, _sum: { total: 1500 } }]) // paid
      .mockResolvedValueOnce([{ customerId: CUSTOMER_ID, _sum: { total: 400 } }]) // awaiting
      .mockResolvedValueOnce([{ customerId: CUSTOMER_ID, _max: { createdAt: new Date('2026-03-01T00:00:00.000Z') } }]); // last order

    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      netPaid: 1500,
      awaitingPayment: 400,
      lastOrderAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('defaults netPaid/awaitingPayment to 0 and lastOrderAt to null when the customer has no orders', async () => {
    prismaMock.user.findMany.mockResolvedValue([customerFixture]);
    prismaMock.user.count.mockResolvedValue(1);
    // beforeEach's default already resolves every groupBy call to [] (no rows).

    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.body.data[0]).toMatchObject({ netPaid: 0, awaitingPayment: 0, lastOrderAt: null });
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

describe('POST /api/v1/customers — Super Admin adding a customer directly (matrix: Customers = VC)', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/customers').send({ name: 'New Customer', phone: '9876543210' });
    expect(res.status).toBe(401);
  });

  it('returns 403 without customers:create (e.g. Admin, whose matrix cell is View-only)', async () => {
    resolveMock.mockResolvedValue(['customers:view']);
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'New Customer', phone: '9876543210' });
    expect(res.status).toBe(403);
  });

  it('creates a customer, normalizes the phone, and assigns the existing customer role as its single role', async () => {
    resolveMock.mockResolvedValue(['customers:create']);
    const customerRole = { id: 'role-customer', key: 'customer' };
    prismaMock.role.findUnique.mockResolvedValue(customerRole);
    prismaMock.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: CUSTOMER_ID, name: data.name, email: data.email, phone: data.phone, status: 'active', createdAt: new Date(), _count: { orders: 0 } }),
    );
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'super-admin-1', roles: ['super_admin'] }))
      .send({ name: 'New Customer', phone: '9876543210' });

    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '+919876543210', roles: { create: [{ roleId: 'role-customer' }] } }),
      }),
    );
  });

  it('returns 409 (not a raw 500) when the email/phone unique constraint is hit at the DB', async () => {
    resolveMock.mockResolvedValue(['customers:create']);
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'super-admin-1', roles: ['super_admin'] }))
      .send({ name: 'New Customer', email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });

  it('rejects a payload with neither email nor phone', async () => {
    resolveMock.mockResolvedValue(['customers:create']);
    prismaMock.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    const res = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', bearerFor({ sub: 'super-admin-1', roles: ['super_admin'] }))
      .send({ name: 'No Contact' });
    expect(res.status).toBe(422);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
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

  it('returns the customer with order counts', async () => {
    prismaMock.user.findFirst.mockResolvedValue(customerFixture);
    const res = await request(app)
      .get(`/api/v1/customers/${CUSTOMER_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Priya Sharma');
    expect(res.body.data._count).toEqual({ orders: 3 });
  });
});

/**
 * Feature: Customer status management (Active/Inactive/Suspended)
 * Scenario: `PATCH /api/v1/customers/:id/status` — a distinct permission
 * (`customers:status_change`) from the RBAC Users screen's `rbac.users:status_change`, scoped so
 * it can only ever reach a User holding the `customer` role (via `getCustomerOrThrow`), and
 * writes an audit log with before/after status.
 *
 * Given: a SuperAdmin/staff member with `customers:status_change` viewing a customer record
 * When: PATCH /:id/status is called with a new status
 * Then: the status persists (via the existing `user.service#setUserStatus`) and is reflected in
 *       the response; an audit log entry records the before/after status and the actor
 *
 * Edge cases:
 * - all 6 transition pairs (active<->inactive, active<->blocked, inactive<->blocked)
 * - an arbitrary/invalid status string is rejected by Zod (422), never reaches the service
 * - 403 without customers:status_change
 * - 403 for a caller who holds ONLY rbac.users:status_change (the two permissions are genuinely
 *   independent, never conflated)
 * - 404 when the target User exists but does not hold the `customer` role (getCustomerOrThrow's
 *   own scoping guard — confirms a staff/vendor-only account can never be reached this way)
 */
describe('PATCH /api/v1/customers/:id/status', () => {
  // setCustomerStatus's own sequence hits `prisma.user.findFirst` three times: getCustomerOrThrow
  // (before), setUserStatus's internal getUserOrThrow (also findFirst, not findUnique), then
  // getCustomerOrThrow again (after) — `prisma.user.findUnique` is a different call entirely,
  // used only by the unrelated `authenticate` middleware status re-check (defaulted by the shared
  // prisma-mock, see its own doc comment).
  function mockTransition(before: string, after: string) {
    prismaMock.user.findFirst
      .mockResolvedValueOnce({ ...customerFixture, status: before }) // getCustomerOrThrow (before)
      .mockResolvedValueOnce({ id: CUSTOMER_ID, status: before, roles: [] }) // setUserStatus -> getUserOrThrow
      .mockResolvedValueOnce({ ...customerFixture, status: after }); // getCustomerOrThrow (after)
    // setUserStatus's own prisma.user.update include:{roles:{include:{role:true}}} + serializeUser
    // needs a `roles` array on the returned row, even though setCustomerStatus never reads this
    // return value itself (it re-fetches via getCustomerOrThrow right after).
    prismaMock.user.update.mockResolvedValue({ ...customerFixture, status: after, roles: [] });
    prismaMock.auditLog.create.mockResolvedValue({});
  }

  it('returns 401 with no token', async () => {
    const res = await request(app).patch(`/api/v1/customers/${CUSTOMER_ID}/status`).send({ status: 'blocked' });
    expect(res.status).toBe(401);
  });

  it('returns 403 without customers:status_change', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'blocked' });
    expect(res.status).toBe(403);
  });

  it('returns 403 for a caller who holds ONLY rbac.users:status_change — the two permissions are independent', async () => {
    resolveMock.mockResolvedValue(['rbac.users:status_change', 'customers:view']);
    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'blocked' });
    expect(res.status).toBe(403);
  });

  it('returns 422 for an arbitrary/invalid status string, never reaching the service', async () => {
    resolveMock.mockResolvedValue(['customers:status_change']);
    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'not_a_real_status' });
    expect(res.status).toBe(422);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the target exists but does not hold the customer role', async () => {
    resolveMock.mockResolvedValue(['customers:status_change']);
    prismaMock.user.findFirst.mockResolvedValue(null); // getCustomerOrThrow's CUSTOMER_ROLE_FILTER excludes it
    const res = await request(app)
      .patch(`/api/v1/customers/${OTHER_USER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'blocked' });
    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['active', 'inactive'],
    ['inactive', 'active'],
    ['active', 'blocked'],
    ['blocked', 'active'],
    ['blocked', 'inactive'],
    ['inactive', 'blocked'],
  ])('transitions %s -> %s, persists it, and returns the updated status', async (before, after) => {
    resolveMock.mockResolvedValue(['customers:status_change']);
    mockTransition(before, after);

    const res = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: after });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(after);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CUSTOMER_ID }, data: { status: after } }),
    );
  });

  it('writes an audit log entry with the correct before/after status and actor', async () => {
    resolveMock.mockResolvedValue(['customers:status_change']);
    mockTransition('active', 'blocked');

    await request(app)
      .patch(`/api/v1/customers/${CUSTOMER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'blocked' });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'customer.status_change',
          targetType: 'User',
          targetId: CUSTOMER_ID,
          before: { status: 'active' },
          after: { status: 'blocked' },
        }),
      }),
    );
  });
});
