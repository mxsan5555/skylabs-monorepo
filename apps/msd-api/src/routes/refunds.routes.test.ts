import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-level wiring tests: permission gates + audit wiring. Refund arithmetic/idempotency is
// exhaustively covered by refund.service.test.ts — mock the service module directly here.
vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
  isSuperAdminRoleSet: vi.fn(),
}));

const createRefundMock = vi.fn();
const listRefundsForOrderItemMock = vi.fn();
vi.mock('../services/refund.service', () => ({
  createRefund: (...args: unknown[]) => createRefundMock(...args),
  listRefundsForOrderItem: (...args: unknown[]) => listRefundsForOrderItemMock(...args),
}));

import app from '../app';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);

const ADMIN_ID = '50000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '50000000-0000-4000-8000-000000000002';
const ORDER_ITEM_ID = '50000000-0000-4000-8000-000000000003';
const REFUND_ID = '50000000-0000-4000-8000-000000000004';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/refunds', () => {
  it('401s with no token', async () => {
    const res = await request(app)
      .post('/api/v1/refunds')
      .send({ orderItemId: ORDER_ITEM_ID, amount: 100, type: 'FULL' });
    expect(res.status).toBe(401);
  });

  it('403s a customer — refund creation is admin-only', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ orderItemId: ORDER_ITEM_ID, amount: 100, type: 'FULL' });
    expect(res.status).toBe(403);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('403s an admin holding only accounts.refunds-disputes:view (missing approve)', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:view']);
    const res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ orderItemId: ORDER_ITEM_ID, amount: 100, type: 'FULL' });
    expect(res.status).toBe(403);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('201s and audit-logs for an admin holding approve', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:approve']);
    createRefundMock.mockResolvedValue({ id: REFUND_ID, status: 'REQUESTED', amount: 100 });

    const res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ orderItemId: ORDER_ITEM_ID, amount: 100, type: 'FULL' });

    expect(res.status).toBe(201);
    expect(createRefundMock).toHaveBeenCalledWith(ADMIN_ID, expect.objectContaining({ orderItemId: ORDER_ITEM_ID, amount: 100, type: 'FULL' }));
  });

  it('422s a negative/zero amount before reaching the service', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:approve']);
    const res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ orderItemId: ORDER_ITEM_ID, amount: 0, type: 'FULL' });
    expect(res.status).toBe(422);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it('422s an invalid type enum value', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:approve']);
    const res = await request(app)
      .post('/api/v1/refunds')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ orderItemId: ORDER_ITEM_ID, amount: 100, type: 'SOMETHING_ELSE' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/refunds/order-item/:id', () => {
  it('403s without accounts.refunds-disputes:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get(`/api/v1/refunds/order-item/${ORDER_ITEM_ID}`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('200s with accounts.refunds-disputes:view', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:view']);
    listRefundsForOrderItemMock.mockResolvedValue([]);
    const res = await request(app)
      .get(`/api/v1/refunds/order-item/${ORDER_ITEM_ID}`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(listRefundsForOrderItemMock).toHaveBeenCalledWith(ORDER_ITEM_ID);
  });
});
