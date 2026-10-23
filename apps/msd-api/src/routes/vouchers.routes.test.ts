import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route + service integration tests: real Express app, real requirePermission/voucher.service
// logic — only the Prisma boundary and the permission resolver are mocked, mirroring
// settlements.routes.test.ts's convention. The point of these is the HTTP-level security
// boundary (permission gate + member/branch isolation reaching the right service call), not
// re-proving voucher.service.test.ts's exhaustive state-machine coverage.
vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
  isSuperAdminRoleSet: vi.fn(),
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const prismaMock = vi.mocked(prisma, true);

const MEMBER_USER_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_MEMBER_USER_ID = '30000000-0000-4000-8000-000000000002';
const VENDOR_ID = '30000000-0000-4000-8000-000000000003';
const OTHER_VENDOR_ID = '30000000-0000-4000-8000-000000000004';
const ENTITLEMENT_ID = '30000000-0000-4000-8000-000000000005';
const VOUCHER_CODE = 'MSD-DL-7K9P4X';

beforeEach(() => {
  vi.clearAllMocks();
});

function entitlementFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITLEMENT_ID,
    voucherCode: VOUCHER_CODE,
    vendorId: VENDOR_ID,
    entitlementStatus: 'ACTIVE',
    settlementStatus: 'PENDING_FULFILMENT',
    fulfilmentKind: 'SERVICE_SESSION',
    customer: { id: 'cust-1', name: 'Jane', phone: '+919999999999', email: null },
    orderItem: { order: { id: '30000000-0000-4000-8000-000000000006', status: 'CONFIRMED' }, itemName: 'Deep Tissue Massage' },
    branch: { name: 'MG Road' },
    grossAmount: '1000.00',
    memberShareAmount: '800.00',
    adjustments: [],
    ...overrides,
  };
}

describe('POST /api/v1/vouchers/verify — permission gate', () => {
  it('401s with no token', async () => {
    const res = await request(app).post('/api/v1/vouchers/verify').send({ code: VOUCHER_CODE });
    expect(res.status).toBe(401);
  });

  it("403s a member holding only vendor-portal.orders:view (missing the :custom action)", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:view']);

    const res = await request(app)
      .post('/api/v1/vouchers/verify')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }))
      .send({ code: VOUCHER_CODE });

    expect(res.status).toBe(403);
    expect(prismaMock.purchaseEntitlement.findUnique).not.toHaveBeenCalled();
  });

  it('403s a customer role outright — the whole router is member-only', async () => {
    resolveMock.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/vouchers/verify')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['customer'] }))
      .send({ code: VOUCHER_CODE });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/vouchers/verify — member/branch isolation reaches the real service', () => {
  it("returns VALID when the caller's own vendor owns the voucher", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);

    const res = await request(app)
      .post('/api/v1/vouchers/verify')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }))
      .send({ code: VOUCHER_CODE });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('VALID');
  });

  it("returns WRONG_MEMBER_BRANCH (200, not 403) when a DIFFERENT member's own vendor looks up someone else's voucher — isolation is a result, not a gate rejection", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ vendorId: VENDOR_ID }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    const res = await request(app)
      .post('/api/v1/vouchers/verify')
      .set('Authorization', bearerFor({ sub: OTHER_MEMBER_USER_ID, roles: ['vendor'] }))
      .send({ code: VOUCHER_CODE });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('WRONG_MEMBER_BRANCH');
  });

  it('404s outright for an unknown voucher code — never confirms non-existence as a result value', async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/vouchers/verify')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }))
      .send({ code: 'MSD-DL-NOTREAL' });

    expect(res.status).toBe(404);
  });

  it('422s a malformed body (no code field) before ever touching the service', async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);

    const res = await request(app)
      .post('/api/v1/vouchers/verify')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }))
      .send({});

    expect(res.status).toBe(422);
    expect(prismaMock.purchaseEntitlement.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/vouchers/:code/start — ownership + audit', () => {
  it("403s (via the service's FORBIDDEN) when the voucher belongs to a different member, even though the caller passed the route-level permission gate", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture({ vendorId: VENDOR_ID }) as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);

    const res = await request(app)
      .post(`/api/v1/vouchers/${VOUCHER_CODE}/start`)
      .set('Authorization', bearerFor({ sub: OTHER_MEMBER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(403);
    expect(prismaMock.purchaseEntitlement.updateMany).not.toHaveBeenCalled();
  });

  it('writes an audit log entry on a successful Start Service', async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.purchaseEntitlement.findUnique.mockResolvedValue(entitlementFixture() as never);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.purchaseEntitlement.findUniqueOrThrow.mockResolvedValue(
      entitlementFixture({ entitlementStatus: 'STARTED' }) as never,
    );

    const res = await request(app)
      .post(`/api/v1/vouchers/${VOUCHER_CODE}/start`)
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'voucher.start', targetType: 'PurchaseEntitlement', targetId: ENTITLEMENT_ID }),
      }),
    );
  });
});

describe('GET /api/v1/vouchers/queue — Service Queue', () => {
  it('401s with no token', async () => {
    const res = await request(app).get('/api/v1/vouchers/queue');
    expect(res.status).toBe(401);
  });

  it("403s a member holding only vendor-portal.orders:view (missing the :custom action)", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:view']);

    const res = await request(app)
      .get('/api/v1/vouchers/queue')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(403);
    expect(prismaMock.purchaseEntitlement.count).not.toHaveBeenCalled();
  });

  it('404s when the caller has the permission but no vendor profile yet', async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.member.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/vouchers/queue')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(404);
  });

  it("returns only the caller's own vendor's rows, paginated, with meta.total", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.member.findUnique.mockResolvedValue({ id: VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([
      {
        id: ENTITLEMENT_ID,
        voucherCode: VOUCHER_CODE,
        entitlementStatus: 'ACTIVE',
        fulfilmentKind: 'SERVICE_SESSION',
        settlementStatus: 'PENDING_FULFILMENT',
        orderItem: { itemName: 'Deep Tissue Massage' },
        customer: { name: 'Jane' },
      },
    ] as never);

    const res = await request(app)
      .get('/api/v1/vouchers/queue')
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.data).toEqual([
      {
        id: ENTITLEMENT_ID,
        voucherCode: VOUCHER_CODE,
        itemName: 'Deep Tissue Massage',
        customerName: 'Jane',
        entitlementStatus: 'ACTIVE',
        fulfilmentKind: 'SERVICE_SESSION',
        settlementStatus: 'PENDING_FULFILMENT',
      },
    ]);
    expect(prismaMock.purchaseEntitlement.count).toHaveBeenCalledWith({
      where: { vendorId: VENDOR_ID, entitlementStatus: { in: ['ACTIVE', 'STARTED', 'OTP_REQUESTED'] } },
    });
  });

  it("a second member's own vendor never sees the first member's queue rows (isolation is in the query, not just the gate)", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);
    prismaMock.member.findUnique.mockResolvedValue({ id: OTHER_VENDOR_ID } as never);
    prismaMock.purchaseEntitlement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/vouchers/queue')
      .set('Authorization', bearerFor({ sub: OTHER_MEMBER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(prismaMock.purchaseEntitlement.count).toHaveBeenCalledWith({
      where: { vendorId: OTHER_VENDOR_ID, entitlementStatus: { in: ['ACTIVE', 'STARTED', 'OTP_REQUESTED'] } },
    });
  });
});

describe('POST /api/v1/vouchers/:code/complete — schema validation', () => {
  it('422s a missing/malformed otp before reaching the service', async () => {
    resolveMock.mockResolvedValue(['vendor-portal.orders:custom']);

    const res = await request(app)
      .post(`/api/v1/vouchers/${VOUCHER_CODE}/complete`)
      .set('Authorization', bearerFor({ sub: MEMBER_USER_ID, roles: ['vendor'] }))
      .send({});

    expect(res.status).toBe(422);
    expect(prismaMock.completionOtpChallenge.findFirst).not.toHaveBeenCalled();
  });
});
