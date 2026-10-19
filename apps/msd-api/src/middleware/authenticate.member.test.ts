import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { authenticate, isReadOnlyExempt } from './authenticate';
import { clearMemberAccessCache } from '../services/member-access.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);
const USER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';

function app() {
  const a = express();
  a.use(express.json());
  a.get('/api/v1/things', authenticate, (_req, res) => res.json({ ok: true }));
  a.post('/api/v1/things', authenticate, (_req, res) => res.json({ ok: true }));
  a.patch('/api/v1/things', authenticate, (_req, res) => res.json({ ok: true }));
  a.delete('/api/v1/things', authenticate, (_req, res) => res.json({ ok: true }));
  // Real paths from routes/auth.routes.ts mounted at /api/v1/auth in app.ts.
  a.post('/api/v1/auth/logout', authenticate, (_req, res) => res.json({ ok: true }));
  a.post('/api/v1/auth/logout-all', authenticate, (_req, res) => res.json({ ok: true }));
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.member.findUnique.mockReset();
  clearMemberAccessCache();
});

describe('authenticate: member lifecycle', () => {
  it('refuses a suspended member on any route with MEMBER_SUSPENDED and the reason', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: 'Documents not completed' } as never);
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MEMBER_SUSPENDED');
    expect(res.body.error.message).toContain('Documents not completed');
  });

  it('refuses a suspended member even on logout', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: null } as never);
    const res = await request(app()).post('/api/v1/auth/logout').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MEMBER_SUSPENDED');
  });

  it('refuses an archived member', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'ARCHIVED', statusReason: null } as never);
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MEMBER_SUSPENDED');
  });

  it('lets an inactive member read', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: 'Business pause' } as never);
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
  });

  it.each(['post', 'patch', 'delete'] as const)('blocks an inactive member from %s', async (method) => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: 'Business pause' } as never);
    const res = await request(app())[method]('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MEMBER_INACTIVE_READ_ONLY');
  });

  it('lets an inactive member log out and log out everywhere', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'INACTIVE', statusReason: null } as never);
    const bearer = bearerFor({ sub: USER_ID, roles: ['member'] });
    expect((await request(app()).post('/api/v1/auth/logout').set('Authorization', bearer)).status).toBe(200);
    expect((await request(app()).post('/api/v1/auth/logout-all').set('Authorization', bearer)).status).toBe(200);
  });

  it('lets an active member write', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'ACTIVE', statusReason: null } as never);
    const res = await request(app()).post('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
  });

  it('treats a member-role user with no member row as unrestricted', async () => {
    const res = await request(app()).post('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
  });

  it('still honours a token that carries the pre-rename `vendor` role key', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: null } as never);
    const res = await request(app()).get('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('does not look up a member for staff or customers', async () => {
    for (const roles of [['admin'], ['customer'], ['super_admin']]) {
      const res = await request(app()).post('/api/v1/things').set('Authorization', bearerFor({ sub: USER_ID, roles }));
      expect(res.status).toBe(200);
    }
    expect(prismaMock.member.findUnique).not.toHaveBeenCalled();
  });

  it('caches the member state, and clearing the cache picks up a status change', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ status: 'ACTIVE', statusReason: null } as never);
    const bearer = bearerFor({ sub: USER_ID, roles: ['member'] });
    expect((await request(app()).post('/api/v1/things').set('Authorization', bearer)).status).toBe(200);
    prismaMock.member.findUnique.mockResolvedValue({ status: 'SUSPENDED', statusReason: null } as never);
    expect((await request(app()).post('/api/v1/things').set('Authorization', bearer)).status).toBe(200);
    expect(prismaMock.member.findUnique).toHaveBeenCalledTimes(1);
    clearMemberAccessCache(USER_ID);
    expect((await request(app()).post('/api/v1/things').set('Authorization', bearer)).status).toBe(403);
  });
});

describe('isReadOnlyExempt', () => {
  it('allows read methods and the logout and refresh paths only', () => {
    expect(isReadOnlyExempt('GET', '/api/v1/things')).toBe(true);
    expect(isReadOnlyExempt('head', '/api/v1/things')).toBe(true);
    expect(isReadOnlyExempt('OPTIONS', '/api/v1/things')).toBe(true);
    expect(isReadOnlyExempt('POST', '/api/v1/auth/logout')).toBe(true);
    expect(isReadOnlyExempt('POST', '/api/v1/auth/logout-all')).toBe(true);
    expect(isReadOnlyExempt('POST', '/api/v1/auth/refresh?x=1')).toBe(true);
    expect(isReadOnlyExempt('POST', '/api/v1/things')).toBe(false);
    expect(isReadOnlyExempt('POST', '/api/v1/members/logout')).toBe(false);
  });
});
