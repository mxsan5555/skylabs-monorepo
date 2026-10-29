import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-level wiring tests: permission gates, the resolutionType->approve/reject dynamic
// permission resolution, audit wiring. Service correctness (ownership, state transitions,
// preDisputeStatus restore) is already exhaustively covered by dispute.service.test.ts — mock
// the service module directly here, same convention as customers.routes.test.ts.
vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
  isSuperAdminRoleSet: vi.fn(),
}));

const raiseDisputeMock = vi.fn();
const listDisputesMock = vi.fn();
const getDisputeOrThrowMock = vi.fn();
const markDisputeUnderReviewMock = vi.fn();
const resolveDisputeMock = vi.fn();
vi.mock('../services/dispute.service', () => ({
  raiseDispute: (...args: unknown[]) => raiseDisputeMock(...args),
  listDisputes: (...args: unknown[]) => listDisputesMock(...args),
  getDisputeOrThrow: (...args: unknown[]) => getDisputeOrThrowMock(...args),
  markDisputeUnderReview: (...args: unknown[]) => markDisputeUnderReviewMock(...args),
  resolveDispute: (...args: unknown[]) => resolveDisputeMock(...args),
}));

import app from '../app';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);

const CUSTOMER_ID = '40000000-0000-4000-8000-000000000001';
const ADMIN_ID = '40000000-0000-4000-8000-000000000002';
const ENTITLEMENT_ID = '40000000-0000-4000-8000-000000000003';
const DISPUTE_ID = '40000000-0000-4000-8000-000000000004';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/disputes — customer self-service', () => {
  it('401s with no token', async () => {
    const res = await request(app).post('/api/v1/disputes').send({ entitlementId: ENTITLEMENT_ID, reason: 'bad service' });
    expect(res.status).toBe(401);
  });

  it('any authenticated customer may raise one — ownership is checked inside the service, not a route gate', async () => {
    raiseDisputeMock.mockResolvedValue({ id: DISPUTE_ID, status: 'OPEN' });

    const res = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ entitlementId: ENTITLEMENT_ID, reason: 'service not as described' });

    expect(res.status).toBe(201);
    expect(raiseDisputeMock).toHaveBeenCalledWith(CUSTOMER_ID, expect.objectContaining({ entitlementId: ENTITLEMENT_ID }));
  });

  it("422s a body missing the required reason field", async () => {
    const res = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ entitlementId: ENTITLEMENT_ID });

    expect(res.status).toBe(422);
    expect(raiseDisputeMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/disputes — admin review gate', () => {
  it('403s a customer', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/disputes')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(403);
  });

  it('200s an admin holding accounts.refunds-disputes:view', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:view']);
    listDisputesMock.mockResolvedValue({ items: [], total: 0 });

    const res = await request(app)
      .get('/api/v1/disputes')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/disputes/:id/resolve — resolutionType-dependent permission', () => {
  it('403s resolutionType: REFUNDED for an admin holding only reject (not approve)', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:reject']);

    const res = await request(app)
      .post(`/api/v1/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ resolutionType: 'REFUNDED' });

    expect(res.status).toBe(403);
    expect(resolveDisputeMock).not.toHaveBeenCalled();
  });

  it('200s resolutionType: REFUNDED for an admin holding approve', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:approve']);
    resolveDisputeMock.mockResolvedValue({ id: DISPUTE_ID, status: 'RESOLVED', resolutionType: 'REFUNDED' });

    const res = await request(app)
      .post(`/api/v1/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ resolutionType: 'REFUNDED' });

    expect(res.status).toBe(200);
    expect(resolveDisputeMock).toHaveBeenCalledWith(ADMIN_ID, DISPUTE_ID, expect.objectContaining({ resolutionType: 'REFUNDED' }));
  });

  it('403s resolutionType: NO_ACTION for an admin holding only approve (not reject)', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:approve']);

    const res = await request(app)
      .post(`/api/v1/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ resolutionType: 'NO_ACTION' });

    expect(res.status).toBe(403);
    expect(resolveDisputeMock).not.toHaveBeenCalled();
  });

  it('200s resolutionType: NO_ACTION for an admin holding reject', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:reject']);
    resolveDisputeMock.mockResolvedValue({ id: DISPUTE_ID, status: 'RESOLVED', resolutionType: 'NO_ACTION' });

    const res = await request(app)
      .post(`/api/v1/disputes/${DISPUTE_ID}/resolve`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ resolutionType: 'NO_ACTION' });

    expect(res.status).toBe(200);
  });

  it('401s with no token at all, before the dynamic permission check runs', async () => {
    const res = await request(app)
      .post(`/api/v1/disputes/${DISPUTE_ID}/resolve`)
      .send({ resolutionType: 'REFUNDED' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/disputes/:id/status', () => {
  it('403s a caller without status_change', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:view']);
    const res = await request(app)
      .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('200s and audit-logs a caller with status_change', async () => {
    resolveMock.mockResolvedValue(['accounts.refunds-disputes:status_change']);
    markDisputeUnderReviewMock.mockResolvedValue({ id: DISPUTE_ID, status: 'UNDER_REVIEW' });

    const res = await request(app)
      .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(markDisputeUnderReviewMock).toHaveBeenCalledWith(DISPUTE_ID);
  });
});
