import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../providers/maps/googleMapsUrlResolver.provider', () => ({
  resolveGoogleMapsLocation: vi.fn(),
}));

import app from '../app';
import { prisma } from '../lib/prisma';

const prismaMock = vi.mocked(prisma, true);

const NEW_USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const VENDOR_ROLE = { id: 'vendor-role-id', key: 'vendor' };

// `vendorPublicRegisterRateLimiter` keys on ip+ownerEmail/ownerMobile and its in-memory store is
// NOT reset between tests in this file (it's a module-level singleton, same as
// otpRequestRateLimiter) — every test below gets its own unique ownerEmail so none of them share
// a rate-limit bucket with each other (mirrors how auth.routes.test.ts's own OTP tests each use a
// distinct `identifier` for the same reason; only the dedicated rate-limit test intentionally
// reuses one key to trip the limiter).
let emailCounter = 0;
function uniqueBody(overrides: Record<string, unknown> = {}) {
  emailCounter += 1;
  return {
    businessName: 'Sunrise Spa',
    businessEmail: 'contact@sunrisespa.example',
    ownerFirstName: 'Asha',
    ownerLastName: 'Rao',
    ownerEmail: `asha${emailCounter}@example.com`,
    ownerMobile: '9876543210',
    address: '221B Baker Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.role.findUnique.mockResolvedValue(VENDOR_ROLE);
  prismaMock.userRole.upsert.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.vendor.findUnique.mockResolvedValue(null); // no slug/owner conflict by default
  prismaMock.vendor.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'vendor-1', owner: { id: NEW_USER_ID, name: 'Asha Rao', roles: [] }, ...data }),
  );
});

/** Arranges the "neither identity matches an existing account" path: `createVendorOwner`'s two
 *  lookups (byEmail, byPhone) both miss, so it creates a brand-new User; `ensureVendorRoleAssigned`
 *  then calls `assignRole`, whose `getUserOrThrow` re-reads that SAME new user via a third
 *  `findFirst` call, so the mock must resolve it truthy from the third call on. */
function mockNoExistingMatchThenNewUser() {
  prismaMock.user.findFirst
    .mockResolvedValueOnce(null) // byEmail
    .mockResolvedValueOnce(null) // byPhone
    .mockResolvedValue({ id: NEW_USER_ID, roles: [] }); // assignRole's getUserOrThrow, on the new id
  prismaMock.user.create.mockResolvedValue({ id: NEW_USER_ID });
}

/**
 * Feature: Public "Become a Vendor" registration
 * Scenario: `POST /vendors/public/register` — genuinely unauthenticated, always creates a
 * brand-new owner User via `createVendorOwner` (never reuses/merges an existing account, even
 * an existing Customer's), and always lands PENDING_VERIFICATION with createdByUserId null.
 *
 * Given: an anonymous visitor submitting the public application form
 * When: POST /vendors/public/register is called
 * Then: no auth header is required; if the submitted email/phone match NO existing User, a
 *       fresh User + Vendor are created, PENDING_VERIFICATION, createdByUserId null; if either
 *       matches ANY existing User, the whole request is rejected with 409 and nothing is
 *       created; privileged fields (ownerUserId/status/role) can never be smuggled in because
 *       VendorSelfCreateSchema has no such fields to begin with
 *
 * Edge cases:
 * - an existing Customer applying with their own email/phone is rejected, not silently
 *   converted/merged into a vendor account
 * - rate limiting: the limiter itself (express-rate-limit, 5/10min) is exercised end-to-end by
 *   auth.routes.test.ts's own 429 test against the sibling `otpRequestRateLimiter` — identical
 *   library wiring, just a different keyGenerator. Re-driving 6 real requests here to re-prove
 *   the same third-party library trips at N+1 would be redundant, not more thorough; the
 *   dedicated test below instead confirms THIS route's keyGenerator is actually wired (reusing
 *   one identity twice and observing the second call still succeeds only because rate-limiting
 *   is per 5, then explicitly exhausting it).
 */
describe('POST /api/v1/vendors/public/register', () => {
  it('succeeds with NO Authorization header at all', async () => {
    mockNoExistingMatchThenNewUser();
    const res = await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_VERIFICATION');
    expect(res.body.data.createdByUserId).toBeNull();
  });

  it('always sets createdByUserId: null even if a caller tries to sneak one onto the body (stripped by the schema, not just ignored downstream)', async () => {
    mockNoExistingMatchThenNewUser();

    await request(app)
      .post('/api/v1/vendors/public/register')
      .send(uniqueBody({ createdByUserId: 'admin-1', ownerUserId: 'admin-1', status: 'ACTIVE', role: 'admin' }));

    const createCall = prismaMock.vendor.create.mock.calls[0][0];
    expect(createCall.data.createdByUserId).toBeNull();
    expect(createCall.data.status).toBe('PENDING_VERIFICATION');
    // ownerUserId on the Vendor row is the SERVER-resolved id, never whatever the body tried to send.
    expect(createCall.data.ownerUserId).toBe(NEW_USER_ID);
  });

  it('rejects with 409 and creates nothing when the submitted email/phone already belong to an existing account (an existing Customer applying is never converted/reused)', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: NEW_USER_ID, status: 'active', deletedAt: null, roles: [] });

    const res = await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
    expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
  });

  it('rejects with 409 when ownerEmail belongs to User A and ownerMobile belongs to a different User B', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce({ id: 'user-a', status: 'active', deletedAt: null, roles: [] })
      .mockResolvedValueOnce({ id: 'user-b', status: 'active', deletedAt: null, roles: [] });

    const res = await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(res.status).toBe(409);
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
  });

  it('rejects a body missing the required businessName (422, VendorSelfCreateSchema requires it unlike the admin schema)', async () => {
    // Zod schema validation (422) fails before the handler ever runs — no findFirst mock needed
    // (and none should be queued here: an unconsumed mockResolvedValueOnce would leak into the
    // next test's own queue, since vi.clearAllMocks() clears call history but not the once-queue).
    const body = uniqueBody();
    delete (body as Record<string, unknown>).businessName;
    const res = await request(app).post('/api/v1/vendors/public/register').send(body);
    expect(res.status).toBe(422);
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
  });

  it('rejects a body with neither ownerEmail nor ownerMobile (createVendorOwner requires at least one)', async () => {
    const body = uniqueBody();
    delete (body as Record<string, unknown>).ownerEmail;
    delete (body as Record<string, unknown>).ownerMobile;
    const res = await request(app).post('/api/v1/vendors/public/register').send(body);
    expect(res.status).toBe(422);
    expect(prismaMock.vendor.create).not.toHaveBeenCalled();
  });

  it('writes an audit log entry (vendor.public_register) attributed to the resolved owner', async () => {
    mockNoExistingMatchThenNewUser();

    await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'vendor.public_register', targetType: 'Vendor' }),
      }),
    );
  });

  it('rate-limits repeated registration attempts for the same identity (5/10min, same wiring as otpRequestRateLimiter)', async () => {
    mockNoExistingMatchThenNewUser();
    const body = uniqueBody(); // one fixed identity, reused for every call below on purpose
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/v1/vendors/public/register').send(body);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
