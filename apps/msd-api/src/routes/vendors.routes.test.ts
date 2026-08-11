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
const CATEGORY_ID = 'b1b1b1b1-0000-4000-8000-000000000008';
const OTHER_CATEGORY_ID = 'b2b2b2b2-0000-4000-8000-00000000000b';
const SERVICE_ID = 'c1c1c1c1-0000-4000-8000-000000000009';
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
const serviceFixture = { id: SERVICE_ID, name: 'Haircut', categoryId: CATEGORY_ID, subcategoryId: null };
const productFixture = { id: PRODUCT_ID, name: 'Face Cream', categoryId: CATEGORY_ID, subcategoryId: null };

const baseDealBody = { categoryId: CATEGORY_ID, title: 'Haircut deal', slug: 'haircut-deal', originalPrice: '399.00', salePrice: '299.00' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
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
      .send({ businessName: 'Admin-created Vendor', gstNumber: 'GST123', panNumber: 'PAN123' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_VERIFICATION'); // gst+pan present -> skip PROFILE_INCOMPLETE
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
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

describe('Deal offering integration (Service/Product linkage)', () => {
  const categoryFixture = { id: CATEGORY_ID, name: 'Salon & Grooming', parentId: null };

  beforeEach(() => {
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(null); // slug free, by default
    prismaMock.category.findUnique.mockResolvedValue(categoryFixture); // assertCategoryChildOf's categoryId lookup
  });

  it('1. creates a deal linked to a service', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.service.findUnique.mockResolvedValue(serviceFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, serviceId: SERVICE_ID, durationMinutes: 30 });
    expect(res.status).toBe(201);
    expect(res.body.data.serviceId).toBe(SERVICE_ID);
  });

  it('2. creates a deal linked to a product', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBe(PRODUCT_ID);
  });

  it('3. rejects a deal with both serviceId and productId', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, serviceId: SERVICE_ID, productId: PRODUCT_ID, durationMinutes: 30 });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('4. rejects a deal with neither serviceId nor productId', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(baseDealBody);
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('5. rejects a service deal missing durationMinutes', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.service.findUnique.mockResolvedValue(serviceFixture);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, serviceId: SERVICE_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('6. a product deal does not require durationMinutes', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(201);
  });

  it('7. a vendor can create a deal for its own branch (self-service)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
    prismaMock.service.findUnique.mockResolvedValue(serviceFixture);
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: DEAL_A_ID, ...data }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ ...baseDealBody, serviceId: SERVICE_ID, durationMinutes: 30 });
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
      .send({ ...baseDealBody, serviceId: SERVICE_ID, durationMinutes: 30 });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('9. admin can create a deal per existing vendors:create permission; a caller without it cannot', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(403);
  });

  it('10. rejects create when the branch does not belong to the vendor in the URL', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // belongs to vendor B, not vendor A
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('11a. rejects a deal whose categoryId does not match the linked service\'s category', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.service.findUnique.mockResolvedValue({ ...serviceFixture, categoryId: OTHER_CATEGORY_ID });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, serviceId: SERVICE_ID, durationMinutes: 30 });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('11b. rejects a deal referencing a non-existent product', async () => {
    resolveMock.mockResolvedValue(['vendors:create']);
    prismaMock.product.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseDealBody, productId: PRODUCT_ID });
    expect(res.status).toBe(404);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('12. existing (pre-migration) deals with neither serviceId nor productId remain fully editable', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.deal.findUnique.mockResolvedValue(dealAFixture); // legacy deal: no serviceId/productId
    prismaMock.deal.update.mockResolvedValue({ ...dealAFixture, salePrice: '249.00' });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ salePrice: '249.00' });
    expect(res.status).toBe(200);
    expect(res.body.data.salePrice).toBe('249.00');
  });
});
