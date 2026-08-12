import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// requirePermission's only real dependency is the permission resolver (which itself hits
// Prisma) — mocking it directly keeps this a middleware-level test (auth boundary + gate
// logic) rather than re-testing role/permission resolution, which belongs to
// permission-resolver.service's own coverage via the route-level rbac.routes.test.ts.
vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

import app from '../app';
import { bearerFor } from '../test-utils/auth-test-utils';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);

describe('requirePermission (via GET /api/v1/customers, a stub route gated on customers:view)', () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  it('returns 401 with no Authorization header at all', async () => {
    const res = await request(app).get('/api/v1/customers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('returns 401 with a malformed/invalid token', async () => {
    const res = await request(app).get('/api/v1/customers').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 with a valid token whose roles resolve to no matching permission', async () => {
    resolveMock.mockResolvedValue(['dashboard:view']);
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ roles: ['customer'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('customers:view');
  });

  it('passes through (200) with a valid token whose roles resolve to the required permission', async () => {
    resolveMock.mockResolvedValue(['customers:view']);
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(resolveMock).toHaveBeenCalledWith(['admin']);
  });

  it('propagates a resolver failure as a 500 rather than hanging or crashing', async () => {
    resolveMock.mockRejectedValue(new Error('db unreachable'));
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', bearerFor({ roles: ['admin'] }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SERVER_ERROR');
  });
});
