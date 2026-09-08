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

// Same mock shape as vendor-kyc-documents.routes.test.ts / media.routes.test.ts / categories.
// routes.test.ts — without this, the image/video upload routes tested below would write real
// files under the real uploads directory on every test run.
vi.mock('../lib/media-storage', () => ({
  getUploadRoot: vi.fn(() => '/fake/uploads/media'),
  writeMediaFile: vi.fn(async (subdir: string, parentId: string, buffer: Buffer) => ({
    storageKey: `${subdir}/${parentId}/fake.jpg`,
    sizeBytes: buffer.length,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
}));

// The real resolver makes a live network call (redirect-following against Google Maps) — mocked
// here the same way sms/email providers are mocked in auth route tests, so mapLocationUrl tests
// stay hermetic and don't depend on network access.
vi.mock('../providers/maps/googleMapsUrlResolver.provider', () => ({
  resolveGoogleMapsLocation: vi.fn(),
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { resolveGoogleMapsLocation } from '../providers/maps/googleMapsUrlResolver.provider';
import { bearerFor } from '../test-utils/auth-test-utils';
import { ApiError } from '../lib/http';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const prismaMock = vi.mocked(prisma, true);
const resolveMapLocationMock = vi.mocked(resolveGoogleMapsLocation);

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

/** A byte-exact, magic-byte-valid JPEG buffer, well under any size ceiling — same helper shape as
 *  categories.routes.test.ts's own `validJpeg()`. */
function validJpeg(): Buffer {
  const buffer = Buffer.alloc(50 * 1024, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

/** A byte-exact, magic-byte-valid MP4 buffer (an `ftyp` ISO-BMFF box at offset 4, non-`qt  ` major
 *  brand — see media-magic-bytes.ts's `sniffMediaType`), well under the 1MB video ceiling. */
function validMp4(): Buffer {
  const buffer = Buffer.alloc(1024, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('isom', 8, 'ascii');
  return buffer;
}

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

describe('POST /api/v1/vendors/:vendorId/branches — mapLocationUrl/pincode validation', () => {
  it('resolves a mapLocationUrl server-side and persists the resolved latitude/longitude', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: BRANCH_A_ID, ...data }),
    );
    resolveMapLocationMock.mockResolvedValue({ latitude: 26.7606, longitude: 83.3732 });

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', mapLocationUrl: 'https://maps.app.goo.gl/o3WNRifqzdctDuiF9', pincode: '273001' });

    expect(res.status).toBe(201);
    expect(resolveMapLocationMock).toHaveBeenCalledWith('https://maps.app.goo.gl/o3WNRifqzdctDuiF9');
    expect(res.body.data.latitude).toBe(26.7606);
    expect(res.body.data.longitude).toBe(83.3732);
    expect(res.body.data.mapLocationUrl).toBe('https://maps.app.goo.gl/o3WNRifqzdctDuiF9');
  });

  it('silently strips legacy client-sent latitude/longitude instead of persisting them (mapLocationUrl is the only accepted input now)', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: BRANCH_A_ID, ...data }),
    );

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', latitude: 26.7606, longitude: 83.3732 });

    expect(res.status).toBe(201);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
    expect(prismaMock.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ latitude: expect.anything(), longitude: expect.anything() }),
      }),
    );
  });

  it('rejects a malformed mapLocationUrl before ever calling the resolver', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', mapLocationUrl: 'not-a-url' });

    expect(res.status).toBe(422);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
    expect(prismaMock.branch.create).not.toHaveBeenCalled();
  });

  it.each([
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

/**
 * Feature: Map Location — `mapLocationUrl` on PATCH branch, on Vendor create/update (both admin
 * and self-service), and on the read path for a pre-migration row. Extends the POST-branch
 * coverage above with the update-time "skip re-resolve when unchanged / re-resolve when changed /
 * leave untouched when absent" contract documented on `vendor.service.ts`'s
 * `resolveMapLocationForUpdate`, plus the same resolver-rejection-surfaces-as-422 behavior on
 * every entry point that accepts a `mapLocationUrl`.
 */
describe('mapLocationUrl — update-time resolve/skip semantics + resolver-rejection surfacing', () => {
  const branchWithLocation = { ...branchAFixture, mapLocationUrl: 'https://maps.app.goo.gl/existing', latitude: 26.7606, longitude: 83.3732 };

  it('PATCH branch with an unchanged mapLocationUrl does not call the resolver again', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.branch.findUnique.mockResolvedValue(branchWithLocation);
    prismaMock.branch.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...branchWithLocation, ...data }),
    );

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch (renamed)', mapLocationUrl: branchWithLocation.mapLocationUrl });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
    expect(prismaMock.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ latitude: expect.anything(), longitude: expect.anything() }),
      }),
    );
  });

  it('PATCH branch with a changed mapLocationUrl re-resolves and updates latitude/longitude', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.branch.findUnique.mockResolvedValue(branchWithLocation);
    resolveMapLocationMock.mockResolvedValue({ latitude: 12.9716, longitude: 77.5946 });
    prismaMock.branch.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...branchWithLocation, ...data }),
    );

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ mapLocationUrl: 'https://maps.app.goo.gl/brandNewLink' });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).toHaveBeenCalledWith('https://maps.app.goo.gl/brandNewLink');
    expect(res.body.data.latitude).toBe(12.9716);
    expect(res.body.data.longitude).toBe(77.5946);
    expect(prismaMock.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latitude: 12.9716, longitude: 77.5946, mapLocationUrl: 'https://maps.app.goo.gl/brandNewLink' }),
      }),
    );
  });

  it('PATCH branch with mapLocationUrl absent leaves the existing latitude/longitude/mapLocationUrl completely untouched', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.branch.findUnique.mockResolvedValue(branchWithLocation);
    prismaMock.branch.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...branchWithLocation, ...data }),
    );

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Just a rename' });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
    expect(prismaMock.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ latitude: expect.anything(), longitude: expect.anything(), mapLocationUrl: expect.anything() }),
      }),
    );
    expect(res.body.data.mapLocationUrl).toBe(branchWithLocation.mapLocationUrl);
    expect(res.body.data.latitude).toBe(branchWithLocation.latitude);
  });

  it('a resolver rejection on branch create surfaces as a 422, not a 500', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    resolveMapLocationMock.mockRejectedValue(new ApiError('VALIDATION_ERROR', "We couldn't resolve this Google Maps link. Please check the link and try again."));

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', mapLocationUrl: 'https://maps.app.goo.gl/deadlink' });

    expect(res.status).toBe(422);
    expect(prismaMock.branch.create).not.toHaveBeenCalled();
  });

  it('a resolver rejection on branch update surfaces as a 422, not a 500', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    resolveMapLocationMock.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'We could not find a location in that Google Maps link. Please check the link and try again.'));

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ mapLocationUrl: 'https://maps.app.goo.gl/deadlink' });

    expect(res.status).toBe(422);
    expect(prismaMock.branch.update).not.toHaveBeenCalled();
  });

  it('admin POST /vendors resolves a mapLocationUrl and persists the resolved latitude/longitude on the Vendor itself (not just Branch)', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    resolveMapLocationMock.mockResolvedValue({ latitude: 26.7606, longitude: 83.3732 });
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Golghar Spa', mapLocationUrl: 'https://maps.app.goo.gl/o3WNRifqzdctDuiF9' });

    expect(res.status).toBe(201);
    expect(resolveMapLocationMock).toHaveBeenCalledWith('https://maps.app.goo.gl/o3WNRifqzdctDuiF9');
    expect(res.body.data.latitude).toBe(26.7606);
    expect(res.body.data.longitude).toBe(83.3732);
  });

  it('admin PATCH /vendors/:id with an unchanged mapLocationUrl does not re-resolve', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    const existing = { ...vendorAFixture, mapLocationUrl: 'https://maps.app.goo.gl/existing', latitude: 1, longitude: 2 };
    prismaMock.vendor.findUnique.mockResolvedValue(existing);
    prismaMock.vendor.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...existing, ...data }));

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ mapLocationUrl: existing.mapLocationUrl });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
  });

  it('self-service POST /vendors/me resolves a mapLocationUrl and persists it on the new self-registered vendor', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    resolveMapLocationMock.mockResolvedValue({ latitude: 26.7606, longitude: 83.3732 });
    prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );

    const res = await request(app)
      .post('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ businessName: 'My Spa', mapLocationUrl: 'https://maps.app.goo.gl/o3WNRifqzdctDuiF9' });

    expect(res.status).toBe(201);
    expect(resolveMapLocationMock).toHaveBeenCalledWith('https://maps.app.goo.gl/o3WNRifqzdctDuiF9');
    expect(res.body.data.latitude).toBe(26.7606);
    expect(res.body.data.longitude).toBe(83.3732);
  });

  it('self-service PATCH /vendors/me with a changed mapLocationUrl re-resolves and updates latitude/longitude', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const existing = { ...vendorAFixture, mapLocationUrl: 'https://maps.app.goo.gl/old', latitude: 1, longitude: 2, kycStatus: 'VERIFIED' };
    prismaMock.vendor.findUnique.mockResolvedValue(existing);
    resolveMapLocationMock.mockResolvedValue({ latitude: 26.7606, longitude: 83.3732 });
    prismaMock.vendor.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...existing, ...data }));

    const res = await request(app)
      .patch('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ mapLocationUrl: 'https://maps.app.goo.gl/new' });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).toHaveBeenCalledWith('https://maps.app.goo.gl/new');
    expect(res.body.data.latitude).toBe(26.7606);
    expect(res.body.data.longitude).toBe(83.3732);
  });

  it('self-service PATCH /vendors/me with mapLocationUrl absent leaves the existing value untouched', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const existing = { ...vendorAFixture, mapLocationUrl: 'https://maps.app.goo.gl/old', latitude: 1, longitude: 2, kycStatus: 'VERIFIED' };
    prismaMock.vendor.findUnique.mockResolvedValue(existing);
    prismaMock.vendor.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...existing, ...data }));

    const res = await request(app)
      .patch('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ businessName: 'Renamed only' });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
    expect(res.body.data.mapLocationUrl).toBe(existing.mapLocationUrl);
    expect(res.body.data.latitude).toBe(existing.latitude);
  });

  it('a resolver rejection on self-service vendor update surfaces as a 422, not a 500', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    resolveMapLocationMock.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'That is not a supported Google Maps URL. Please paste a link from Google Maps (e.g. maps.app.goo.gl or google.com/maps).'));

    const res = await request(app)
      .patch('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ mapLocationUrl: 'https://evil.com/not-maps' });

    expect(res.status).toBe(422);
    expect(prismaMock.vendor.update).not.toHaveBeenCalled();
  });

  it('GET returns a pre-migration branch row (latitude/longitude set, mapLocationUrl null) unchanged — never broken by the new resolve logic', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    const preMigrationBranch = { ...branchAFixture, latitude: 26.7606, longitude: 83.3732, mapLocationUrl: null };
    prismaMock.branch.findMany.mockResolvedValue([preMigrationBranch]);

    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data[0].latitude).toBe(26.7606);
    expect(res.body.data[0].longitude).toBe(83.3732);
    expect(res.body.data[0].mapLocationUrl).toBeNull();
  });

  it('GET returns a pre-migration vendor row (latitude/longitude set, mapLocationUrl null) unchanged', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.vendor.findUnique.mockResolvedValue({ ...vendorAFixture, latitude: 26.7606, longitude: 83.3732, mapLocationUrl: null });

    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data.latitude).toBe(26.7606);
    expect(res.body.data.longitude).toBe(83.3732);
    expect(res.body.data.mapLocationUrl).toBeNull();
  });
});

/**
 * Feature: Branch working-hours persistence (Branch schedule audit). Root cause of "branch hours
 * never save, frontend shows nothing dynamic": `BranchFieldsSchema` had no `openingHours` field
 * at all, so `validateBody` (which replaces `req.body` with Zod's parsed output, silently
 * dropping any undeclared key) stripped it before `createBranch`/`updateBranch` ever ran — the
 * edit form itself was already correct; the value just never reached the database.
 */
describe('POST/PATCH /api/v1/vendors/:vendorId/branches — openingHours persistence', () => {
  const openingHours = {
    mon: { open: true, start: '10:00', end: '20:00' },
    wed: { open: false },
    sun: { open: false },
  };

  it('POST persists openingHours instead of silently stripping it', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: BRANCH_A_ID, ...data }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', openingHours });
    expect(res.status).toBe(201);
    expect(res.body.data.openingHours).toEqual(openingHours);
    expect(prismaMock.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ openingHours }) }),
    );
  });

  it('PATCH persists an openingHours update the same way', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.branch.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...branchAFixture, ...data }),
    );
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ openingHours });
    expect(res.status).toBe(200);
    expect(res.body.data.openingHours).toEqual(openingHours);
  });

  it('rejects a malformed time string (not 24-hour HH:MM) with a 422, not a silent strip', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', openingHours: { mon: { open: true, start: '10 AM', end: '20:00' } } });
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

/**
 * Feature: Superadmin hard-delete for Vendor (Vendor Validation/Delete audit, Phase 4).
 * `Order`/`OrderItem`'s `vendor` relation has no `onDelete` (Postgres default = restrict), so a
 * vendor with any real order history can never be hard-deleted — Postgres blocks it with a clean
 * P2003, translated to CONFLICT (use `/status` to deactivate/suspend instead).
 */
describe('DELETE /api/v1/vendors/:id', () => {
  it('deletes a vendor and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['vendors:delete']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendor.delete.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendor.delete).toHaveBeenCalledWith({ where: { id: VENDOR_A_ID } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('404s (not 500) when the vendor does not exist', async () => {
    resolveMock.mockResolvedValue(['vendors:delete']);
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(404);
    expect(prismaMock.vendor.delete).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when the vendor has real order history blocking the delete', async () => {
    resolveMock.mockResolvedValue(['vendors:delete']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.vendor.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'test' }),
    );
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(409);
  });

  it('403s without vendors:delete', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('a vendor cannot delete its own vendor profile', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
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

/**
 * Feature: Vendor KYC/Profile — removing the profile image (self-service, `/me/images/:imageId`).
 * Verified separately from the admin-on-behalf routes below: this route never had the
 * `validateParams(UuidParamSchema)` param-stripping bug (no `validateParams` call at all here),
 * but had zero direct test coverage. Also covers the "physical file already missing" requirement
 * — `deleteMediaFile` already swallows ENOENT and `mediaService.deleteImage` already catches any
 * other file-deletion error after the DB delete has committed, so a missing/already-deleted file
 * must never turn a genuine removal into a failed one.
 */
describe('Self-service vendor image removal (Vendor login)', () => {
  const IMAGE_ID = 'bbbbbbbb-0000-4000-8000-000000000088';

  it('a vendor can remove their own profile image', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_A_ID, isPrimary: false, storageKey: 'vendors/x/a.jpg' });
    prismaMock.vendorImage.delete.mockResolvedValue({ id: IMAGE_ID });
    const res = await request(app)
      .delete(`/api/v1/vendors/me/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendorImage.delete).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
  });

  it('succeeds even when the physical file is already missing from disk (ENOENT swallowed, DB update still commits)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_A_ID, isPrimary: false, storageKey: 'vendors/x/already-gone.jpg' });
    prismaMock.vendorImage.delete.mockResolvedValue({ id: IMAGE_ID });
    const { deleteMediaFile } = await import('../lib/media-storage');
    vi.mocked(deleteMediaFile).mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    const res = await request(app)
      .delete(`/api/v1/vendors/me/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendorImage.delete).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
  });

  it('404s (not 500) removing an image id that does not exist', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete(`/api/v1/vendors/me/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });

  it('403s (not 500) removing an image that belongs to a different vendor', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_B_ID, isPrimary: false, storageKey: 'vendors/y/a.jpg' });
    const res = await request(app)
      .delete(`/api/v1/vendors/me/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404); // deleteImage 404s on parentId mismatch, never leaks another vendor's row
  });
});

/**
 * Feature: admin vendor-image routes — `imageId` route-param regression.
 * `validateParams` replaces `req.params` with Zod's parsed output, and Zod silently strips any
 * key not declared on the schema. `DELETE /:id/images/:imageId` and
 * `PATCH /:id/images/:imageId/primary` used the bare `UuidParamSchema` (only `id`), so
 * `req.params.imageId` was always `undefined` — the actual root cause of "removing a vendor
 * profile image throws an error." `VendorImageIdParamSchema` declares both params.
 */
describe('Admin vendor image routes — imageId param regression', () => {
  const IMAGE_ID = 'aaaaaaaa-0000-4000-8000-000000000099';

  it('DELETE /:id/images/:imageId reaches the service with the real imageId, not undefined', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_A_ID, isPrimary: false, storageKey: 'vendors/x/a.jpg' });
    prismaMock.vendorImage.delete.mockResolvedValue({ id: IMAGE_ID });
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendorImage.findUnique).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
    expect(prismaMock.vendorImage.delete).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
  });

  it('PATCH /:id/images/:imageId/primary reaches the service with the real imageId, not undefined', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_A_ID, isPrimary: false });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/images/${IMAGE_ID}/primary`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendorImage.findUnique).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
  });

  it('422s (not a 500) for a malformed imageId instead of silently stripping it', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}/images/not-a-uuid`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(422);
  });
});

/**
 * Feature: admin product routes — `productId` route-param regression, same bug class as the
 * vendor-image one above. `PATCH /:vendorId/products/:productId[/status]` and
 * `DELETE /:vendorId/products/:productId` used the bare `VendorIdParamSchema` (only `vendorId`),
 * so `req.params.productId` was always `undefined` — the actual root cause behind "editing a
 * product" failing from the Superadmin console (not just its media upload).
 */
describe('Admin product routes — productId param regression', () => {
  it('PATCH /:vendorId/products/:productId reaches the service with the real productId, not undefined', async () => {
    resolveMock.mockResolvedValue(['products:edit']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.update.mockResolvedValue({ ...productFixture, name: 'Updated Name' });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PRODUCT_ID } }),
    );
  });

  it('DELETE /:vendorId/products/:productId reaches the service with the real productId, not undefined', async () => {
    resolveMock.mockResolvedValue(['products:delete']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.delete.mockResolvedValue(productFixture);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: PRODUCT_ID } });
  });

  it('422s (not a 500) for a malformed productId instead of silently stripping it', async () => {
    resolveMock.mockResolvedValue(['products:edit']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/products/not-a-uuid`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'X' });
    expect(res.status).toBe(422);
  });
});

/**
 * Feature: admin-on-behalf product media routes — these never existed on the backend at all,
 * which was the actual root cause of "upload fails when adding/editing a product" from the
 * Superadmin console: `apps/msd/src/api/media.ts`'s `basePath()` always targets
 * `/vendors/:vendorId/products/:productId/images` here (the admin product wizard never passes
 * `selfService`), so every such request 404'd before reaching any multer/Zod validation.
 */
describe('Admin-on-behalf product media routes (previously missing entirely)', () => {
  it('POST /:vendorId/products/:productId/images uploads successfully', async () => {
    resolveMock.mockResolvedValue(['products:edit']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.productImage.create.mockResolvedValue({ id: 'img-1', productId: PRODUCT_ID, storageKey: 'products/x/a.jpg' });
    prismaMock.productImage.count.mockResolvedValue(0);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validJpeg(), 'photo.png');
    expect(res.status).toBe(201);
  });

  it('DELETE /:vendorId/products/:productId/images/:imageId deletes successfully', async () => {
    resolveMock.mockResolvedValue(['products:edit']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.productImage.findUnique.mockResolvedValue({ id: 'img-1', productId: PRODUCT_ID, isPrimary: false, storageKey: 'products/x/a.jpg' });
    prismaMock.productImage.delete.mockResolvedValue({ id: 'img-1' });
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}/images/img-1`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
  });

  it('404s (not a raw 500) creating media for a product that does not belong to the URL vendor', async () => {
    resolveMock.mockResolvedValue(['products:edit']);
    prismaMock.product.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validJpeg(), 'photo.png');
    expect(res.status).toBe(404);
  });
});

/**
 * Feature: `listDeals` includes `packages` (Deal Edit "packages not showing" fix).
 * The Edit dialog is always seeded from this list response (there is no single-deal GET), so if
 * this `include` ever omits `packages` again, every existing DealPackage silently disappears from
 * the Edit form even though the rows are still in the database untouched.
 */
describe('GET .../branches/:branchId/deals — includes packages (regression)', () => {
  const packagesFixture = [
    { id: 'pkg-1', dealId: DEAL_A_ID, durationMinutes: 30, sellingPrice: '500.00', originalPrice: null, isActive: true, sortOrder: 0 },
    { id: 'pkg-2', dealId: DEAL_A_ID, durationMinutes: 60, sellingPrice: '900.00', originalPrice: null, isActive: true, sortOrder: 1 },
  ];

  it('self-service GET /me/branches/:branchId/deals includes each deal\'s packages', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findMany.mockResolvedValue([{ ...dealAFixture, packages: packagesFixture }]);
    const res = await request(app)
      .get(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].packages).toHaveLength(2);
    expect(res.body.data[0].packages[0].durationMinutes).toBe(30);
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ packages: expect.anything() }) }),
    );
  });

  it('admin-on-behalf GET /:vendorId/branches/:branchId/deals also includes each deal\'s packages', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findMany.mockResolvedValue([{ ...dealAFixture, packages: packagesFixture }]);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].packages).toHaveLength(2);
    expect(res.body.data[0].packages[1].sellingPrice).toBe('900.00');
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

  /**
   * Feature: Superadmin hard-delete for Deal (Vendor Validation/Delete audit, Phase 4).
   * `CartItem`/`OrderItem`'s `deal` relation has no `onDelete` (Postgres default = restrict), so a
   * Deal referenced by any real order/cart can never be hard-deleted — Postgres blocks it with a
   * clean P2003, translated to CONFLICT.
   */
  describe('DELETE /api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId', () => {
    it('deletes a deal and writes an audit log entry', async () => {
      resolveMock.mockResolvedValue(['vendors:delete']);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
      prismaMock.deal.delete.mockResolvedValue(dealAFixture);
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(200);
      expect(prismaMock.deal.delete).toHaveBeenCalledWith({ where: { id: DEAL_A_ID } });
      expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
    });

    it('403s (not a raw delete) when the deal belongs to a different vendor than the URL claims', async () => {
      resolveMock.mockResolvedValue(['vendors:delete']);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.deal.findUnique.mockResolvedValue({ ...dealAFixture, vendorId: VENDOR_B_ID });
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
      expect(prismaMock.deal.delete).not.toHaveBeenCalled();
    });

    it('returns a clean 409 (not a raw 500) when the deal has real order/cart history blocking the delete', async () => {
      resolveMock.mockResolvedValue(['vendors:delete']);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
      const { Prisma } = await import('../generated/prisma-client');
      prismaMock.deal.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'test' }),
      );
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(409);
    });

    it('403s without vendors:delete', async () => {
      resolveMock.mockResolvedValue(['vendors:view']);
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
    });
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

  /**
   * Feature: Deal Edit — existing packages must never be silently deleted (the actual data-loss
   * risk behind "packages disappear after refresh"). Root cause was `listDeals` omitting
   * `packages` from its `include` (fixed separately) — DealDialog always seeds its package state
   * from `deal.packages` and always resubmits the full current array on every save of a service
   * deal, so once the load-side bug was fixed, a correctly-loaded existing package's real `id`
   * flows straight back into the PATCH body and `updateDeal`'s diff-by-id logic below updates it
   * in place. These tests lock in that guarantee at the API layer, independent of the frontend.
   */
  describe('13. Deal packages — update never silently deletes existing rows', () => {
    const EXISTING_PKG_A = 'e1e1e1e1-0000-4000-8000-0000000000f1';
    const EXISTING_PKG_B = 'e2e2e2e2-0000-4000-8000-0000000000f2';

    it('PATCH with no `packages` key at all leaves existing packages completely untouched', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
      prismaMock.deal.update.mockResolvedValue({ ...dealAFixture, title: 'Renamed' });
      prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ ...dealAFixture, title: 'Renamed', packages: [] });
      const res = await request(app)
        .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ title: 'Renamed' });
      expect(res.status).toBe(200);
      expect(prismaMock.dealPackage.findMany).not.toHaveBeenCalled();
      expect(prismaMock.dealPackage.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.dealPackage.update).not.toHaveBeenCalled();
      expect(prismaMock.dealPackage.create).not.toHaveBeenCalled();
    });

    it('PATCH resubmitting existing packages by id (unchanged values) updates each in place — never deletes, never recreates', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
      prismaMock.deal.update.mockResolvedValue(dealAFixture);
      prismaMock.dealPackage.findMany.mockResolvedValue([{ id: EXISTING_PKG_A }, { id: EXISTING_PKG_B }]);
      prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ ...dealAFixture, packages: [] });
      const res = await request(app)
        .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({
          packages: [
            { id: EXISTING_PKG_A, durationMinutes: 30, sellingPrice: 500 },
            { id: EXISTING_PKG_B, durationMinutes: 60, sellingPrice: 900 },
          ],
        });
      expect(res.status).toBe(200);
      expect(prismaMock.dealPackage.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.dealPackage.create).not.toHaveBeenCalled();
      expect(prismaMock.dealPackage.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.dealPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXISTING_PKG_A } }),
      );
      expect(prismaMock.dealPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXISTING_PKG_B } }),
      );
    });

    it('A modified + B unchanged + C newly added + D removed → A/B updated, C created, D deleted (nothing else touched)', async () => {
      const EXISTING_PKG_D = 'e3e3e3e3-0000-4000-8000-0000000000f3';
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
      prismaMock.deal.update.mockResolvedValue(dealAFixture);
      // D existed before this save but is absent from the submitted array below — must be deleted.
      prismaMock.dealPackage.findMany.mockResolvedValue([{ id: EXISTING_PKG_A }, { id: EXISTING_PKG_B }, { id: EXISTING_PKG_D }]);
      prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ ...dealAFixture, packages: [] });
      const res = await request(app)
        .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({
          packages: [
            { id: EXISTING_PKG_A, durationMinutes: 45, sellingPrice: 600 }, // modified
            { id: EXISTING_PKG_B, durationMinutes: 60, sellingPrice: 900 }, // unchanged
            { durationMinutes: 90, sellingPrice: 1200 }, // new, no id
          ],
        });
      expect(res.status).toBe(200);
      expect(prismaMock.dealPackage.update).toHaveBeenCalledTimes(2);
      expect(prismaMock.dealPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXISTING_PKG_A }, data: expect.objectContaining({ durationMinutes: 45 }) }),
      );
      expect(prismaMock.dealPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXISTING_PKG_B }, data: expect.objectContaining({ durationMinutes: 60 }) }),
      );
      expect(prismaMock.dealPackage.create).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ data: expect.objectContaining({ dealId: DEAL_A_ID, durationMinutes: 90 }) }),
      );
      expect(prismaMock.dealPackage.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: [EXISTING_PKG_D] } } });
    });

    it('PATCH with an empty packages array ([]) is rejected at validation (422) before it can ever reach the delete logic — DealUpdateSchema\'s own existing safety net', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      const res = await request(app)
        .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ packages: [] });
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body.error)).toMatch(/omit `packages` to leave them unchanged/);
      // Never even reaches the deal lookup, let alone the package diff/delete logic.
      expect(prismaMock.deal.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.dealPackage.deleteMany).not.toHaveBeenCalled();
    });
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

  /**
   * Feature: admin-on-behalf therapist media routes (previously missing entirely) — the actual
   * root cause of "Superadmin's Add Therapist form has no image/video upload". Superadmin's
   * `WizardTherapistFormDialog` always targets `/vendors/:vendorId/therapists/:therapistId/...`
   * (never the self-service `/me/...` routes), so before these routes existed every such request
   * 404'd before reaching any multer/validation.
   */
  describe('Admin-on-behalf therapist media routes (previously missing entirely)', () => {
    it('POST /:vendorId/therapists/:therapistId/images uploads successfully', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      prismaMock.therapistImage.create.mockResolvedValue({ id: 'timg-1', therapistId: THERAPIST_A_ID, storageKey: 'therapists/x/a.jpg' });
      prismaMock.therapistImage.count.mockResolvedValue(0);
      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/images`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .attach('file', validJpeg(), 'photo.jpg');
      expect(res.status).toBe(201);
    });

    it('DELETE /:vendorId/therapists/:therapistId/images/:imageId deletes successfully', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      prismaMock.therapistImage.findUnique.mockResolvedValue({ id: 'timg-1', therapistId: THERAPIST_A_ID, isPrimary: false, storageKey: 'therapists/x/a.jpg' });
      prismaMock.therapistImage.delete.mockResolvedValue({ id: 'timg-1' });
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/images/timg-1`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(200);
    });

    it('POST /:vendorId/therapists/:therapistId/video uploads successfully', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      prismaMock.therapistVideo.upsert.mockResolvedValue({ id: 'tvid-1', therapistId: THERAPIST_A_ID, storageKey: 'therapists/x/v.mp4' });
      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/video`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .attach('file', validMp4(), 'clip.mp4');
      expect(res.status).toBe(201);
    });

    it('404s (not a raw 500) uploading media for a therapist that does not belong to the URL vendor', async () => {
      resolveMock.mockResolvedValue(['vendors:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/images`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .attach('file', validJpeg(), 'photo.jpg');
      expect(res.status).toBe(404);
    });

    it('403s without vendors:edit', async () => {
      resolveMock.mockResolvedValue(['vendors:view']);
      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/images`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .attach('file', validJpeg(), 'photo.jpg');
      expect(res.status).toBe(403);
    });
  });

  /**
   * Feature: Superadmin hard-delete for Therapist (Vendor Validation/Delete audit, Phase 4).
   * `CartItem`/`OrderItem`'s `therapist` relation has no `onDelete` (Postgres default = restrict),
   * so a Therapist referenced by any real order/cart can never be hard-deleted — Postgres blocks
   * it with a clean P2003, translated to CONFLICT (never a raw 500, never silent data loss).
   */
  describe('DELETE /api/v1/vendors/:vendorId/therapists/:therapistId', () => {
    it('deletes a therapist and writes an audit log entry', async () => {
      resolveMock.mockResolvedValue(['vendors:delete']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      prismaMock.therapist.delete.mockResolvedValue(therapistAFixture);
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(200);
      expect(prismaMock.therapist.delete).toHaveBeenCalledWith({ where: { id: THERAPIST_A_ID } });
      expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
    });

    it('403s (not a raw delete) when the therapist belongs to a different vendor than the URL claims', async () => {
      resolveMock.mockResolvedValue(['vendors:delete']);
      prismaMock.therapist.findUnique.mockResolvedValue({ ...therapistAFixture, vendorId: VENDOR_B_ID });
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
      expect(prismaMock.therapist.delete).not.toHaveBeenCalled();
    });

    it('returns a clean 409 (not a raw 500) when the therapist has real order/cart history blocking the delete', async () => {
      resolveMock.mockResolvedValue(['vendors:delete']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      const { Prisma } = await import('../generated/prisma-client');
      prismaMock.therapist.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'test' }),
      );
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(409);
    });

    it('403s without vendors:delete', async () => {
      resolveMock.mockResolvedValue(['vendors:view']);
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
    });
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
