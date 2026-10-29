import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route + service integration tests: real Express app, real requirePermission/requireSuperAdmin/
// settlement.service logic — only the Prisma boundary and the permission resolver are mocked,
// mirroring rbac.routes.test.ts's convention.
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
import { resolveGrantedPermissionKeys, isSuperAdminRoleSet } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const isSuperAdminMock = vi.mocked(isSuperAdminRoleSet);
const prismaMock = vi.mocked(prisma, true);

const ADMIN_USER_ID = '10000000-0000-4000-8000-000000000001';
const SUPERADMIN_USER_ID = '10000000-0000-4000-8000-000000000002';
const VENDOR_OWNER_USER_ID = '10000000-0000-4000-8000-000000000003';
const VENDOR_ID = '10000000-0000-4000-8000-000000000004';
const OTHER_VENDOR_ID = '10000000-0000-4000-8000-000000000005';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: `requireSuperAdmin` — the one documented, spec-mandated exception where a role flag
 * (not a permission) gates a route, stacked AFTER requirePermission on the same route.
 * Scenario: an `admin` role granted `accounts.member-settlements:approve` through the Role
 * Permission Matrix UI must STILL be refused — the permission alone is never sufficient for
 * releasing a member payout; only a live `Role.isSuperAdmin` flag is.
 */
describe('POST /api/v1/settlements/members/:vendorId/payouts — requireSuperAdmin', () => {
  it('403s an admin holding accounts.member-settlements:approve but NOT flagged isSuperAdmin', async () => {
    resolveMock.mockResolvedValue(['accounts.member-settlements:approve']);
    isSuperAdminMock.mockResolvedValue(false);

    const res = await request(app)
      .post(`/api/v1/settlements/members/${VENDOR_ID}/payouts`)
      .set('Authorization', bearerFor({ sub: ADMIN_USER_ID, roles: ['admin'] }))
      .send({ entitlementIds: ['20000000-0000-4000-8000-000000000001'] });

    expect(res.status).toBe(403);
    expect(prismaMock.memberPayout.create).not.toHaveBeenCalled();
  });

  it('403s outright (never reaches requireSuperAdmin) when the caller lacks the approve permission at all, even if somehow flagged isSuperAdmin', async () => {
    resolveMock.mockResolvedValue([]); // no accounts.member-settlements:approve
    isSuperAdminMock.mockResolvedValue(true);

    const res = await request(app)
      .post(`/api/v1/settlements/members/${VENDOR_ID}/payouts`)
      .set('Authorization', bearerFor({ sub: SUPERADMIN_USER_ID, roles: ['super_admin'] }))
      .send({ entitlementIds: ['20000000-0000-4000-8000-000000000001'] });

    expect(res.status).toBe(403);
  });

  it('passes BOTH gates for a super_admin holding the approve permission, reaching the service layer', async () => {
    resolveMock.mockResolvedValue(['accounts.member-settlements:approve']);
    isSuperAdminMock.mockResolvedValue(true);
    prismaMock.memberPayout.findUnique.mockResolvedValue(null);
    prismaMock.member.findUnique.mockResolvedValue(null); // vendor lookup fails downstream — proves the gates were passed, not faked

    const res = await request(app)
      .post(`/api/v1/settlements/members/${VENDOR_ID}/payouts`)
      .set('Authorization', bearerFor({ sub: SUPERADMIN_USER_ID, roles: ['super_admin'] }))
      .send({ entitlementIds: ['20000000-0000-4000-8000-000000000001'] });

    // 404 (vendor not found) proves the request reached recordMemberPayout — i.e. BOTH
    // requirePermission AND requireSuperAdmin let it through.
    expect(res.status).toBe(404);
  });

  it('401s with no token', async () => {
    const res = await request(app)
      .post(`/api/v1/settlements/members/${VENDOR_ID}/payouts`)
      .send({ entitlementIds: ['20000000-0000-4000-8000-000000000001'] });
    expect(res.status).toBe(401);
  });
});

/**
 * Feature: `GET /settlements/members/:vendorId` ownership widening
 * Scenario: an admin/super_admin holding `accounts.member-settlements:view` may fetch ANY
 * vendor's detail; a `vendor` role holding only `vendor-portal.payments:view` may fetch ONLY
 * their own vendorId (resolved via `getVendorByOwnerUserId`) — any other vendorId 403s.
 */
describe('GET /api/v1/settlements/members/:vendorId — ownership', () => {
  function armDetail() {
    prismaMock.member.findUnique.mockResolvedValue({
      id: VENDOR_ID,
      businessName: 'ABC Spa',
      bankAccountHolder: null,
      bankName: null,
      bankAccountNumber: null,
      bankIfsc: null,
      upiId: null,
    } as never);
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);
    prismaMock.memberPayout.findMany.mockResolvedValue([]);
  }

  it('an admin holding accounts.member-settlements:view may fetch ANY vendor', async () => {
    resolveMock.mockResolvedValue(['accounts.member-settlements:view']);
    armDetail();

    const res = await request(app)
      .get(`/api/v1/settlements/members/${VENDOR_ID}`)
      .set('Authorization', bearerFor({ sub: ADMIN_USER_ID, roles: ['admin'] }));

    expect(res.status).toBe(200);
  });

  it("a vendor holding only vendor-portal.payments:view may fetch their OWN vendorId", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.payments:view']);
    prismaMock.member.findUnique.mockImplementation((args: unknown) => {
      const where = (args as { where?: { ownerUserId?: string; id?: string } }).where;
      if (where?.ownerUserId === VENDOR_OWNER_USER_ID) return Promise.resolve({ id: VENDOR_ID } as never);
      if (where?.id === VENDOR_ID) {
        return Promise.resolve({
          id: VENDOR_ID, businessName: 'ABC Spa', bankAccountHolder: null, bankName: null, bankAccountNumber: null, bankIfsc: null, upiId: null,
        } as never);
      }
      return Promise.resolve(null as never);
    });
    prismaMock.purchaseEntitlement.findMany.mockResolvedValue([]);
    prismaMock.memberPayout.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/settlements/members/${VENDOR_ID}`)
      .set('Authorization', bearerFor({ sub: VENDOR_OWNER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
  });

  it("403s a vendor holding only vendor-portal.payments:view requesting a DIFFERENT vendor's data", async () => {
    resolveMock.mockResolvedValue(['vendor-portal.payments:view']);
    prismaMock.member.findUnique.mockImplementation((args: unknown) => {
      const where = (args as { where?: { ownerUserId?: string } }).where;
      if (where?.ownerUserId === VENDOR_OWNER_USER_ID) return Promise.resolve({ id: VENDOR_ID } as never); // caller owns VENDOR_ID, not OTHER_VENDOR_ID
      return Promise.resolve(null as never);
    });

    const res = await request(app)
      .get(`/api/v1/settlements/members/${OTHER_VENDOR_ID}`)
      .set('Authorization', bearerFor({ sub: VENDOR_OWNER_USER_ID, roles: ['vendor'] }));

    expect(res.status).toBe(403);
  });

  it('403s a caller with neither permission', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get(`/api/v1/settlements/members/${VENDOR_ID}`)
      .set('Authorization', bearerFor({ sub: VENDOR_OWNER_USER_ID, roles: ['customer'] }));
    expect(res.status).toBe(403);
  });
});

/**
 * Feature: `GET /settlements/members?status=ready` — the Accounts Overview "Review Payouts"
 * deep link's optional pre-filter, additive to the existing page/pageSize/search params.
 */
describe('GET /api/v1/settlements/members?status=ready', () => {
  it('403s without accounts.member-settlements:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/settlements/members?status=ready')
      .set('Authorization', bearerFor({ sub: ADMIN_USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('200s and forwards status=ready through to the service', async () => {
    resolveMock.mockResolvedValue(['accounts.member-settlements:view']);
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.branch.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/settlements/members?status=ready')
      .set('Authorization', bearerFor({ sub: ADMIN_USER_ID, roles: ['admin'] }));

    expect(res.status).toBe(200);
    // status=ready computes aggregates for every matching vendor up front rather than
    // paginating the vendor table — vendor.count is never called on this path (see
    // settlement.service.test.ts for the full behavior, exercised here only at the route level).
    expect(prismaMock.member.count).not.toHaveBeenCalled();
  });

  it('rejects an invalid status value', async () => {
    resolveMock.mockResolvedValue(['accounts.member-settlements:view']);
    const res = await request(app)
      .get('/api/v1/settlements/members?status=bogus')
      .set('Authorization', bearerFor({ sub: ADMIN_USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(422);
  });
});
