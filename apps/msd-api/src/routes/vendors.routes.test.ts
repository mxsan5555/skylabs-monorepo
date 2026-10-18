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

// POST /vendors now runs createMember, which sends a welcome notice: never reach a real SMTP or SMS provider.
vi.mock('../services/member-notice.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/member-notice.service')>()),
  sendMemberNotice: vi.fn().mockResolvedValue({ email: true, sms: true }),
  sendOnChannel: vi.fn().mockResolvedValue(true),
}));

// Same mock shape as vendor-kyc-documents.routes.test.ts / media.routes.test.ts / categories.
// routes.test.ts — without this, the image/video upload routes tested below would write real
// files under the real uploads directory on every test run.
vi.mock('../lib/media-storage', () => ({
  writeMediaFile: vi.fn(async (folder: string, buffer: Buffer) => ({
    storageKey: `${folder}/fake.jpg`,
    sizeBytes: buffer.length,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
  signedFileUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
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
// Branch-level counterpart of serviceGrantFixture (BranchCategoryAccess) — Branch A's own grant,
// narrowing what the vendor already holds above; see assertBranchHasCategoryAccess.
const branchServiceGrantFixture = { id: 'branch-grant-service', branchId: BRANCH_A_ID, categoryId: CATEGORY_ID };
const productGrantFixture = { id: 'grant-product', vendorId: VENDOR_A_ID, categoryId: PRODUCT_CATEGORY_ID };
// Two subcategories of CATEGORY_ID ("Spa" in the feature spec's canonical example) — "Massage" is
// branch-mapped in the canonical scenario below, "Facial" deliberately is not.
const SUB_MASSAGE_ID = 'b7b7b7b7-0000-4000-8000-000000000010';
const SUB_FACIAL_ID = 'b8b8b8b8-0000-4000-8000-000000000011';
const subMassageFixture = { id: SUB_MASSAGE_ID, name: 'Massage', parentId: CATEGORY_ID, type: null };
const subFacialFixture = { id: SUB_FACIAL_ID, name: 'Facial', parentId: CATEGORY_ID, type: null };
// Branch B's own grant of the SAME top-level category, but only mapped to a DIFFERENT
// subcategory (Facial, not Massage) — the canonical "Branch A -> Spa -> Massage granted, Branch B
// -> Spa -> Facial only" scenario.
const branchBServiceGrantFixture = { id: 'branch-b-grant-service', branchId: BRANCH_B_ID, categoryId: CATEGORY_ID };

const baseServiceDealBody = { categoryId: CATEGORY_ID, title: 'Haircut deal', slug: 'haircut-deal', originalPrice: '399.00', salePrice: '299.00' };

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
  // createTherapist/updateTherapist now unconditionally assert the target branch has SOME
  // THERAPY category access (see vendor.service.ts's assertBranchHasAnyCategoryAccessOfType) —
  // harmless "branch has Therapy access" default for every therapist test in this file that
  // isn't specifically asserting that gate's rejection path (which overrides with `null`).
  prismaMock.branchCategoryAccess.findFirst.mockResolvedValue({ id: 'default-branch-therapy-access' });
  // The vendor list/detail routes add `liveCounts` through four grouped queries (see
  // vendor.service.ts#attachLiveCounts) — no live rows unless a test arranges some.
  for (const model of [prismaMock.branch, prismaMock.deal, prismaMock.product, prismaMock.therapist]) {
    model.groupBy.mockResolvedValue([]);
  }
});

describe('GET /api/v1/vendors/me', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/vendors/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller lacks members:custom', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the caller has members:custom but no vendor profile yet', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });

  it("returns 200 with the caller's own vendor", async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(VENDOR_A_ID);
  });
});

describe('Security: vendor cross-tenant isolation', () => {
  it("403s when Vendor A's token tries to touch Vendor B's branch via /vendors/me/branches/:branchId", async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // branch actually belongs to vendor B
    const res = await request(app)
      .patch(`/api/v1/vendors/me/branches/${BRANCH_B_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ name: 'Hijacked name' });
    expect(res.status).toBe(403);
  });

  it("403s when Vendor A's token tries to touch Vendor B's deal via /vendors/me/branches/:branchId/deals/:dealId", async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);
    const res = await request(app)
      .patch(`/api/v1/vendors/me/branches/${BRANCH_B_ID}/deals/${DEAL_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ title: 'Hijacked title' });
    expect(res.status).toBe(403);
  });

  it('a vendor cannot activate its own deal before admin approval', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
  it('returns 403 without members:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the vendor list for an admin', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([vendorAFixture]);
    prismaMock.member.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('adds liveCounts per vendor (0 where a vendor has no live rows) and asks only for live rows', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([vendorAFixture]);
    prismaMock.member.count.mockResolvedValue(1);
    prismaMock.deal.groupBy.mockResolvedValue([{ vendorId: vendorAFixture.id, _count: { _all: 5 } }]);
    prismaMock.therapist.groupBy.mockResolvedValue([{ vendorId: vendorAFixture.id, _count: { _all: 2 } }]);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].liveCounts).toEqual({ branches: 0, deals: 5, products: 0, therapists: 2 });
    expect(prismaMock.deal.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE', approvalStatus: 'APPROVED' }) }),
    );
    expect(prismaMock.branch.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
    );
  });

  it('a vendor-role token (members:custom only, no members:view) cannot list all vendors', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .get('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });
});

/** POST /vendors is the deprecated alias of POST /members: it runs createMember with the short Add member form. */
describe('POST /api/v1/vendors (admin create alias)', () => {
  const FULL_BODY = {
    businessName: 'Urban Wellness Spa',
    ownerFirstName: 'Asha',
    ownerLastName: 'Rao',
    ownerEmail: 'asha@urban.test',
    ownerMobile: '9222222222',
  };

  beforeEach(() => {
    resolveMock.mockResolvedValue(['members:create']);
    prismaMock.user.create.mockResolvedValue({ id: USER_B_ID });
    prismaMock.role.findUnique.mockResolvedValue({ id: 'member-role-id', key: 'member' });
    prismaMock.userRole.upsert.mockResolvedValue({});
    prismaMock.member.update.mockResolvedValue({});
    prismaMock.member.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
  });

  it('creates an ACTIVE member, writes an audit log entry and marks the response deprecated', async () => {
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(FULL_BODY);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.headers.deprecation).toBe('true');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('generates a non-null, businessName-derived slug', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null); // no existing member owns this slug
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(FULL_BODY);
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('urban-wellness-spa');
  });

  it('422s the old businessName-only draft body and creates nothing', async () => {
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'No Owner Info' });
    expect(res.status).toBe(422);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('422s a field outside the Add member allowlist', async () => {
    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...FULL_BODY, gstNumber: '27AAAAA0000A1Z5' });
    expect(res.status).toBe(422);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/vendors/:id never re-links an owner', () => {
  it('rejects ownerUserId with 422 and writes nothing', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ownerUserId: USER_A_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
    expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Vendor owner is always a brand-new User
 * Scenario: admin "Add Vendor" via `ownerEmail`/`ownerMobile` — there is no existing-user reuse
 * path. Any match on either identifier — even a partial match, even both fields matching the
 * SAME existing account — blocks creation outright. Nothing is ever created or linked in that
 * case: no User, no Vendor, no role assignment.
 */
describe('POST /api/v1/vendors — owner is always a brand-new User (no existing-user reuse)', () => {
  const vendorRoleFixture = { id: 'vendor-role-id', key: 'vendor' };

  beforeEach(() => {
    resolveMock.mockResolvedValue(['members:create']);
    prismaMock.role.findUnique.mockResolvedValue(vendorRoleFixture);
    prismaMock.userRole.upsert.mockResolvedValue({});
    prismaMock.member.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: VENDOR_A_ID, ...data }),
    );
  });

  it('creates a brand-new User (only name/email/phone) when neither identifier matches anything', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null) // createVendorOwner: byEmail — no match
      .mockResolvedValueOnce(null) // createVendorOwner: byPhone — no match
      .mockResolvedValue({ id: USER_B_ID, roles: [] }); // ensureVendorRoleAssigned -> assignRole's getUserOrThrow, on the newly-created id
    prismaMock.user.create.mockResolvedValue({ id: USER_B_ID });

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({
        businessName: 'New Owner Vendor',
        ownerFirstName: 'New',
        ownerLastName: 'Owner',
        ownerEmail: 'new-owner@example.com',
        ownerMobile: '9222222222',
      });

    expect(res.status).toBe(201);
    // vendorPhoneSchema normalizes the mobile number (normalizeIdentifier) before it ever reaches
    // the service — the same +91-prefixed form createVendorOwner's caller always receives.
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { name: 'New Owner', email: 'new-owner@example.com', phone: '+919222222222' },
    });
    expect(res.body.data.ownerUserId).toBe(USER_B_ID);
    expect(prismaMock.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: USER_B_ID, roleId: vendorRoleFixture.id } }),
    );
  });

  it('rejects with 409 and creates nothing when the email already belongs to an existing User', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: USER_A_ID }).mockResolvedValueOnce(null); // byEmail found, byPhone free

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Taken Email Vendor', ownerFirstName: 'Asha', ownerLastName: 'Rao', ownerEmail: 'taken@example.com', ownerMobile: '9999999999' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
  });

  it('rejects with 409 and creates nothing when the phone already belongs to an existing User', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: USER_A_ID }); // byEmail free, byPhone found

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Taken Phone Vendor', ownerFirstName: 'Asha', ownerLastName: 'Rao', ownerEmail: 'fresh@example.com', ownerMobile: '9888888888' });

    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it('rejects with 409 when BOTH email and phone belong to the SAME existing User — an existing Customer supplying their own details is never converted/reused', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_A_ID }); // same user for both lookups

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Existing Customer Vendor', ownerFirstName: 'Asha', ownerLastName: 'Rao', ownerEmail: 'vinay@example.com', ownerMobile: '9889259224' });

    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    // Confirms the existing User never gets the `vendor` role added, either — a full no-op.
    expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
  });

  it('rejects with 409 when email belongs to User A and phone belongs to a different User B', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: USER_A_ID }).mockResolvedValueOnce({ id: USER_B_ID });

    const res = await request(app)
      .post('/api/v1/vendors')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessName: 'Mismatched Owner Vendor', ownerFirstName: 'Asha', ownerLastName: 'Rao', ownerEmail: 'a@example.com', ownerMobile: '9876543210' });

    expect(res.status).toBe(409);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Vendor owner-identity AVAILABILITY preview
 * Scenario: `GET /vendors/users/lookup` — the UX-only preview `checkVendorOwnerAvailability`
 * backs. There is no "match" to preview anymore (no reuse concept) — just whether the typed
 * email/mobile is already taken, so the Add Vendor form can show "already exists" before the
 * admin fills in the rest of the form.
 *
 * Edge cases:
 * - 403 without members:create or members:edit
 */
describe('GET /api/v1/vendors/users/lookup — owner-identity availability check', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/vendors/users/lookup?email=a@example.com');
    expect(res.status).toBe(401);
  });

  it('returns 403 without members:create or members:edit', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    const res = await request(app)
      .get('/api/v1/vendors/users/lookup?email=a@example.com')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns available:true with no conflicts when neither identifier matches anything', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/vendors/users/lookup?email=nobody@example.com')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: true, conflicts: [] });
  });

  it('returns available:false with conflicts:["email"] when only the email is already taken', async () => {
    resolveMock.mockResolvedValue(['members:create']);
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: USER_A_ID }).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/vendors/users/lookup?email=taken@example.com&mobile=9876543210')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false, conflicts: ['email'] });
  });

  it('returns available:false with conflicts:["phone"] when only the phone is already taken', async () => {
    resolveMock.mockResolvedValue(['members:create']);
    prismaMock.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: USER_A_ID });

    const res = await request(app)
      .get('/api/v1/vendors/users/lookup?email=fresh@example.com&mobile=9876543210')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false, conflicts: ['phone'] });
  });

  it('returns available:false with conflicts:["email","phone"] when both are taken, even by the same existing User', async () => {
    resolveMock.mockResolvedValue(['members:create']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_A_ID });

    const res = await request(app)
      .get('/api/v1/vendors/users/lookup?email=a@example.com&mobile=9876543210')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false, conflicts: ['email', 'phone'] });
  });

  it('returns 422 when neither email nor mobile is given', async () => {
    resolveMock.mockResolvedValue(['members:create']);
    const res = await request(app)
      .get('/api/v1/vendors/users/lookup')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(422);
  });
});

describe('Vendor mobile phone validation (canonical /^[6-9]\\d{9}$/ rule)', () => {
  it.each([
    ['98765abc10', 'letters mixed with digits'],
    ['123456789', 'only 9 digits'],
    ['12345678901', '11 digits'],
    ['5876543210', 'first digit not 6-9'],
  ])('rejects "%s" (%s)', async (badPhone) => {
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessPhone: badPhone });

    expect(res.status).toBe(422);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it('accepts a bare 10-digit number starting 6-9 and stores it +91-normalized', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.member.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...vendorAFixture, ...data }),
    );

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ businessPhone: '9876543210' });

    expect(res.status).toBe(200);
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessPhone: '+919876543210' }) }),
    );
  });
});

describe('POST /api/v1/vendors/:vendorId/branches — mapLocationUrl/pincode validation', () => {
  it('resolves a mapLocationUrl server-side and persists the resolved latitude/longitude', async () => {
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);

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
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);

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
    resolveMock.mockResolvedValue(['vendors.branches:edit']);
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
    resolveMock.mockResolvedValue(['vendors.branches:edit']);
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
    resolveMock.mockResolvedValue(['vendors.branches:edit']);
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
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    resolveMapLocationMock.mockRejectedValue(new ApiError('VALIDATION_ERROR', "We couldn't resolve this Google Maps link. Please check the link and try again."));

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', mapLocationUrl: 'https://maps.app.goo.gl/deadlink' });

    expect(res.status).toBe(422);
    expect(prismaMock.branch.create).not.toHaveBeenCalled();
  });

  it('a resolver rejection on branch update surfaces as a 422, not a 500', async () => {
    resolveMock.mockResolvedValue(['vendors.branches:edit']);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    resolveMapLocationMock.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'We could not find a location in that Google Maps link. Please check the link and try again.'));

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ mapLocationUrl: 'https://maps.app.goo.gl/deadlink' });

    expect(res.status).toBe(422);
    expect(prismaMock.branch.update).not.toHaveBeenCalled();
  });

  it('admin PATCH /vendors/:id with an unchanged mapLocationUrl does not re-resolve', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    const existing = { ...vendorAFixture, mapLocationUrl: 'https://maps.app.goo.gl/existing', latitude: 1, longitude: 2 };
    prismaMock.member.findUnique.mockResolvedValue(existing);
    prismaMock.member.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...existing, ...data }));

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ mapLocationUrl: existing.mapLocationUrl });

    expect(res.status).toBe(200);
    expect(resolveMapLocationMock).not.toHaveBeenCalled();
  });

  it('self-service PATCH /vendors/me with a changed mapLocationUrl re-resolves and updates latitude/longitude', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const existing = { ...vendorAFixture, mapLocationUrl: 'https://maps.app.goo.gl/old', latitude: 1, longitude: 2, kycStatus: 'VERIFIED' };
    prismaMock.member.findUnique.mockResolvedValue(existing);
    resolveMapLocationMock.mockResolvedValue({ latitude: 26.7606, longitude: 83.3732 });
    prismaMock.member.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...existing, ...data }));

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
    resolveMock.mockResolvedValue(['members:custom']);
    const existing = { ...vendorAFixture, mapLocationUrl: 'https://maps.app.goo.gl/old', latitude: 1, longitude: 2, kycStatus: 'VERIFIED' };
    prismaMock.member.findUnique.mockResolvedValue(existing);
    prismaMock.member.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...existing, ...data }));

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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    resolveMapLocationMock.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'That is not a supported Google Maps URL. Please paste a link from Google Maps (e.g. maps.app.goo.gl or google.com/maps).'));

    const res = await request(app)
      .patch('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ mapLocationUrl: 'https://evil.com/not-maps' });

    expect(res.status).toBe(422);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it('GET returns a pre-migration branch row (latitude/longitude set, mapLocationUrl null) unchanged — never broken by the new resolve logic', async () => {
    resolveMock.mockResolvedValue(['vendors.branches:view']);
    // `categoryAccess: []` mirrors what Prisma's real `include` always returns (an array, even
    // when empty) — listBranches (see vendor.service.ts) maps it into `categoryTypes` and would
    // throw on a hand-built fixture that omits it entirely, which a real query never does.
    const preMigrationBranch = { ...branchAFixture, latitude: 26.7606, longitude: 83.3732, mapLocationUrl: null, categoryAccess: [] };
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
    resolveMock.mockResolvedValue(['members:view']);
    prismaMock.member.findUnique.mockResolvedValue({ ...vendorAFixture, latitude: 26.7606, longitude: 83.3732, mapLocationUrl: null });

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
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['vendors.branches:edit']);
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
    resolveMock.mockResolvedValue(['vendors.branches:create']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Golghar Branch', openingHours: { mon: { open: true, start: '10 AM', end: '20:00' } } });
    expect(res.status).toBe(422);
    expect(prismaMock.branch.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/vendors/users/search', () => {
  it('returns 403 without members:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/vendors/users/search?q=vinay')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns matching users for an admin with members:create', async () => {
    resolveMock.mockResolvedValue(['members:create']);
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

  it('also allows search for an admin who only holds members:edit (not create) — reachable while resuming a draft vendor in Step 1', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/vendors/users/search?q=vinay')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
  });

  it('filters server-side to active, not-already-linked users only — never trusts the frontend to exclude them', async () => {
    resolveMock.mockResolvedValue(['members:create']);
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
  it("every admin Vendor response carries profileCompletion with a 'user' section reflecting ownerUserId", async () => {
    resolveMock.mockResolvedValue(['members:view']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture); // has ownerUserId set
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));

    expect(res.status).toBe(200);
    const userSection = res.body.data.profileCompletion.sections.find((s: { key: string }) => s.key === 'user');
    expect(userSection.complete).toBe(true);
  });

});

describe('Cross-vendor Branches/Deals sidebar lists', () => {
  it('GET /vendors/branches returns 403 for a vendor-role token (members:custom only)', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .get('/api/v1/vendors/branches')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('GET /vendors/branches returns every branch with its vendor joined for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors.branches:view']);
    prismaMock.branch.findMany.mockResolvedValue([{ ...branchAFixture, vendor: { id: VENDOR_A_ID, businessName: 'Vendor A Spa' } }]);
    prismaMock.branch.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors/branches')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].vendor.businessName).toBe('Vendor A Spa');
  });

  it('GET /vendors/deals returns 403 for a vendor-role token', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .get('/api/v1/vendors/deals')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('GET /vendors/deals returns every deal with vendor + branch joined for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:view']);
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
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .get('/api/v1/vendors/therapists')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('GET /vendors/therapists returns every therapist with vendor + branch joined for an admin', async () => {
    resolveMock.mockResolvedValue(['vendors.therapists:view']);
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

/**
 * Feature: approval is gone. Members start ACTIVE, so the self-service create and submit routes
 * and the admin approve, reject and KYC review routes no longer exist.
 */
describe('Removed approval and self-create routes', () => {
  it.each([
    ['post', '/api/v1/vendors/me'],
    ['post', '/api/v1/vendors/me/submit'],
    ['patch', `/api/v1/vendors/${VENDOR_A_ID}/approve`],
    ['patch', `/api/v1/vendors/${VENDOR_A_ID}/reject`],
    ['patch', `/api/v1/vendors/${VENDOR_A_ID}/kyc-review`],
  ] as const)('%s %s is not routed and creates or updates nothing', async (method, path) => {
    resolveMock.mockResolvedValue(['members:custom', 'members:approve', 'members:reject']);
    const res = await request(app)
      [method](path)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['admin'] }))
      .send({ businessName: 'Vendor A Spa', reason: 'not needed any more', kycStatus: 'VERIFIED' });
    expect(res.status).toBe(404);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/vendors (member list filters)', () => {
  it('passes documents, reviewFlag and status through to the query and adds documentsSummary', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([{ ...vendorAFixture, documents: [], documentsDueAt: null }]);
    prismaMock.member.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/vendors?status=ACTIVE&documents=incomplete&reviewFlag=true')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    const where = prismaMock.member.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'ACTIVE', reviewFlaggedAt: { not: null } });
    expect(where.OR).toHaveLength(3);
    expect(res.body.data[0].documentsSummary).toMatchObject({ complete: false, missing: ['AADHAAR', 'PAN', 'GST'] });
  });

  it('422s an unknown documents filter value', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    const res = await request(app)
      .get('/api/v1/vendors?documents=complete')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(422);
  });
});

/** The `/vendors/:id/status` alias runs the member status service (history, audit, notices). */
describe('PATCH /api/v1/vendors/:id/status (member status alias)', () => {
  it('moves an ACTIVE member to INACTIVE with a reason and writes history', async () => {
    resolveMock.mockResolvedValue(['members:status_change']);
    prismaMock.member.findUnique.mockResolvedValue({ ...vendorAFixture, owner: null });
    prismaMock.member.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.memberStatusHistory.create.mockResolvedValue({});
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'INACTIVE', reason: 'Owner asked for a pause' });
    expect(res.status).toBe(200);
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ memberId: VENDOR_A_ID, fromStatus: 'ACTIVE', toStatus: 'INACTIVE', actorUserId: 'admin-1' }),
    });
  });

  it('422s a reason shorter than 10 characters', async () => {
    resolveMock.mockResolvedValue(['members:status_change']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'SUSPENDED', reason: 'short' });
    expect(res.status).toBe(422);
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });

  it('403s without members:status_change', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'INACTIVE', reason: 'Owner asked for a pause' });
    expect(res.status).toBe(403);
  });
});

/**
 * Feature: the `/vendors/:id` DELETE alias runs the member delete. Super Admin only (only that
 * role holds members:delete), the member must be SUSPENDED first, a reason is required, and a
 * member whose delete is blocked by order rows is archived instead.
 */
describe('DELETE /api/v1/vendors/:id (member delete alias)', () => {
  const REASON = { reason: 'Closed the business for good' };

  it('hard deletes a SUSPENDED member with no order lines', async () => {
    resolveMock.mockResolvedValue(['members:delete']);
    prismaMock.member.findUnique.mockResolvedValue({ ...vendorAFixture, status: 'SUSPENDED', owner: null });
    prismaMock.orderItem.count.mockResolvedValue(0);
    prismaMock.member.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.memberDocument.findMany.mockResolvedValue([]);
    prismaMock.vendorImage.findMany.mockResolvedValue([]);
    prismaMock.vendorVideo.findUnique.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['super_admin'] }))
      .send(REASON);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ outcome: 'DELETED' });
    expect(prismaMock.member.deleteMany).toHaveBeenCalledWith({ where: { id: VENDOR_A_ID, status: 'SUSPENDED' } });
  });

  it('409s MEMBER_NOT_SUSPENDED for an ACTIVE member', async () => {
    resolveMock.mockResolvedValue(['members:delete']);
    prismaMock.member.findUnique.mockResolvedValue({ ...vendorAFixture, owner: null });
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['super_admin'] }))
      .send(REASON);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBER_NOT_SUSPENDED');
    expect(prismaMock.member.deleteMany).not.toHaveBeenCalled();
  });

  it('archives instead of deleting when Postgres blocks the delete (P2003)', async () => {
    resolveMock.mockResolvedValue(['members:delete']);
    prismaMock.member.findUnique.mockResolvedValue({ ...vendorAFixture, status: 'SUSPENDED', owner: null });
    prismaMock.orderItem.count.mockResolvedValue(0);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.memberDocument.findMany.mockResolvedValue([]);
    prismaMock.vendorImage.findMany.mockResolvedValue([]);
    prismaMock.vendorVideo.findUnique.mockResolvedValue(null);
    prismaMock.member.deleteMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'test' }),
    );
    prismaMock.member.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.memberStatusHistory.create.mockResolvedValue({});
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['super_admin'] }))
      .send(REASON);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ outcome: 'ARCHIVED' });
  });

  it('404s (not 500) when the member does not exist', async () => {
    resolveMock.mockResolvedValue(['members:delete']);
    prismaMock.member.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['super_admin'] }))
      .send(REASON);
    expect(res.status).toBe(404);
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
  });

  it('422s without a reason', async () => {
    resolveMock.mockResolvedValue(['members:delete']);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['super_admin'] }));
    expect(res.status).toBe(422);
  });

  it('403s without members:delete', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(REASON);
    expect(res.status).toBe(403);
  });

  it('a member cannot delete its own member profile', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(REASON);
    expect(res.status).toBe(403);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_A_ID, isPrimary: false, storageKey: 'vendors/x/a.jpg' });
    prismaMock.vendorImage.delete.mockResolvedValue({ id: IMAGE_ID });
    const res = await request(app)
      .delete(`/api/v1/vendors/me/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendorImage.delete).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
  });

  it('succeeds even when the physical file is already missing from disk (ENOENT swallowed, DB update still commits)', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete(`/api/v1/vendors/me/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });

  it('403s (not 500) removing an image that belongs to a different vendor', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.findUnique.mockResolvedValue({ id: IMAGE_ID, vendorId: VENDOR_A_ID, isPrimary: false });
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/images/${IMAGE_ID}/primary`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.vendorImage.findUnique).toHaveBeenCalledWith({ where: { id: IMAGE_ID } });
  });

  it('422s (not a 500) for a malformed imageId instead of silently stripping it', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
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
    resolveMock.mockResolvedValue(['vendors.products:edit']);
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
    resolveMock.mockResolvedValue(['vendors.products:delete']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.delete.mockResolvedValue(productFixture);
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: PRODUCT_ID } });
  });

  it('422s (not a 500) for a malformed productId instead of silently stripping it', async () => {
    resolveMock.mockResolvedValue(['vendors.products:edit']);
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
    resolveMock.mockResolvedValue(['vendors.products:edit']);
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
    resolveMock.mockResolvedValue(['vendors.products:edit']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.productImage.findUnique.mockResolvedValue({ id: '1a1a1a1a-0000-4000-8000-0000000000a1', productId: PRODUCT_ID, isPrimary: false, storageKey: 'products/x/a.jpg' });
    prismaMock.productImage.delete.mockResolvedValue({ id: '1a1a1a1a-0000-4000-8000-0000000000a1' });
    const res = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_A_ID}/products/${PRODUCT_ID}/images/1a1a1a1a-0000-4000-8000-0000000000a1`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
  });

  it('404s (not a raw 500) creating media for a product that does not belong to the URL vendor', async () => {
    resolveMock.mockResolvedValue(['vendors.products:edit']);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['vendors.deals:view']);
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

describe('GET /:vendorId/deals (admin, vendor-wide across every branch)', () => {
  it('403s without vendors.deals:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns every deal for the vendor, across branches, with branch info and a flat therapists array (not the raw join rows)', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:view']);
    const therapistFixture = { id: 'therapist-1', personName: 'Ramesh Kumar', therapistType: 'Massage Therapist', isActive: true };
    prismaMock.deal.findMany.mockResolvedValue([
      {
        ...dealAFixture,
        branch: { id: BRANCH_A_ID, name: 'Branch A' },
        packages: [],
        therapistLinks: [{ therapist: therapistFixture }],
      },
    ]);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].branch).toEqual({ id: BRANCH_A_ID, name: 'Branch A' });
    expect(res.body.data[0].therapists).toEqual([therapistFixture]);
    expect(res.body.data[0].therapistLinks).toBeUndefined();
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vendorId: VENDOR_A_ID } }));
  });
});

describe('Admin nested branch/deal approval', () => {
  it('approves a deal, jumping it straight to ACTIVE', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:approve']);
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
    resolveMock.mockResolvedValue(['vendors.deals:view']);
    prismaMock.branch.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(404);
  });

  it('403s when the branch exists but under a different vendor than the URL claims', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:view']);
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
      resolveMock.mockResolvedValue(['vendors.deals:delete']);
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
      resolveMock.mockResolvedValue(['vendors.deals:delete']);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.deal.findUnique.mockResolvedValue({ ...dealAFixture, vendorId: VENDOR_B_ID });
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
      expect(prismaMock.deal.delete).not.toHaveBeenCalled();
    });

    it('returns a clean 409 (not a raw 500) when the deal has real order/cart history blocking the delete', async () => {
      resolveMock.mockResolvedValue(['vendors.deals:delete']);
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

    it('403s without members:delete', async () => {
      resolveMock.mockResolvedValue(['members:view']);
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
    resolveMock.mockResolvedValue(['vendors.deals:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture); // assertCategoryChildOf + resolveTopLevelCategory
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
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

  it('3. rejects a service deal when the vendor has no grant for that category', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null); // no grant
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('5. rejects a service deal missing durationMinutes', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(baseServiceDealBody);
    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('7. a vendor can create a deal for its own branch (self-service)', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // branch actually belongs to vendor B
    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_B_ID}/deals`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('9. admin can create a deal per existing members:create permission; a caller without it cannot', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(403);
  });

  it('10. rejects create when the branch does not belong to the vendor in the URL', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // belongs to vendor B, not vendor A
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(403);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('10b. a genuine double-submit race on the same slug returns a clean 409, not a raw 500', async () => {
    // Both requests pass the app-level "slug free" pre-check before either commits (the actual
    // race window) — the DB's own slug @unique constraint is what catches it, surfacing as a
    // Prisma P2002 from the create call itself.
    resolveMock.mockResolvedValue(['vendors.deals:create']);
    prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.deal.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseServiceDealBody, durationMinutes: 30, packages: baseServicePackages });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  it('12. updating only salePrice (not touching category/product/duration) does not re-validate category access', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:edit']);
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
      resolveMock.mockResolvedValue(['vendors.deals:edit']);
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
      resolveMock.mockResolvedValue(['vendors.deals:edit']);
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
      resolveMock.mockResolvedValue(['vendors.deals:edit']);
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
      resolveMock.mockResolvedValue(['vendors.deals:edit']);
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
      resolveMock.mockResolvedValue(['members:custom']);
      prismaMock.member.findUnique.mockResolvedValue(vendorAFixture); // both getMyVendorOrThrow AND the notification's own businessName lookup
      prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
      prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
      prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
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
      resolveMock.mockResolvedValue(['vendors.deals:create']);
      prismaMock.category.findUnique.mockResolvedValue(serviceCategoryFixture);
      prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture);
      prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
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
      resolveMock.mockResolvedValue(['members:custom']);
      prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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

/**
 * The single most important scenario in the whole feature spec: a vendor-level SERVICE grant on
 * CATEGORY_ID ("Spa") is necessary but not sufficient once a branch has its own narrower
 * BranchCategoryAccess/BranchSubcategoryAccess mapping — a subcategory combination valid for one
 * branch must be rejected for a sibling branch (of the SAME vendor) that was only mapped to a
 * different subcategory of the same top-level category.
 */
describe('Deal create/update — canonical branch-level subcategory scoping (Branch A -> Spa -> Massage granted, Branch A -> Spa -> Facial NOT)', () => {
  const baseSpaDealBody = { categoryId: CATEGORY_ID, title: 'Spa deal', slug: 'spa-deal', originalPrice: '399.00', salePrice: '299.00' };
  const baseServicePackages = [{ durationMinutes: 30, sellingPrice: 299 }];

  function mockCategoryLookup(byId: Record<string, unknown>) {
    prismaMock.category.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(byId[where.id] ?? null),
    );
  }

  beforeEach(() => {
    resolveMock.mockResolvedValue(['vendors.deals:create']);
    prismaMock.deal.findUnique.mockResolvedValue(null); // slug free
    prismaMock.dealPackage.findFirst.mockResolvedValue(null);
    mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture, [SUB_MASSAGE_ID]: subMassageFixture, [SUB_FACIAL_ID]: subFacialFixture });
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(serviceGrantFixture); // vendor-level SERVICE grant on Spa, same for both branches (same vendor)
    prismaMock.deal.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: DEAL_A_ID, ...data }));
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue({ id: DEAL_A_ID, packages: [] });
  });

  it('accepts Branch A -> Spa -> Massage when Branch A is mapped to Spa with Massage enabled', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    // Branch A: mapped to CATEGORY_ID (Spa), with SUB_MASSAGE_ID (Massage) explicitly enabled.
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
    prismaMock.branchSubcategoryAccess.findUnique.mockImplementation(
      ({ where }: { where: { branchCategoryAccessId_subcategoryId: { subcategoryId: string } } }) =>
        Promise.resolve(
          where.branchCategoryAccessId_subcategoryId.subcategoryId === SUB_MASSAGE_ID
            ? { id: 'bsa-massage-a', branchCategoryAccessId: branchServiceGrantFixture.id, subcategoryId: SUB_MASSAGE_ID }
            : null,
        ),
    );

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseSpaDealBody, subcategoryId: SUB_MASSAGE_ID, durationMinutes: 30, packages: baseServicePackages });

    expect(res.status).toBe(201);
  });

  it('REJECTS the identical Branch A -> Spa -> Massage combination when Branch A is only mapped to Spa -> Facial (canonical scenario)', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    // Branch A IS mapped to CATEGORY_ID (Spa) itself...
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
    // ...but only Facial was ever explicitly enabled under it — Massage was not.
    prismaMock.branchSubcategoryAccess.findUnique.mockImplementation(
      ({ where }: { where: { branchCategoryAccessId_subcategoryId: { subcategoryId: string } } }) =>
        Promise.resolve(
          where.branchCategoryAccessId_subcategoryId.subcategoryId === SUB_FACIAL_ID
            ? { id: 'bsa-facial-a', branchCategoryAccessId: branchServiceGrantFixture.id, subcategoryId: SUB_FACIAL_ID }
            : null,
        ),
    );

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseSpaDealBody, subcategoryId: SUB_MASSAGE_ID, durationMinutes: 30, packages: baseServicePackages });

    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('the SAME vendor-wide grant does not help a sibling branch mapped to a different subcategory of the same top-level category (Branch B -> Spa -> Facial only)', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchBServiceGrantFixture);
    prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue(null); // Branch B never enabled Massage at all

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_B_ID}/branches/${BRANCH_B_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseSpaDealBody, subcategoryId: SUB_MASSAGE_ID, durationMinutes: 30, packages: baseServicePackages });

    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('rejects a category that is not branch-mapped at all, even though the vendor holds a valid vendor-wide grant for it', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(null); // Branch A has zero mapping for Spa at all

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseSpaDealBody, durationMinutes: 30, packages: baseServicePackages });

    expect(res.status).toBe(422);
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('a deal with no subcategoryId at all still succeeds as long as the top-level category itself is branch-mapped', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ ...baseSpaDealBody, durationMinutes: 30, packages: baseServicePackages }); // no subcategoryId

    expect(res.status).toBe(201);
    // No subcategoryId was sent -> the branch-subcategory check must never even run.
    expect(prismaMock.branchSubcategoryAccess.findUnique).not.toHaveBeenCalled();
  });

  it('update: changing only the subcategoryId re-validates branch-subcategory access and rejects an unmapped one', async () => {
    resolveMock.mockResolvedValue(['vendors.deals:edit']);
    const existingDeal = { ...dealAFixture, categoryId: CATEGORY_ID, subcategoryId: SUB_MASSAGE_ID };
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(existingDeal);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchServiceGrantFixture);
    prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue(null); // SUB_FACIAL_ID never enabled on Branch A

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ subcategoryId: SUB_FACIAL_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.deal.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/vendors/me/branches/:branchId/therapists — duplicate-submit guard', () => {
  const therapistBody = { therapistType: 'Legs Therapist', personName: 'Ramesh Kumar' };

  it('creates a therapist normally when no recent identical row exists', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { offersService: true, offersProduct: true, offersTherapy: false } }),
    );
    expect(prismaMock.vendorCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { vendorId: VENDOR_A_ID } });
    expect(prismaMock.vendorCategoryAccess.createMany).toHaveBeenCalledWith({
      data: [{ vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID }, { vendorId: VENDOR_A_ID, categoryId: PRODUCT_CATEGORY_ID }],
    });
  });

  it('revoking down to a single category deletes-then-recreates exactly that one row (replace-the-full-set, not a diff)', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.category.findMany.mockResolvedValue([productCategoryFixture]);

    const res = await request(app)
      .put('/api/v1/vendors/me/category-access')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ offersService: true, offersProduct: false, offersTherapy: false, categoryIds: [PRODUCT_CATEGORY_ID] });

    expect(res.status).toBe(422);
    expect(prismaMock.vendorCategoryAccess.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects granting a subcategory instead of its top-level parent', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    const SUB_ID = 'b6b6b6b6-0000-4000-8000-00000000000f';
    prismaMock.category.findMany.mockResolvedValue([{ ...serviceCategoryFixture, id: SUB_ID, parentId: CATEGORY_ID }]);

    const res = await request(app)
      .put('/api/v1/vendors/me/category-access')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ offersService: true, offersProduct: false, offersTherapy: false, categoryIds: [SUB_ID] });

    expect(res.status).toBe(422);
  });
});

describe('Branch category access (GET/PUT /:vendorId/branches/:branchId/category-access + GET /me mirror)', () => {
  const SECOND_CATEGORY_ID = 'b9b9b9b9-0000-4000-8000-000000000012'; // a second top-level SERVICE category, distinct grant
  const secondCategoryFixture = { id: SECOND_CATEGORY_ID, name: 'Fitness', parentId: null, type: 'SERVICE' };
  const secondCategoryGrantFixture = { id: 'grant-second', vendorId: VENDOR_A_ID, categoryId: SECOND_CATEGORY_ID };

  /** Routes every `category.findUnique` call by the id actually requested, regardless of call
   *  order/count — `setBranchCategoryAccess`'s per-mapping loop calls this multiple times (once
   *  for the top-level check, then again inside `assertCategoryChildOf` per subcategory), so a
   *  single `mockResolvedValue` isn't precise enough once more than one distinct id is involved. */
  function mockCategoryLookup(byId: Record<string, unknown>) {
    prismaMock.category.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(byId[where.id] ?? null),
    );
  }

  describe('GET /:vendorId/branches/:branchId/category-access (admin)', () => {
    it('returns the branch\'s own mapping', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:view']);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        {
          id: 'bca-1',
          branchId: BRANCH_A_ID,
          categoryId: CATEGORY_ID,
          category: serviceCategoryFixture,
          subcategories: [{ id: 'bsa-1', subcategoryId: SUB_MASSAGE_ID, subcategory: subMassageFixture }],
        },
      ]);
      const res = await request(app)
        .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].subcategories[0].subcategoryId).toBe(SUB_MASSAGE_ID);
    });

    it('403s without members:view', async () => {
      resolveMock.mockResolvedValue([]);
      const res = await request(app)
        .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
    });

    // The spec draft expected a 404 here ("never confirm existence"), but this route reuses
    // `getBranchScopedOrThrow`, whose own documented contract (and every other branch-scoped
    // route's cross-vendor test in this file, e.g. Deal/Therapist above) is 404 only when the
    // branch doesn't exist AT ALL — 403 when it exists but belongs to a different vendor. Verified
    // against the actual implementation rather than assumed.
    it("403s (not 404) when the branch exists but belongs to a different vendor than the URL claims", async () => {
      resolveMock.mockResolvedValue(['vendors.branches:view']);
      prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // belongs to VENDOR_B
      const res = await request(app)
        .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
    });

    it('404s when the branch does not exist at all', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:view']);
      prismaMock.branch.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .get(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /:vendorId/branches/:branchId/category-access (admin) — CRUD/validation', () => {
    beforeEach(() => {
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    });

    it('CRUD roundtrip: saves a category + subcategory mapping and reads it back', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture, [SUB_MASSAGE_ID]: subMassageFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([serviceGrantFixture]);
      prismaMock.branchCategoryAccess.create.mockResolvedValue({});
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        {
          id: 'bca-1',
          branchId: BRANCH_A_ID,
          categoryId: CATEGORY_ID,
          category: serviceCategoryFixture,
          subcategories: [{ id: 'bsa-1', subcategoryId: SUB_MASSAGE_ID, subcategory: subMassageFixture }],
        },
      ]);

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [SUB_MASSAGE_ID] }] });

      expect(res.status).toBe(200);
      expect(prismaMock.branchCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { branchId: BRANCH_A_ID } });
      expect(prismaMock.branchCategoryAccess.create).toHaveBeenCalledWith({
        data: { branchId: BRANCH_A_ID, categoryId: CATEGORY_ID, subcategories: { create: [{ subcategoryId: SUB_MASSAGE_ID }] } },
      });
      expect(res.body.data[0].subcategories[0].subcategoryId).toBe(SUB_MASSAGE_ID);
    });

    it('a duplicate categoryId within the same PUT (DB @@unique(branchId, categoryId)) surfaces as a clean 409, not a raw 500', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([serviceGrantFixture]);
      const { Prisma } = await import('../generated/prisma-client');
      prismaMock.branchCategoryAccess.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [] }, { categoryId: CATEGORY_ID, subcategoryIds: [] }] });

      expect(res.status).toBe(409);
    });

    it('a duplicate subcategoryId within one mapping (DB @@unique(branchCategoryAccessId, subcategoryId)) surfaces as a clean 409', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture, [SUB_MASSAGE_ID]: subMassageFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([serviceGrantFixture]);
      const { Prisma } = await import('../generated/prisma-client');
      prismaMock.branchCategoryAccess.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [SUB_MASSAGE_ID, SUB_MASSAGE_ID] }] });

      expect(res.status).toBe(409);
    });

    it('auto-grants a category the vendor has not been granted at all (no VendorCategoryAccess row) instead of rejecting — the standalone "Business Modules + Category Access" screen was removed, so this is now the only place Service/Therapy grants come from', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([]); // vendor never granted this category yet
      prismaMock.member.update.mockResolvedValue(vendorAFixture);
      prismaMock.branchCategoryAccess.create.mockResolvedValue({});
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        { id: 'bca-1', branchId: BRANCH_A_ID, categoryId: CATEGORY_ID, category: serviceCategoryFixture, subcategories: [] },
      ]);

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [] }] });

      expect(res.status).toBe(200);
      expect(prismaMock.vendorCategoryAccess.createMany).toHaveBeenCalledWith({
        data: [{ vendorId: VENDOR_A_ID, categoryId: CATEGORY_ID }],
        skipDuplicates: true,
      });
      expect(prismaMock.member.update).toHaveBeenCalledWith({ where: { id: VENDOR_A_ID }, data: { offersService: true } });
      expect(prismaMock.branchCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { branchId: BRANCH_A_ID } });
      expect(prismaMock.branchCategoryAccess.create).toHaveBeenCalledWith({
        data: { branchId: BRANCH_A_ID, categoryId: CATEGORY_ID, subcategories: { create: [] } },
      });
    });

    it('does NOT re-grant or touch the offers* flag for a category the vendor already holds', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([serviceGrantFixture]); // already granted
      prismaMock.branchCategoryAccess.create.mockResolvedValue({});
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        { id: 'bca-1', branchId: BRANCH_A_ID, categoryId: CATEGORY_ID, category: serviceCategoryFixture, subcategories: [] },
      ]);

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [] }] });

      expect(res.status).toBe(200);
      expect(prismaMock.vendorCategoryAccess.createMany).not.toHaveBeenCalled();
      expect(prismaMock.member.update).not.toHaveBeenCalled();
    });

    it('rejects a category whose type is PRODUCT — Product never flows through branch-level access (it stays on the standalone Product Categories grant)', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [PRODUCT_CATEGORY_ID]: productCategoryFixture });

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: PRODUCT_CATEGORY_ID, subcategoryIds: [] }] });

      expect(res.status).toBe(422);
      expect(prismaMock.branchCategoryAccess.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a subcategory that does not actually belong to the given categoryId', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      // SUB_FACIAL_ID is a real category row, but its parent is SECOND_CATEGORY_ID, not CATEGORY_ID.
      mockCategoryLookup({
        [CATEGORY_ID]: serviceCategoryFixture,
        [SUB_FACIAL_ID]: { ...subFacialFixture, parentId: SECOND_CATEGORY_ID },
      });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([serviceGrantFixture]);

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [SUB_FACIAL_ID] }] });

      expect(res.status).toBe(422);
      expect(prismaMock.branchCategoryAccess.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a subcategory row directly (not a top-level category) passed as the mapping\'s own categoryId', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [SUB_MASSAGE_ID]: subMassageFixture }); // parentId set -> not top-level

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: SUB_MASSAGE_ID, subcategoryIds: [] }] });

      expect(res.status).toBe(422);
    });

    it("403s (not 404) saving when the branch exists but belongs to a different vendor than the URL claims", async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);
      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [] });
      expect(res.status).toBe(403);
      expect(prismaMock.branchCategoryAccess.deleteMany).not.toHaveBeenCalled();
    });

    it('403s without members:edit', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:view']);
      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [] });
      expect(res.status).toBe(403);
    });

    it('an empty mappings array wipes the branch\'s entire mapping (deleteMany, no create)', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([]);
      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [] });
      expect(res.status).toBe(200);
      expect(prismaMock.branchCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { branchId: BRANCH_A_ID } });
      expect(prismaMock.branchCategoryAccess.create).not.toHaveBeenCalled();
    });

    // "Removing a category mapping cascades its subcategory mappings": this is the replace-the-
    // full-set pattern — the branch previously had CATEGORY_ID + SECOND_CATEGORY_ID mapped; a PUT
    // that now only lists SECOND_CATEGORY_ID wipes everything (relying on the DB's own
    // `onDelete: Cascade` from BranchCategoryAccess -> BranchSubcategoryAccess to take
    // CATEGORY_ID's subcategory rows with it) and recreates only what's still listed.
    it("dropping a previously-mapped category from the new mappings array cascades away its subcategories (replace-the-full-set)", async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [SECOND_CATEGORY_ID]: secondCategoryFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([secondCategoryGrantFixture]);
      prismaMock.branchCategoryAccess.create.mockResolvedValue({}); // reset — a prior test in this file left this rejecting
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        { id: 'bca-2', branchId: BRANCH_A_ID, categoryId: SECOND_CATEGORY_ID, category: secondCategoryFixture, subcategories: [] },
      ]);

      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: SECOND_CATEGORY_ID, subcategoryIds: [] }] });

      expect(res.status).toBe(200);
      // Full wipe first (this is what actually cascades CATEGORY_ID's now-dropped subcategory rows away).
      expect(prismaMock.branchCategoryAccess.deleteMany).toHaveBeenCalledWith({ where: { branchId: BRANCH_A_ID } });
      // Only the still-listed category is recreated — CATEGORY_ID is gone entirely.
      expect(prismaMock.branchCategoryAccess.create).toHaveBeenCalledOnce();
      expect(prismaMock.branchCategoryAccess.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: SECOND_CATEGORY_ID }) }),
      );
      expect(prismaMock.branchCategoryAccess.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoryId: CATEGORY_ID }) }),
      );
    });

    // "Removing just one subcategory mapping leaves the rest intact": the category itself stays
    // mapped, only one of its two previously-enabled subcategories is dropped from this save.
    it('dropping one subcategory from an otherwise-unchanged category mapping leaves the other subcategory intact', async () => {
      resolveMock.mockResolvedValue(['vendors.branches:edit']);
      mockCategoryLookup({ [CATEGORY_ID]: serviceCategoryFixture, [SUB_MASSAGE_ID]: subMassageFixture });
      prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([serviceGrantFixture]);
      prismaMock.branchCategoryAccess.create.mockResolvedValue({}); // reset — a prior test in this file left this rejecting
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        {
          id: 'bca-1',
          branchId: BRANCH_A_ID,
          categoryId: CATEGORY_ID,
          category: serviceCategoryFixture,
          subcategories: [{ id: 'bsa-1', subcategoryId: SUB_MASSAGE_ID, subcategory: subMassageFixture }],
        },
      ]);

      // Previously both SUB_MASSAGE_ID and SUB_FACIAL_ID were enabled; this save only re-submits
      // SUB_MASSAGE_ID, dropping SUB_FACIAL_ID.
      const res = await request(app)
        .put(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .send({ mappings: [{ categoryId: CATEGORY_ID, subcategoryIds: [SUB_MASSAGE_ID] }] });

      expect(res.status).toBe(200);
      expect(prismaMock.branchCategoryAccess.create).toHaveBeenCalledWith({
        data: { branchId: BRANCH_A_ID, categoryId: CATEGORY_ID, subcategories: { create: [{ subcategoryId: SUB_MASSAGE_ID }] } },
      });
      expect(res.body.data[0].subcategories).toHaveLength(1);
      expect(res.body.data[0].subcategories[0].subcategoryId).toBe(SUB_MASSAGE_ID);
    });
  });

  describe('GET /me/branches/:branchId/category-access (self-service mirror)', () => {
    it("returns the caller's own branch mapping", async () => {
      resolveMock.mockResolvedValue(['members:custom']);
      prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.branchCategoryAccess.findMany.mockResolvedValue([
        { id: 'bca-1', branchId: BRANCH_A_ID, categoryId: CATEGORY_ID, category: serviceCategoryFixture, subcategories: [] },
      ]);
      const res = await request(app)
        .get(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    // The spec draft expected 404 here too ("never confirm existence"); verified against the
    // actual implementation instead of assumed — same `getBranchScopedOrThrow` contract as the
    // admin route above, so this is 403 (branch exists, wrong vendor), not 404.
    it("403s (not 404) when a vendor tries to read another vendor's branch via this route", async () => {
      resolveMock.mockResolvedValue(['members:custom']);
      prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
      prismaMock.branch.findUnique.mockResolvedValue(branchBFixture); // belongs to VENDOR_B
      const res = await request(app)
        .get(`/api/v1/vendors/me/branches/${BRANCH_B_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
      expect(res.status).toBe(403);
    });

    it('404s when the branch does not exist at all', async () => {
      resolveMock.mockResolvedValue(['members:custom']);
      prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
      prismaMock.branch.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .get(`/api/v1/vendors/me/branches/${BRANCH_B_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
      expect(res.status).toBe(404);
    });

    it('returns 403 with no members:custom permission', async () => {
      resolveMock.mockResolvedValue([]);
      const res = await request(app)
        .get(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/category-access`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
      expect(res.status).toBe(403);
    });
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
    resolveMock.mockResolvedValue(['products:create', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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

  it('creates a product with no category grant and saves isNew and isFeatured (D10)', async () => {
    resolveMock.mockResolvedValue(['products:create', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PRODUCT_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors/me/products')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ ...productBody, isNew: true, isFeatured: true });
    expect(res.status).toBe(201);
    expect(res.body.data.isNew).toBe(true);
    expect(res.body.data.isFeatured).toBe(true);
  });

  it('rejects creating a product in a non-PRODUCT category', async () => {
    resolveMock.mockResolvedValue(['products:create', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.category.findUnique.mockResolvedValue({ ...productCategoryFixture, type: 'SERVICE' });
    const res = await request(app)
      .post('/api/v1/vendors/me/products')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(productBody);
    expect(res.status).toBe(422);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it("a vendor cannot update another vendor's product", async () => {
    resolveMock.mockResolvedValue(['products:edit', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_B_ID });
    const res = await request(app)
      .patch(`/api/v1/vendors/me/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  /**
   * Regression for the cross-vendor Product write hole: the admin-on-behalf `/:vendorId/products*`
   * routes used to gate on plain `products:edit/create/delete` — the SAME permission key a vendor
   * needs for its own self-service `/vendors/me/products*` — instead of `members:edit/create/
   * delete` like Branch/Deal/Therapist's admin-on-behalf routes already do. A vendor holding only
   * `products:*` (never `vendors:*`) could therefore call `/vendors/{OTHER_VENDOR_ID}/products/...`
   * directly and write another vendor's catalog. Now gated on `vendors:*`, which the `vendor` role
   * never holds (see seed.ts) — only `members:custom` for its own scoped self-service routes.
   */
  it("a vendor holding only 'products:edit' (no 'members:edit') cannot reach the admin-on-behalf route to hijack another vendor's product", async () => {
    resolveMock.mockResolvedValue(['products:edit', 'products:create', 'products:delete', 'members:custom']);
    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_B_ID}/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("...and is likewise blocked from creating or deleting another vendor's product via the admin-on-behalf route", async () => {
    resolveMock.mockResolvedValue(['products:edit', 'products:create', 'products:delete', 'members:custom']);
    const createRes = await request(app)
      .post(`/api/v1/vendors/${VENDOR_B_ID}/products`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(productBody);
    expect(createRes.status).toBe(403);
    expect(prismaMock.product.create).not.toHaveBeenCalled();

    const deleteRes = await request(app)
      .delete(`/api/v1/vendors/${VENDOR_B_ID}/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(deleteRes.status).toBe(403);
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when a double-submit races past the app-layer slug check and hits the DB unique constraint', async () => {
    resolveMock.mockResolvedValue(['products:create', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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
    resolveMock.mockResolvedValue(['vendors.products:create']);
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
    resolveMock.mockResolvedValue(['products:delete', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.delete.mockResolvedValue(productFixture);
    const res = await request(app)
      .delete(`/api/v1/vendors/me/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
  });

  // Regression guard: Product is NOT branch-scoped at all (no branchId param on any Product
  // route, unlike Deal/Therapist) — this feature must not have silently added a branch-category
  // gate to Product create/update. Same vendor-level-only validation, no new required fields, no
  // new rejection path.
  it('regression: Product create/update never queries BranchCategoryAccess/BranchSubcategoryAccess at all — only the vendor-level PRODUCT grant applies, unchanged', async () => {
    resolveMock.mockResolvedValue(['products:create', 'members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PRODUCT_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/vendors/me/products')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send(productBody);
    expect(res.status).toBe(201);
    expect(prismaMock.branchCategoryAccess.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.branchSubcategoryAccess.findUnique).not.toHaveBeenCalled();

    resolveMock.mockResolvedValue(['products:edit', 'members:custom']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.update.mockResolvedValue({ ...productFixture, name: 'Renamed Serum' });
    const updateRes = await request(app)
      .patch(`/api/v1/vendors/me/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ name: 'Renamed Serum' });
    expect(updateRes.status).toBe(200);
    expect(prismaMock.branchCategoryAccess.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.branchSubcategoryAccess.findUnique).not.toHaveBeenCalled();
  });
});

describe('Therapist specializationCategoryId (category-access gate)', () => {
  const THERAPY_CATEGORY_ID = 'b5b5b5b5-0000-4000-8000-00000000000e';
  const therapyCategoryFixture = { id: THERAPY_CATEGORY_ID, name: 'Deep Tissue', parentId: null, type: 'THERAPY' };
  const therapyGrantFixture = { id: 'grant-therapy', vendorId: VENDOR_A_ID, categoryId: THERAPY_CATEGORY_ID };
  // Branch-level counterpart (BranchCategoryAccess) — see branchServiceGrantFixture's own comment above.
  const branchTherapyGrantFixture = { id: 'branch-grant-therapy', branchId: BRANCH_A_ID, categoryId: THERAPY_CATEGORY_ID };

  it('creates a therapist with a granted THERAPY specializationCategoryId', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.category.findUnique.mockResolvedValue(therapyCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(therapyGrantFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchTherapyGrantFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    prismaMock.therapist.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'therapist-3', ...data }));

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_CATEGORY_ID });

    expect(res.status).toBe(201);
  });

  it('rejects a therapist specializationCategoryId the vendor was not granted', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
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

  // Branch-level counterpart of the two tests above — the vendor holds a vendor-wide grant, but
  // the BRANCH itself has no BranchCategoryAccess mapping for it at all.
  it('rejects a therapist specializationCategoryId the vendor holds but this branch has never been mapped to', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.category.findUnique.mockResolvedValue(therapyCategoryFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(therapyGrantFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(null); // branch never mapped to this THERAPY category
    prismaMock.therapist.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_CATEGORY_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });

  /**
   * `Therapist.specializationCategoryId` may point at any tree depth (unlike Deal's split
   * categoryId/subcategoryId columns — see `assertBranchHasSpecializationCategoryAccess`'s own
   * doc comment in vendor.service.ts): a TOP-LEVEL pick is validated only against
   * `assertBranchHasCategoryAccess` (the branch-subcategory check must never even run for it); a
   * SUBCATEGORY-TIER pick is validated against BOTH the category's own branch access AND that
   * specific subcategory's branch access.
   */
  describe('specializationCategoryId at different tree depths', () => {
    const THERAPY_SUB_ID = 'b6b6b6b6-0000-4000-8000-000000000013';
    const therapySubFixture = { id: THERAPY_SUB_ID, name: 'Sports Massage', parentId: THERAPY_CATEGORY_ID, type: null };
    const branchTherapySubGrantFixture = { id: 'bsa-therapy', branchCategoryAccessId: branchTherapyGrantFixture.id, subcategoryId: THERAPY_SUB_ID };

    function mockCategoryLookup(byId: Record<string, unknown>) {
      prismaMock.category.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(byId[where.id] ?? null),
      );
    }

    beforeEach(() => {
      resolveMock.mockResolvedValue(['members:custom']);
      prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
      prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
      prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(therapyGrantFixture);
      prismaMock.therapist.findFirst.mockResolvedValue(null);
      prismaMock.therapist.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'therapist-tier', ...data }));
    });

    it('a top-level pick is validated ONLY against assertBranchHasCategoryAccess — the subcategory check never runs', async () => {
      mockCategoryLookup({ [THERAPY_CATEGORY_ID]: therapyCategoryFixture });
      prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchTherapyGrantFixture);

      const res = await request(app)
        .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
        .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_CATEGORY_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.branchSubcategoryAccess.findUnique).not.toHaveBeenCalled();
    });

    it('a subcategory-tier pick is validated against BOTH the category and the subcategory branch access — passes when both are mapped', async () => {
      mockCategoryLookup({ [THERAPY_CATEGORY_ID]: therapyCategoryFixture, [THERAPY_SUB_ID]: therapySubFixture });
      prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchTherapyGrantFixture);
      prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue(branchTherapySubGrantFixture);

      const res = await request(app)
        .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
        .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_SUB_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.branchSubcategoryAccess.findUnique).toHaveBeenCalledWith({
        where: { branchCategoryAccessId_subcategoryId: { branchCategoryAccessId: branchTherapyGrantFixture.id, subcategoryId: THERAPY_SUB_ID } },
      });
    });

    it('a subcategory-tier pick is rejected when the category itself is branch-mapped but this specific subcategory was never enabled', async () => {
      mockCategoryLookup({ [THERAPY_CATEGORY_ID]: therapyCategoryFixture, [THERAPY_SUB_ID]: therapySubFixture });
      prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchTherapyGrantFixture);
      prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue(null); // never explicitly enabled

      const res = await request(app)
        .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/therapists`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
        .send({ therapistType: 'Massage Therapist', personName: 'Suresh Chandra', specializationCategoryId: THERAPY_SUB_ID });

      expect(res.status).toBe(422);
      expect(prismaMock.therapist.create).not.toHaveBeenCalled();
    });

    it('updateTherapist re-validates the same branch-level gate — rejects an update to a subcategory never enabled on the therapist\'s own branch', async () => {
      const THERAPIST_ID = 'therapist-update-1';
      prismaMock.therapist.findUnique.mockResolvedValue({ id: THERAPIST_ID, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID });
      mockCategoryLookup({ [THERAPY_CATEGORY_ID]: therapyCategoryFixture, [THERAPY_SUB_ID]: therapySubFixture });
      prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(branchTherapyGrantFixture);
      prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/vendors/me/therapists/${THERAPIST_ID}`)
        .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
        .send({ specializationCategoryId: THERAPY_SUB_ID });

      expect(res.status).toBe(422);
      expect(prismaMock.therapist.update).not.toHaveBeenCalled();
    });
  });
});

describe('Therapist (admin-on-behalf — mirrors Branch/Deal exact admin split)', () => {
  const THERAPIST_A_ID = 'e1e1e1e1-0000-4000-8000-00000000000f';
  const therapistBody = { therapistType: 'Legs Therapist', personName: 'Ramesh Kumar' };
  const therapistAFixture = { id: THERAPIST_A_ID, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, ...therapistBody, isActive: true };

  it('admin can create a therapist on behalf of a vendor via /vendors/:vendorId/branches/:branchId/therapists', async () => {
    resolveMock.mockResolvedValue(['vendors.therapists:create']);
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
    resolveMock.mockResolvedValue(['vendors.therapists:create']);
    prismaMock.branch.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(therapistBody);

    expect(res.status).toBe(404);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });

  it('403s creating a therapist when the branch exists but under a different vendor than the URL claims', async () => {
    resolveMock.mockResolvedValue(['vendors.therapists:create']);
    prismaMock.branch.findUnique.mockResolvedValue(branchBFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/branches/${BRANCH_B_ID}/therapists`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send(therapistBody);

    expect(res.status).toBe(403);
    expect(prismaMock.therapist.create).not.toHaveBeenCalled();
  });

  it('admin can update a therapist on behalf of a vendor via /vendors/:vendorId/therapists/:therapistId', async () => {
    resolveMock.mockResolvedValue(['vendors.therapists:edit']);
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
    resolveMock.mockResolvedValue(['vendors.therapists:edit']);
    prismaMock.therapist.findUnique.mockResolvedValue({ ...therapistAFixture, vendorId: VENDOR_B_ID });

    const res = await request(app)
      .patch(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ personName: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(prismaMock.therapist.update).not.toHaveBeenCalled();
  });

  it('admin can set a therapist status on behalf of a vendor via /vendors/:vendorId/therapists/:therapistId/status', async () => {
    resolveMock.mockResolvedValue(['vendors.therapists:status_change']);
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
    resolveMock.mockResolvedValue(['vendors.therapists:create']);
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
      resolveMock.mockResolvedValue(['vendors.therapists:edit']);
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
      resolveMock.mockResolvedValue(['vendors.therapists:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      prismaMock.therapistImage.findUnique.mockResolvedValue({ id: '1b1b1b1b-0000-4000-8000-0000000000b1', therapistId: THERAPIST_A_ID, isPrimary: false, storageKey: 'therapists/x/a.jpg' });
      prismaMock.therapistImage.delete.mockResolvedValue({ id: '1b1b1b1b-0000-4000-8000-0000000000b1' });
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/images/1b1b1b1b-0000-4000-8000-0000000000b1`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(200);
    });

    it('POST /:vendorId/therapists/:therapistId/video uploads successfully', async () => {
      resolveMock.mockResolvedValue(['vendors.therapists:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
      prismaMock.therapistVideo.upsert.mockResolvedValue({ id: 'tvid-1', therapistId: THERAPIST_A_ID, storageKey: 'therapists/x/v.mp4' });
      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/video`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .attach('file', validMp4(), 'clip.mp4');
      expect(res.status).toBe(201);
    });

    it('404s (not a raw 500) uploading media for a therapist that does not belong to the URL vendor', async () => {
      resolveMock.mockResolvedValue(['vendors.therapists:edit']);
      prismaMock.therapist.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .post(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}/images`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
        .attach('file', validJpeg(), 'photo.jpg');
      expect(res.status).toBe(404);
    });

    it('403s without members:edit', async () => {
      resolveMock.mockResolvedValue(['vendors.therapists:view']);
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
      resolveMock.mockResolvedValue(['vendors.therapists:delete']);
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
      resolveMock.mockResolvedValue(['vendors.therapists:delete']);
      prismaMock.therapist.findUnique.mockResolvedValue({ ...therapistAFixture, vendorId: VENDOR_B_ID });
      const res = await request(app)
        .delete(`/api/v1/vendors/${VENDOR_A_ID}/therapists/${THERAPIST_A_ID}`)
        .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
      expect(res.status).toBe(403);
      expect(prismaMock.therapist.delete).not.toHaveBeenCalled();
    });

    it('returns a clean 409 (not a raw 500) when the therapist has real order/cart history blocking the delete', async () => {
      resolveMock.mockResolvedValue(['vendors.therapists:delete']);
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

    it('403s without members:delete', async () => {
      resolveMock.mockResolvedValue(['vendors.therapists:view']);
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
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture); // getMyVendorOrThrow -> vendor A
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

describe('GET /api/v1/vendors/me/customers — member with no business record', () => {
  it('returns an empty list instead of an error', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/vendors/me/customers')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

describe('vendors routes — malformed ids', () => {
  it('returns 422 for a non-uuid id instead of reaching the database', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .patch('/api/v1/vendors/me/branches/not-a-uuid')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['member'] }))
      .send({ name: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.branchId).toBeDefined();
  });
});
