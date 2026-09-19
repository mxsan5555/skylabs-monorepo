import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { authenticate } from './authenticate';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);

const USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';

function buildTestApp() {
  const app = express();
  app.get('/protected', authenticate, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: `authenticate` middleware's per-request status re-check
 * Scenario: this is the single choke point shared by every authenticated route in msd-api
 * (`router.use(authenticate)` in all 22 route files). Beyond verifying the JWT, it now re-reads
 * the CURRENT `User.status`/`deletedAt` on every request — closing the gap where an
 * already-issued access token would otherwise keep working unchanged until its own natural
 * (15-minute) expiry, even after the account was deactivated/suspended/soft-deleted in the
 * meantime.
 *
 * Given: a previously-issued, still cryptographically-valid access token
 * When: the account behind it is suspended/deactivated/soft-deleted AFTER the token was issued,
 *       and the SAME token is presented again on a later request
 * Then: that later request is rejected 403 FORBIDDEN — the crux scenario for this whole feature
 *
 * Edge cases:
 * - a soft-deleted user (deletedAt set) is rejected the same way, even if status is still 'active'
 * - a user row that no longer exists at all (hard-deleted) is rejected, not a 500
 * - an active, non-deleted user is let through completely unaffected (regression — this is the
 *   risk of a change that touches literally every authenticated route)
 * - no token / malformed token still 401s exactly as before (unchanged by this feature)
 */
describe('authenticate middleware — per-request User.status re-check', () => {
  it('rejects a request with no bearer token (401), before ever touching the DB', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid token (401), before ever touching the DB', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('THE CRUX SCENARIO: a token issued while the user was active is rejected on the very next request once the account is suspended in the meantime', async () => {
    const app = buildTestApp();
    const token = bearerFor({ sub: USER_ID, roles: ['customer'] });

    // First request: the account is still active — goes through fine.
    prismaMock.user.findUnique.mockResolvedValueOnce({ status: 'active', deletedAt: null });
    const first = await request(app).get('/protected').set('Authorization', token);
    expect(first.status).toBe(200);

    // Nothing about the token itself changed — but the account is suspended between requests.
    prismaMock.user.findUnique.mockResolvedValueOnce({ status: 'blocked', deletedAt: null });
    const second = await request(app).get('/protected').set('Authorization', token);
    expect(second.status).toBe(403);
    expect(second.body.error.message).toMatch(/disabled/i);
  });

  it('rejects an inactive account the same way', async () => {
    const app = buildTestApp();
    prismaMock.user.findUnique.mockResolvedValue({ status: 'inactive', deletedAt: null });
    const res = await request(app).get('/protected').set('Authorization', bearerFor({ sub: USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('rejects a soft-deleted user even if status still reads active', async () => {
    const app = buildTestApp();
    prismaMock.user.findUnique.mockResolvedValue({ status: 'active', deletedAt: new Date() });
    const res = await request(app).get('/protected').set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('rejects (403, not 500) when the user row no longer exists at all', async () => {
    const app = buildTestApp();
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/protected').set('Authorization', bearerFor({ sub: USER_ID, roles: ['customer'] }));
    expect(res.status).toBe(403);
  });

  it('lets an active, non-deleted user through completely unaffected (regression)', async () => {
    const app = buildTestApp();
    prismaMock.user.findUnique.mockResolvedValue({ status: 'active', deletedAt: null });
    const res = await request(app).get('/protected').set('Authorization', bearerFor({ sub: USER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe(USER_ID);
  });

  it('re-checks status via prisma.user.findUnique keyed on the token subject, selecting only status/deletedAt', async () => {
    const app = buildTestApp();
    prismaMock.user.findUnique.mockResolvedValue({ status: 'active', deletedAt: null });
    await request(app).get('/protected').set('Authorization', bearerFor({ sub: USER_ID, roles: ['customer'] }));
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: USER_ID }, select: { status: true, deletedAt: true } });
  });
});
