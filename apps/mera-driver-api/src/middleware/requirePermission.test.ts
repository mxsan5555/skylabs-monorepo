import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// Imported after the mock so `authenticate`/`requirePermission` (via
// `permission.service`) resolve against the mocked Prisma client.
import { authenticate } from './authenticate';
import { requirePermission } from './requirePermission';
import { invalidatePermissionCache } from '../services/permission.service';
import { signAccessToken } from '../lib/jwt';
import { errorHandler } from './errorHandler';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.get('/protected', authenticate, requirePermission('rbac.roles', 'view'), (_req, res) => {
    res.json({ data: { ok: true }, error: null });
  });
  app.use(errorHandler);
  return app;
}

describe('requirePermission middleware', () => {
  const app = buildTestApp();

  beforeEach(() => {
    resetPrismaMock();
    invalidatePermissionCache();
  });

  it('returns 401 when no bearer token is present', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
  });

  it('returns 401 for a malformed/invalid token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when the caller has a valid token but lacks the permission', async () => {
    mockPrisma.rolePermission.findMany.mockResolvedValue([]); // no grants for this role at all
    const token = signAccessToken({ sub: 'user-1', roles: ['customer'], app: 'mera-driver' });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      data: null,
      error: { code: 'FORBIDDEN', message: 'Missing permission rbac.roles:view' },
    });
  });

  it('calls next() and reaches the handler when the caller has the permission', async () => {
    mockPrisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'rbac.roles:view' } }]);
    const token = signAccessToken({ sub: 'user-2', roles: ['super_admin'], app: 'mera-driver' });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true }, error: null });
  });

  it('propagates a downstream error via next(err) as a 500 rather than swallowing it', async () => {
    mockPrisma.rolePermission.findMany.mockRejectedValue(new Error('DB unreachable'));
    const token = signAccessToken({ sub: 'user-3', roles: ['super_admin'], app: 'mera-driver' });

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SERVER_ERROR');
  });
});
