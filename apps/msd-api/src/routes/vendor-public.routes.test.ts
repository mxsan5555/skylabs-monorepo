import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from '../app';
import { prisma } from '../lib/prisma';

const prismaMock = vi.mocked(prisma, true);

// `vendorPublicRegisterRateLimiter` keys on ip+ownerEmail/ownerMobile and its in-memory store is
// not reset between tests in this file, so every test gets its own ownerEmail. Only the
// dedicated rate-limit test reuses one key on purpose.
let emailCounter = 0;
function uniqueBody(overrides: Record<string, unknown> = {}) {
  emailCounter += 1;
  return {
    businessName: 'Sunrise Spa',
    ownerFirstName: 'Asha',
    ownerLastName: 'Rao',
    ownerEmail: `asha${emailCounter}@example.com`,
    ownerMobile: '9876543210',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Public "Become a Vendor" registration is closed (decision D9).
 * Staff create every member, so the public endpoint refuses with 403 and a "contact our team"
 * message. It still exists so the `/become-vendor` page gets a clear answer, and it still sits
 * behind its rate limiter.
 */
describe('POST /api/v1/vendors/public/register', () => {
  it('refuses with 403 and the contact-our-team message, with no Authorization header', async () => {
    const res = await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(res.status).toBe(403);
    expect(res.body.data).toBeNull();
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe(
      'Member accounts are created by our team. Please contact us and we will set up your account.',
    );
  });

  it('creates no User, Member, role grant or audit row', async () => {
    await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses even a body that tries to send privileged fields', async () => {
    const res = await request(app)
      .post('/api/v1/vendors/public/register')
      .send(uniqueBody({ createdByUserId: 'admin-1', ownerUserId: 'admin-1', status: 'ACTIVE', role: 'admin' }));

    expect(res.status).toBe(403);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it('rate-limits repeated attempts for the same identity (5/10min, same wiring as otpRequestRateLimiter)', async () => {
    const body = uniqueBody(); // one fixed identity, reused for every call below on purpose
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/v1/vendors/public/register').send(body);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
