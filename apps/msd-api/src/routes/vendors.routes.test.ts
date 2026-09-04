import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route + service integration tests: real Express app, real vendor.service/requirePermission/can
// logic — only the Prisma boundary and the (separately-tested) permission resolver are mocked,
// mirroring rbac.routes.test.ts's convention.
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

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const prismaMock = vi.mocked(prisma, true);

const USER_A_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const USER_B_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const VENDOR_A_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const VENDOR_B_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const BRANCH_A_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const BRANCH_B_ID = 'f0f0f0f0-0000-4000-8000-000000000006';
const DEAL_A_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const CATEGORY_ID = 'b1b1b1b1-0000-4000-8000-000000000008'; // top-level, type SERVICE
const OTHER_CATEGORY_ID = 'b2b2b2b2-0000-4000-8000-00000000000b'; // top-level, type SERVICE (different from CATEGORY_ID)
const PRODUCT_CATEGORY_ID = 'b3b3b3b3-0000-4000-8000-00000000000c'; // top-level, type PRODUCT
const PRODUCT_ID = 'd1d1d1d1-0000-4000-8000-00000000000a';

const vendorAFixture = {
  id: VENDOR_A_ID,
  ownerUserId: USER_A_ID,
  businessName: 'Vendor A Spa',
  status: 'ACTIVE',
  kycStatus: 'VERIFIED',
};

const branchAFixture = { id: BRANCH_A_ID, vendorId: VENDOR_A_ID, name: 'Branch A', isActive: true };
const branchBFixture = { id: BRANCH_B_ID, vendorId: VENDOR_B_ID, name: 'Branch B', isActive: true };
const dealAFixture = {
  id: DEAL_A_ID,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  categoryId: CATEGORY_ID,
  title: 'Deep tissue',
  status: 'DRAFT',
  approvalStatus: 'PENDING',
};
const serviceCategoryFixture = { id: CATEGORY_ID, name: 'Beauty', parentId: null, type: 'SERVICE' };
const productCategoryFixture = { id: PRODUCT_CATEGORY_ID, name: 'Beauty Products', parentId: null, type: 'PRODUCT' };
const productFixture = { id: PRODUCT_ID, vendorId: VENDOR_A_ID, name: 'Face Cream', categoryId: PRODUCT_CATEGORY_ID, subcategoryId: null };
const serviceGrantFixture = { id: 'grant-service', vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID };
const productGrantFixture = { id: 'grant-product', vendorId: VENDOR_A_ID, categoryId: PRODUCT_CATEGORY_ID };

const baseServiceDealBody = { categoryId: CATEGORY_ID, title: 'Haircut deal', slug: 'haircut-deal', originalPrice: '399.00', salePrice: '299.00' };
const baseProductDealBody = { categoryId: PRODUCT_CATEGORY_ID, title: 'Face Cream deal', slug: 'face-cream-deal', originalPrice: '399.00', salePrice: '299.00' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  // createDeal now also calls notifySuperAdmins for a vendor (non-admin) submission — harmless
  // default (zero superadmins to notify) for every test in this file that isn't specifically
  // asserting notification behavior (see the dedicated describe block below).
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe('GET /api/v1/vendors/me', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/vendors/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller lacks vendors:custom', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the caller has vendors:custom but no vendor profile yet', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });

  it("returns 200 with the caller's own vendor", async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(VENDOR_A_ID);
  });
});

describe('POST /api/v1/vendors/me', () => {
  it('returns 422 for a missing businessName', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .post('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({});
    expect(res.status).toBe(422);
  });

  it('creates a self-registered vendor owned by the caller', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ businessName: 'Vendor A Spa' });
    expect(res.status).toBe(201);
    expect(res.body.data.ownerUserId).toBe(USER_A_ID);
    expect(res.body.data.status).toBe('PROFILE_INCOMPLETE');
  });

  it('returns 409 when the caller already has a vendor profile', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .post('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ businessName: 'Vendor A Spa' });
    expect(res.status).toBe(409);
  });
});

describe('Security: vendor cross-tenant isolation', () => {
  it("403s when Vendor A's token tries to touch Vendor B's branch via /vendors/me/branches/:branchId", async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // branch actually belongs to vendor B
    const res = await request(app)
      .patch(`/api/v1/vendors/me/branches/${BRANCH_B_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ name: 'Hijacked name' });
    expect(res.status).toBe(403);
  });

  it("403s when Vendor A's token tries to touch Vendor B's deal via /vendors/me/branches/:branchId/deals/:dealId", async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);
    const res = await request(app)
      .patch(`/api/v1/vendors/me/branches/${BRANCH_B_ID}/deals/${DEAL_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ title: 'Hijacked title' });
    expect(res.status).toBe(403);
  });

  it('a vendor cannot activate its own deal before admin approval', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(dealAFixture); // approvalStatus: PENDING
    const res = await request(app)
      .patch(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}/status`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/vendors (admin)', () => {
  it('returns 403 without vendors:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the vendor list for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.vendor.findMany.mockResolvedValue([vendorAFixture]);
    prismaMock.vendor.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('a vendor-role token (vendors:custom only, no vendors:view) cannot list all vendors', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/vendors (admin create)', () => {
  it('creates a vendor and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Admin-created Vendor', gstNumber: '27AAAAA0000A1Z5', panNumber: 'AAAAA0000A' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_VERIFICATION'); // gst+pan present -> skip PROFILE_INCOMPLETE
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('generates a non-null, businessName-derived slug — never leaves it null', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(null); // no existing vendor owns this slug
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Urban Wellness Spa' });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('urban-wellness-spa');
  });

  it('disambiguates the slug when the plain businessName-derived slug is already taken', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValueOnce({ id: 'other-vendor', slug: 'urban-wellness-spa' });
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Urban Wellness Spa' });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toMatch(/^urban-wellness-spa-[a-f0-9]{6}$/);
  });

  it('returns the existing row instead of creating a duplicate when the same admin submitted the same businessName in the last 10s (rapid double-click, no ownerUserId set)', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    const recentVendor = { id: VENDOR_A_ID, businessName: 'Urban Wellness Spa', createdByUserId: 'admin-1', createdAt: new Date() };
    // .mockResolvedValueOnce (not a persistent .mockResolvedValue) — this mock must not leak
    // into later tests in this file via the outer `vi.clearAllMocks()`, which clears call
    // history but not a still-configured resolved value.
    prismaMock.vendor.findFirst.mockResolvedValueOnce(recentVendor);
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Urban Wellness Spa' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(VENDOR_A_ID);
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
    expect(prismaMock.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdByUserId: 'admin-1',
          businessName: 'Urban Wellness Spa',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe('Vendor <-> existing User linking', () => {
  const vendorRoleFixture = { id: 'vendor-role-id', key: 'vendor' };

  it('links a selected existing user as the vendor owner and grants them the vendor role', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_B_ID, status: 'active', deletedAt: null, roles: [] });
    prismaMock.vendor.findUnique.mockResolvedValue(null); // no existing vendor owns USER_B_ID yet
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
    prismaMock.role.findUnique.mockResolvedValue(vendorRoleFixture);
    prismaMock.userRole.upsert.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Linked Vendor', ownerUserId: USER_B_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.ownerUserId).toBe(USER_B_ID);
    expect(prismaMock.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: USER_B_ID, roleId: vendorRoleFixture.id } }),
    );
  });

  it("returns 409 when the selected user is already associated with a vendor", async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_B_ID, status: 'active', deletedAt: null });
    prismaMock.vendor.findUnique.mockResolvedValue({ id: 'some-other-vendor', ownerUserId: USER_B_ID });

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Linked Vendor', ownerUserId: USER_B_ID });

    expect(res.status).toBe(409);
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
  });

  it('returns 422 when the selected user is not active (blocked/inactive)', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_B_ID, status: 'blocked', deletedAt: null });

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Linked Vendor', ownerUserId: USER_B_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
  });

  it("editing a vendor's own unchanged ownerUserId doesn't false-positive as a conflict", async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendor.findUnique
      .mockResolvedValueOnce(vendorAFixture) // getVendorOrThrow at the top of updateVendor
      .mockResolvedValueOnce(vendorAFixture); // assertOwnerUserAvailable's own-vendor lookup, excluded via excludeVendorId
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_A_ID, status: 'active', deletedAt: null });
    prismaMock.vendor.update.mockResolvedValue(vendorAFixture);
    prismaMock.role.findUnique.mockResolvedValue(vendorRoleFixture);
    prismaMock.userRole.upsert.mockResolvedValue({});

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ownerUserId: USER_A_ID });

    expect(res.status).toBe(200);
  });
});

describe('Vendor mobile phone validation (canonical /^[6-9]\\d{9}$/ rule)', () => {
  it.each([
    ['98765abc10', 'letters mixed with digits'],
    ['123456789', 'only 9 digits'],
    ['12345678901', '11 digits'],
    ['5876543210', 'first digit not 6-9'],
  ])('rejects "%s" (%s)', async (badPhone) => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessPhone: badPhone });

    expect(res.status).toBe(422);
    expect(prismaMock.vendor.update).not.toHaveBeenCalled();
  });

  it('accepts a bare 10-digit number starting 6-9 and stores it +91-normalized', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendor.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...vendorAFixture, ...data }),
    );

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessPhone: '9876543210' });

    expect(res.status).toBe(200);
    expect(prismaMock.vendor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessPhone: '+919876543210' }) }),
    );
  });
});

describe('POST /api/v1/vendors/:vendorId/branches — latitude/longitude/pincode validation', () => {
  it('accepts valid latitude/longitude and persists them', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: BRANCH_A_ID, ...data }),
    );

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', latitude: 26.7606, longitude: 83.3732, pincode: '273001' });

    expect(res.status).toBe(201);
    expect(res.body.data.latitude).toBe(26.7606);
    expect(res.body.data.longitude).toBe(83.3732);
  });

  it.each([
    [{ latitude: 200 }, 'latitude above 90'],
    [{ latitude: -200 }, 'latitude below -90'],
    [{ longitude: 300 }, 'longitude above 180'],
    [{ longitude: -300 }, 'longitude below -180'],
    [{ pincode: '12345' }, 'a 5-digit pincode'],
    [{ pincode: 'abcdef' }, 'a non-numeric pincode'],
  ])('rejects %s (%s)', async (badField) => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', ...badField });

    expect(res.status).toBe(422);
    expect(prismaMock.branch.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/vendors/users/search', () => {
  it('returns 403 without vendors:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/vendors/users/search?q=vinay')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns matching users for an admin with vendors:create', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.user.findMany.mockResolvedValue([
      { id: USER_B_ID, name: 'Vinay Jaiswal', email: 'vinay@example.com', phone: '9999999999', status: 'active', roles: [] },
    ]);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/vendors/users/search?q=vinay')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Vinay Jaiswal');
  });

  it('also allows search for an admin who only holds vendors:edit (not create) — reachable while resuming a draft vendor in Step 1', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/vendors/users/search?q=vinay')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
  });

  it('filters server-side to active, not-already-linked users only — never trusts the frontend to exclude them', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    await request(app)
      .get('/api/v1/vendors/users/search?q=vinay')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', vendorProfile: null, deletedAt: null }),
      }),
    );
  });
});

describe('Admin onboarding pipeline — per-step saves', () => {
  it('Step 1 alone (ownerUserId only, no businessName) creates a draft vendor', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_B_ID, status: 'active', deletedAt: null });
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    prismaMock.role.findUnique.mockResolvedValue({ id: 'vendor-role-id', key: 'vendor' });
    prismaMock.userRole.upsert.mockResolvedValue({});
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, status: 'PROFILE_INCOMPLETE', ...data }),
    );

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ownerUserId: USER_B_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.businessName).toBeUndefined();
    expect(res.body.data.ownerUserId).toBe(USER_B_ID);
  });

  it("every admin Vendor response carries profileCompletion with a 'user' section reflecting ownerUserId", async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // has ownerUserId set
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    const userSection = res.body.data.profileCompletion.sections.find((s: { key: string }) => s.key === 'user');
    expect(userSection.complete).toBe(true);
  });

  it('self-registration still requires businessName (unlike the admin pipeline)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .post('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('Cross-vendor Branches/Deals sidebar lists', () => {
  it('GET /vendors/branches returns 403 for a vendor-role token (vendors:custom only)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .get('/api/v1/vendors/branches')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('GET /vendors/branches returns every branch with its vendor joined for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.branch.findMany.mockResolvedValue([{ ...branchAFixture, vendor: { id: VENDOR_A_ID, businessName: 'Vendor A Spa' } }]);
    prismaMock.branch.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors/branches')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].vendor.businessName).toBe('Vendor A Spa');
  });

  it('GET /vendors/deals returns 403 for a vendor-role token', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .get('/api/v1/vendors/deals')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('GET /vendors/deals returns every deal with vendor + branch joined for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.deal.findMany.mockResolvedValue([
      { ...dealAFixture, vendor: { id: VENDOR_A_ID, businessName: 'Vendor A Spa' }, branch: { id: BRANCH_A_ID, name: 'Branch A' } },
    ]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors/deals')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].vendor.businessName).toBe('Vendor A Spa');
    expect(res.body.data[0].branch.name).toBe('Branch A');
  });

  it('GET /vendors/therapists returns 403 for a vendor-role token', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .get('/api/v1/vendors/therapists')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('GET /vendors/therapists returns every therapist with vendor + branch joined for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.therapist.findMany.mockResolvedValue([
      {
        id: 'a2a2a2a2-0000-4000-8000-00000000000d',
        vendorId: VENDOR_A_ID,
        branchId: BRANCH_A_ID,
        therapistType: 'Massage Therapist',
        personName: 'Suresh Chandra',
        isActive: true,
        vendor: { id: VENDOR_A_ID, businessName: 'Vendor A Spa' },
        branch: { id: BRANCH_A_ID, name: 'Branch A' },
        _count: { packages: 3 },
      },
    ]);
    prismaMock.therapist.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors/therapists')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].vendor.businessName).toBe('Vendor A Spa');
    expect(res.body.data[0].branch.name).toBe('Branch A');
    expect(res.body.data[0]._count.packages).toBe(3);
  });
});

describe('PATCH /api/v1/vendors/:id/approve + /reject', () => {
  it('approve jumps the vendor straight to ACTIVE', async () => {
    resolveMock.mockResolvedValue(['vendors:approve']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendor.update.mockResolvedValue({ ...vendorAFixture, status: 'ACTIVE' });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/approve`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('reject requires a reason', async () => {
    resolveMock.mockResolvedValue(['vendors:reject']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/reject`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({});
    expect(res.status).toBe(422);
  });

  it('a vendor cannot approve or reject its own vendor profile', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const approveRes = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/approve`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(approveRes.status).toBe(403);

    const rejectRes = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/reject`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ reason: 'nope' });
    expect(rejectRes.status).toBe(403);
  });
});

describe('PATCH /api/v1/vendors/:id/kyc-review', () => {
  it('requires rejectionReason when rejecting KYC', async () => {
    resolveMock.mockResolvedValue(['vendors:approve']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/kyc-review`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ kycStatus: 'REJECTED' });
    expect(res.status).toBe(422);
  });

  it('verifies KYC without requiring a reason', async () => {
    resolveMock.mockResolvedValue(['vendors:approve']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendor.update.mockResolvedValue({ ...vendorAFixture, kycStatus: 'VERIFIED' });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/kyc-review`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ kycStatus: 'VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.kycStatus).toBe('VERIFIED');
  });
});

describe('Admin nested branch/deal approval', () => {
  it('approves a deal, jumping it straight to ACTIVE', async () => {
    resolveMock.mockResolvedValue(['vendors:approve']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
    prismaMock.deal.update.mockResolvedValue({ ...dealAFixture, approvalStatus: 'APPROVED', status: 'ACTIVE' });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}/approve`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.approvalStatus).toBe('APPROVED');
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('404s (not 500) when the branch does not exist under that vendor at all', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.branch.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(404);
  });

  it('403s when the branch exists but under a different vendor than the URL claims', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });
});

describe('Deal offering integration (direct category access)', () => {
  // A service deal now requires >=1 package (see DealCreateSchema's own refinement) — every
  // service-deal test body below includes one. `deal.findUniqueOrThrow` is what createDeal/
  // updateDeal actually return from (they read back inside the same $transaction after
  // create/update + package sync) — mock it per test to mirror whatever `deal.create`/
  // `deal.update` was mocked to return.
  const baseServicePackages = [{ durationMinutes: 30, sellingPrice: 299 }];

  beforeEach(() => {
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(null); // slug free, by default
    prismaMock.dealPackage.findFirst.mockResolvedValue(null); // syncDealPriceFromPackages: no-op unless a test overrides
  });

  it('1. creates a service deal when the vendor holds SERVICE category access', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture); // assertCategoryChildOf + resolveTopLevelCategory
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, productId: null, packages: [] });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBeNull();
  });

  it('2. creates a product deal when the vendor holds PRODUCT category access and owns the product', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, productId: PRODUCT_ID, packages: [] });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBe(PRODUCT_ID);
  });

  it('3. rejects a service deal when the vendor has no grant for that category', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null); // no grant
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('4. rejects a product deal when the vendor has no grant for that category', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('4b. rejects a product deal whose category is SERVICE-typed (wrong module), even with some grant', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture); // type SERVICE, not PRODUCT
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, productId: PRODUCT_ID }); // productId set but category is SERVICE-typed
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('5. rejects a service deal missing durationMinutes', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(baseServiceDealBody);
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('6. a product deal does not require durationMinutes', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, productId: PRODUCT_ID, packages: [] });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(201);
  });

  it('7. a vendor can create a deal for its own branch (self-service)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, vendorId: VENDOR_A_ID, status: 'DRAFT', packages: [] });
    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(201);
    expect(res.body.data.vendorId).toBe(VENDOR_A_ID); // always server-derived, never from the client
    expect(res.body.data.status).toBe('DRAFT'); // vendor self-service starts DRAFT/PENDING, not ACTIVE/APPROVED
  });

  it("8. a vendor cannot create a deal for another vendor's branch (self-service)", async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // branch actually belongs to vendor B
    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_B_ID}/deals`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('9. admin can create a deal per existing vendors:create permission; a caller without it cannot', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(403);
  });

  it('10. rejects create when the branch does not belong to the vendor in the URL', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // belongs to vendor B, not vendor A
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('10b. a genuine double-submit race on the same slug returns a clean 409, not a raw 500', async () => {
    // Both requests pass the app-level "slug free" pre-check before either commits (the actual
    // race window) — the DB's own slug @unique constraint is what catches it, surfacing as a
    // Prisma P2002 from the create call itself.
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.deal.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  it('11a. rejects a deal whose categoryId does not match the linked product\'s own category', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, categoryId: OTHER_CATEGORY_ID });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('11b. rejects a deal referencing a non-existent product', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(404);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('11c. rejects a deal referencing another vendor\'s product', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_B_ID });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseProductDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('12. updating only salePrice (not touching category/product/duration) does not re-validate category access', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
    prismaMock.deal.update.mockResolvedValue({ ...dealAFixture, salePrice: '249.00' });
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ ...dealAFixture, salePrice: '249.00', packages: [] });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ salePrice: '249.00' });
    expect(res.status).toBe(200);
    expect(res.body.data.salePrice).toBe('249.00');
    expect(prismaMock.vendorCategoryAccess.findUnique).not.toHaveBeenCalled();
  });

  describe('Superadmin notification on vendor deal submission', () => {
    it('a vendor (non-admin) creating a deal notifies every Superadmin — DEAL_PENDING_APPROVAL, PENDING approvalStatus', async () => {
      resolveMock.mockResolvedValue(['vendors:custom']);
      prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // both getMyVendorOrThrow AND the notification's own businessName lookup
      prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
      prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
      prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: DEAL_A_ID, ...data }),
      );
      prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, vendorId: VENDOR_A_ID, approvalStatus: 'PENDING', packages: [] });
      prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }, { id: 'superadmin-2' }]);

      const res = await request(app)
        .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
        .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });

      expect(res.status).toBe(201);
      expect(prismaMock.notification.create).toHaveBeenCalledTimes(2); // one per Superadmin user
      expect(prismaMock.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipientUserId: 'superadmin-1',
            recipientType: 'SUPERADMIN',
            type: 'DEAL_PENDING_APPROVAL',
            title: 'New Deal Pending Approval',
            message: expect.stringContaining('Vendor A Spa'),
            entityType: 'DEAL',
            entityId: DEAL_A_ID,
          }),
        }),
      );
    });

    it('an admin-created (auto-approved) deal does NOT notify any Superadmin', async () => {
      resolveMock.mockResolvedValue(['vendors:create']);
      prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
      prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
      prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: DEAL_A_ID, ...data }),
      );
      prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, approvalStatus: 'APPROVED', packages: [] });
      prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }]);

      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });

      expect(res.status).toBe(201);
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it('a deal creation that fails validation (no category access) creates zero notifications — never a stray row on a rolled-back deal', async () => {
      resolveMock.mockResolvedValue(['vendors:custom']);
      prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
      prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
      prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null); // no grant -> rejected before the transaction even opens

      const res = await request(app)
        .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
        .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });

      expect(res.status).toBe(422);
      expect(prismaMock.deal.create).not.toHaveBeenCalled();
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });
  });
});

describe('POST /api/v1/vendors/me/branches/:branchId/therapists — duplicate-submit guard', () => {
  const therapistBody = { therapistType: 'Legs Therapist', personName: 'Ramesh Kumar' };

  it('creates a therapist normally when no recent identical row exists', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.therapist.create.mockResolvedValue({ id: 'therapist-1', ...therapistBody, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID });

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(therapistBody);

    expect(res.status).toBe(201);
    expect(prismaMock.therapist.create).toHaveBeenCalledOnce();
  });

  it('returns the existing row instead of creating a duplicate when an identical request landed in the last 10s (rapid double-click)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    const recentRow = { id: 'therapist-1', ...therapistBody, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, createdAt: new Date() };
    prismaMock.therapist.findFirst.mockResolvedValue(recentRow);

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(therapistBody);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('therapist-1');
    expect(prismaMock.therapist.create).not.toHaveBeenCalled(); // reused the existing row, no second insert
  });

  it('the near-duplicate lookup is scoped by vendorId/branchId/therapistType/personName and a short createdAt window', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.therapist.create.mockResolvedValue({ id: 'therapist-2', ...therapistBody, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID });

    await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(therapistBody);

    expect(prismaMock.therapist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vendorId: VENDOR_A_ID,
          branchId: BRANCH_A_ID,
          therapistType: therapistBody.therapistType,
          personName: therapistBody.personName,
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe('PUT /api/v1/vendors/me/category-access (business modules + category access)', () => {
  it('replaces the full set: grants two categories, then a follow-up call with one id revokes the other', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.category.findMany.mockResolvedValue([serviceCategoryFixture, productCategoryFixture]);
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([
      { id: 'g1', vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID, category: serviceCategoryFixture },
      { id: 'g2', vendorId: VENDOR_A_ID, categoryId: PRODUCT_CATEGORY_ID, category: productCategoryFixture },
    ]);

    const res = await request(app)
      .put('/api/v1/vendors/me/category-access')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ offersService: true, offersProduct: true, offersTherapy: false, categoryIds: [CATEGORY_ID, PRODUCT_CATEGORY_ID] });

    expect(res.status).toBe(200);
    expect(prismaMock.vendor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { offersService: true, offersProduct: true, offersTherapy: false } }),
    );
    expect(prismaMock.vendorCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { vendorId: VENDOR_A_ID } });
    expect(prismaMock.vendorCategoryAccess.createMany).toHaveBeenCalledWith({
      data: [{ vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID }, { vendorId: VENDOR_A_ID, categoryId: PRODUCT_CATEGORY_ID }],
    });
  });

  it('revoking down to a single category deletes-then-recreates exactly that one row (replace-the-full-set, not a diff)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.category.findMany.mockResolvedValue([serviceCategoryFixture]);
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([
      { id: 'g1', vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID, category: serviceCategoryFixture },
    ]);

    const res = await request(app)
      .put('/api/v1/vendors/me/category-access')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ offersService: true, offersProduct: false, offersTherapy: false, categoryIds: [CATEGORY_ID] });

    expect(res.status).toBe(200);
    expect(prismaMock.vendorCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { vendorId: VENDOR_A_ID } });
    expect(prismaMock.vendorCategoryAccess.createMany).toHaveBeenCalledWith({
      data: [{ vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID }],
    });
  });

  it('rejects granting a category whose type does not match any enabled module', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.category.findMany.mockResolvedValue([productCategoryFixture]);

    const res = await request(app)
      .put('/api/v1/vendors/me/category-access')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ offersService: true, offersProduct: false, offersTherapy: false, categoryIds: [PRODUCT_CATEGORY_ID] });

    expect(res.status).toBe(422);
    expect(prismaMock.vendorCategoryAccess.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects granting a subcategory instead of its top-level parent', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const SUB_ID = 'b6b6b6b6-0000-4000-8000-00000000000f';
    prismaMock.category.findMany.mockResolvedValue([{ ...serviceCategoryFixture, id: SUB_ID, parentId: CATEGORY_ID }]);

    const res = await request(app)
      .put('/api/v1/vendors/me/category-access')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ offersService: true, offersProduct: false, offersTherapy: false, categoryIds: [SUB_ID] });

    expect(res.status).toBe(422);
  });
});

describe('Product (vendor-scoped self-service + admin-on-behalf)', () => {
  beforeEach(() => {
    prismaMock.category.findUnique.mockResolvedValue(productCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(productGrantFixture);
    prismaMock.product.findUnique.mockResolvedValue(null); // slug free, by default
  });

  const productBody = { name: 'Hair Serum', slug: 'hair-serum-2', categoryId: PRODUCT_CATEGORY_ID, price: '499.00' };

  it('a vendor can create its own product when it holds PRODUCT category access', async () => {
    resolveMock.mockResolvedValue(['products:create', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PRODUCT_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors/me/products')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(productBody);
    expect(res.status).toBe(201);
    expect(res.body.data.vendorId).toBe(VENDOR_A_ID); // always server-derived
  });

  it('rejects creating a product when the vendor lacks PRODUCT category access', async () => {
    resolveMock.mockResolvedValue(['products:create', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/vendors/me/products')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(productBody);
    expect(res.status).toBe(422);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it("a vendor cannot update another vendor's product", async () => {
    resolveMock.mockResolvedValue(['products:edit', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_B_ID });
    const res = await request(app)
      .patch(`/api/v1/vendors/me/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when a double-submit races past the app-layer slug check and hits the DB unique constraint', async () => {
    resolveMock.mockResolvedValue(['products:create', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.product.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app)
      .post('/api/v1/vendors/me/products')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(productBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('admin can create a product on behalf of a vendor via /vendors/:vendorId/products', async () => {
    resolveMock.mockResolvedValue(['products:create']);
    prismaMock.product.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PRODUCT_ID, ...data }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/products`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(productBody);
    expect(res.status).toBe(201);
    expect(res.body.data.vendorId).toBe(VENDOR_A_ID);
  });

  it('a vendor can delete its own product', async () => {
    resolveMock.mockResolvedValue(['products:delete', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.delete.mockResolvedValue(productFixture);
    const res = await request(app)
      .delete(`/api/v1/vendors/me/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
  });
});

describe('Therapist specializationCategoryId (category-access gate)', () => {
  const THERAPY_CATEGORY_ID = 'b5b5b5b5-0000-4000-8000-00000000000e';
  const therapyCategoryFixture = { id: THERAPY_CATEGORY_ID, name: 'Deep Tissue', parentId: null, type: 'THERAPY' };
  const therapyGrantFixture = { id: 'grant-therapy', vendorId: VENDOR_A_ID, categoryId: THERAPY_CATEGORY_ID };

  it('creates a therapist with a granted THERAPY specializationCategoryId', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.category.findUnique.mockResolvedValue(therapyCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(therapyGrantFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.therapist.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'therapist-3', ...data }));

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_CATEGORY_ID });

    expect(res.status).toBe(201);
  });

  it('rejects a therapist specializationCategoryId the vendor was not granted', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.category.findUnique.mockResolvedValue(therapyCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null);
    prismaMock.therapist.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_CATEGORY_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });
});

describe('Therapist (admin-on-behalf — mirrors Branch/Deal exact admin split)', () => {
  const THERAPIST_A_ID = 'e1e1e1e1-0000-4000-8000-00000000000f';
  const therapistBody = { therapistType: 'Legs Therapist', personName: 'Ramesh Kumar' };
  const therapistAFixture = { id: THERAPIST_A_ID, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, ...therapistBody, isActive: true };

  it('admin can create a therapist on behalf of a vendor via /vendors/:vendorId/branches/:branchId/therapists', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(null); // no recent duplicate
    prismaMock.therapist.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: THERAPIST_A_ID, ...data }),
    );

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(therapistBody);

    expect(res.status).toBe(201);
    expect(res.body.data.vendorId).toBe(VENDOR_A_ID); // always server-derived, never client-supplied
  });

  it('404s (not 500) creating a therapist when the branch does not exist under that vendor at all', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.branch.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(therapistBody);

    expect(res.status).toBe(404);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });

  it('403s creating a therapist when the branch exists but under a different vendor than the URL claims', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(therapistBody);

    expect(res.status).toBe(403);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });

  it('admin can update a therapist on behalf of a vendor via /vendors/:vendorId/therapists/:therapistId', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapist.update.mockResolvedValue({ ...therapistAFixture, personName: 'Updated Name' });

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ personName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.personName).toBe('Updated Name');
  });

  it("403s updating a therapist that belongs to a different vendor than the URL claims", async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.therapist.findUnique.mockResolvedValue({ ...therapistAFixture, vendorId: VENDOR_B_ID });

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ personName: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(prismaMock.therapist.update).not.toHaveBeenCalled();
  });

  it('admin can set a therapist status on behalf of a vendor via /vendors/:vendorId/therapists/:therapistId/status', async () => {
    resolveMock.mockResolvedValue(['vendors:status_change']);
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapist.update.mockResolvedValue({ ...therapistAFixture, isActive: false });

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('rejects an admin-on-behalf therapist create with a specializationCategoryId the vendor was not granted THERAPY access to', async () => {
    const THERAPY_CATEGORY_ID = 'b6b6b6b6-0000-4000-8000-000000000010';
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.category.findUnique.mockResolvedValue({ id: THERAPY_CATEGORY_ID, name: 'Deep Tissue', parentId: null, type: 'THERAPY' });
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null); // no grant

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...therapistBody, specializationCategoryId: THERAPY_CATEGORY_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });
});

/**
 * Feature: TherapistPackage (a therapist's own duration/price menu, self-service `/me/*` routes)
 * Scenario: full CRUD, previously zero test coverage despite `vendor.service.ts` already
 * implementing scoping (404/403) and P2002->CONFLICT handling for these 4 endpoints.
 *
 * Given: an authenticated vendor with an existing therapist under their own vendor
 * When: they list/create/update/delete a package on that therapist
 * Then: each op succeeds and is properly scoped to the caller's own vendor/therapist
 *
 * Edge cases:
 * - a therapist belonging to a different vendor is rejected as 403 (list/create), not a raw 500
 * - a package that exists but belongs to a different therapist than the URL's is rejected 403
 * - a duplicate (vendorId, therapistId, durationMinutes) create/update surfaces as a clean 409
 *   (P2002), not a raw 500 — mirrors the same discipline as Deal/Category/User create above
 */
describe('TherapistPackage (self-service /me/therapists/:therapistId/packages)', () => {
  const THERAPIST_A_ID = 'e1e1e1e1-0000-4000-8000-00000000000f';
  const PACKAGE_A_ID = 'f2f2f2f2-0000-4000-8000-000000000011';
  const therapistAFixture = { id: THERAPIST_A_ID, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, therapistType: 'Massage Therapist', personName: 'Suresh Chandra', isActive: true };
  const packageAFixture = { id: PACKAGE_A_ID, therapistId: THERAPIST_A_ID, durationMinutes: 60, sellingPrice: '999.00', originalPrice: '1299.00', isActive: true, sortOrder: 0 };
  const packageBody = { durationMinutes: 60, sellingPrice: 999, originalPrice: 1299 };

  beforeEach(() => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
  });

  it('lists a therapist\'s packages, ordered by sortOrder then durationMinutes', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findMany.mockResolvedValue([packageAFixture]);

    const res = await request(app)
      .get(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([packageAFixture]);
  });

  it('404s (not 500) listing packages for a therapist that does not exist', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(404);
  });

  it('403s (not 500) listing packages for a therapist owned by a different vendor', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue({ ...therapistAFixture, vendorId: VENDOR_B_ID });

    const res = await request(app)
      .get(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(403);
  });

  it('creates a package for its own therapist', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.create.mockResolvedValue(packageAFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(packageBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(packageAFixture);
    expect(prismaMock.therapistPackage.create).toHaveBeenCalledWith({
      data: { ...packageBody, therapistId: THERAPIST_A_ID },
    });
  });

  it('rejects creating a package with originalPrice below sellingPrice (422, schema-level)', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ durationMinutes: 60, sellingPrice: 999, originalPrice: 500 });

    expect(res.status).toBe(422);
    expect(prismaMock.therapistPackage.create).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when a duplicate durationMinutes hits the DB unique constraint', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.therapistPackage.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    const res = await request(app)
      .post(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(packageBody);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('403s (not 500) creating a package for a therapist owned by a different vendor', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue({ ...therapistAFixture, vendorId: VENDOR_B_ID });

    const res = await request(app)
      .post(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(packageBody);

    expect(res.status).toBe(403);
    expect(prismaMock.therapistPackage.create).not.toHaveBeenCalled();
  });

  it('updates its own package', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue(packageAFixture);
    prismaMock.therapistPackage.update.mockResolvedValue({ ...packageAFixture, sellingPrice: '899.00' });

    const res = await request(app)
      .patch(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ sellingPrice: 899 });

    expect(res.status).toBe(200);
    expect(res.body.data.sellingPrice).toBe('899.00');
  });

  it('404s (not 500) updating a package id that does not exist', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ sellingPrice: 899 });

    expect(res.status).toBe(404);
    expect(prismaMock.therapistPackage.update).not.toHaveBeenCalled();
  });

  it('403s (not 500) updating a package that belongs to a different therapist than the URL\'s', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue({ ...packageAFixture, therapistId: 'some-other-therapist' });

    const res = await request(app)
      .patch(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ sellingPrice: 899 });

    expect(res.status).toBe(403);
    expect(prismaMock.therapistPackage.update).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when an update collides with another package\'s durationMinutes', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue(packageAFixture);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.therapistPackage.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    const res = await request(app)
      .patch(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ durationMinutes: 90 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('deletes its own package', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue(packageAFixture);
    prismaMock.therapistPackage.delete.mockResolvedValue(packageAFixture);

    const res = await request(app)
      .delete(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
  });

  it('404s (not 500) deleting a package id that does not exist', async () => {
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(404);
    expect(prismaMock.therapistPackage.delete).not.toHaveBeenCalled();
  });

  it('returns 401 with no token on every TherapistPackage route', async () => {
    const noAuth = await Promise.all([
      request(app).get(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`),
      request(app).post(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages`).send(packageBody),
      request(app).patch(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`).send({ sellingPrice: 1 }),
      request(app).delete(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/packages/${PACKAGE_A_ID}`),
    ]);
    noAuth.forEach((res) => expect(res.status).toBe(401));
  });
});
