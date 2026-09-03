import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route + service integration tests: the real Express app, real requirePermission/can/
// filterMenuByPermissions logic, real role/user/bootstrap/impersonation services — only
// the Prisma boundary and the (separately-tested) permission resolver are mocked, per
// skylabs-testing.md's "mock at the DB boundary" convention for these middleware/route tests.
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

const ROLE_ID = '746d394b-7760-461a-8d4b-28d0e1c532f9';
const OTHER_ROLE_ID = '63710a3e-a748-4972-89db-503e9a6b1137';
const USER_ID = 'de770a11-3dce-4c98-b6e6-3c36e0aa0bb7';
const TARGET_USER_ID = '10d84f13-138d-47bb-9cae-d5a4f9ee5693';
const PERMISSION_ID = '066af73b-74ee-4857-bdad-2952cf3b1035';

const roleFixture = {
  id: ROLE_ID,
  key: 'sales_manager',
  name: 'Sales Manager',
  description: undefined,
  isSystem: false,
  isSuperAdmin: false,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/rbac/roles', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/rbac/roles');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller lacks rbac.roles:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/rbac/roles')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['customer'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the role list for a caller with rbac.roles:view', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    prismaMock.role.findMany.mockResolvedValue([roleFixture]);
    const res = await request(app)
      .get('/api/v1/rbac/roles')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ ...roleFixture, createdAt: roleFixture.createdAt.toISOString(), updatedAt: roleFixture.updatedAt.toISOString() }]);
    expect(res.body.error).toBeNull();
  });
});

describe('POST /api/v1/rbac/roles', () => {
  const validBody = { key: 'marketing_lead', name: 'Marketing Lead' };

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/rbac/roles').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 422 for an invalid body (bad key slug, missing name)', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:create']);
    const res = await request(app)
      .post('/api/v1/rbac/roles')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ key: 'Not A Slug!' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 201 with the created role for a valid body + permission', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:create']);
    prismaMock.role.findUnique.mockResolvedValue(null);
    prismaMock.role.create.mockResolvedValue({ ...roleFixture, ...validBody });
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await request(app)
      .post('/api/v1/rbac/roles')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe('marketing_lead');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 409 when the role key already exists', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:create']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    const res = await request(app)
      .post('/api/v1/rbac/roles')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /api/v1/rbac/users', () => {
  const validBody = { name: 'Nikita Sharma', email: 'nikita@example.com', roleIds: [ROLE_ID] };

  it('returns 409 (not a raw 500) when the email/phone unique constraint is hit at the DB, previously an unhandled P2002', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    prismaMock.role.count.mockResolvedValue(1);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app)
      .post('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('still returns 201 with the created user when the audit-log write itself fails', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    prismaMock.role.count.mockResolvedValue(1);
    prismaMock.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: TARGET_USER_ID, ...data, roles: [] }),
    );
    prismaMock.auditLog.create.mockRejectedValue(new Error('audit db unreachable'));
    const res = await request(app)
      .post('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(TARGET_USER_ID);
  });
});

describe('PATCH /api/v1/rbac/roles/:id', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).patch(`/api/v1/rbac/roles/${ROLE_ID}`).send({ name: 'New name' });
    expect(res.status).toBe(401);
  });

  it('returns 422 for a malformed :id route param', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:edit']);
    const res = await request(app)
      .patch('/api/v1/rbac/roles/not-a-uuid')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ name: 'New name' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 200 with the updated role', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:edit']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.role.update.mockResolvedValue({ ...roleFixture, name: 'New name' });
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await request(app)
      .patch(`/api/v1/rbac/roles/${ROLE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ name: 'New name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New name');
  });
});

describe('DELETE /api/v1/rbac/roles/:id', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).delete(`/api/v1/rbac/roles/${ROLE_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 without rbac.roles:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .delete(`/api/v1/rbac/roles/${ROLE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 and null data on a successful delete', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:delete']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.userRole.count.mockResolvedValue(0);
    prismaMock.rolePermission.deleteMany.mockResolvedValue({});
    prismaMock.roleDashboardWidget.deleteMany.mockResolvedValue({});
    prismaMock.role.delete.mockResolvedValue(roleFixture);
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await request(app)
      .delete(`/api/v1/rbac/roles/${ROLE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('returns 403 (FORBIDDEN) when deleting a system role', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:delete']);
    prismaMock.role.findUnique.mockResolvedValue({ ...roleFixture, isSystem: true });
    const res = await request(app)
      .delete(`/api/v1/rbac/roles/${ROLE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/rbac/permissions/catalog', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/rbac/permissions/catalog');
    expect(res.status).toBe(401);
  });

  it('returns 200 with the full msd menu x action catalog', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    prismaMock.permission.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/rbac/permissions/catalog')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.find((m: { menuKey: string }) => m.menuKey === 'rbac.roles')).toBeDefined();
  });
});

describe('GET /api/v1/rbac/roles/:id/permissions', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/v1/rbac/roles/${ROLE_ID}/permissions`);
    expect(res.status).toBe(401);
  });

  it('returns 422 for a malformed :id', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    const res = await request(app)
      .get('/api/v1/rbac/roles/not-a-uuid/permissions')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(422);
  });

  it('returns 200 with { permissionIds }', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.rolePermission.findMany.mockResolvedValue([{ permissionId: PERMISSION_ID }]);
    const res = await request(app)
      .get(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ permissionIds: [PERMISSION_ID] });
  });

  it('returns 404 when the role does not exist', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    prismaMock.role.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/rbac/roles/${OTHER_ROLE_ID}/permissions`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/rbac/roles/:id/permissions', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
      .send({ permissionIds: [PERMISSION_ID] });
    expect(res.status).toBe(401);
  });

  it('returns 422 when permissionIds contains a non-uuid entry', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:edit']);
    const res = await request(app)
      .put(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ permissionIds: ['not-a-uuid'] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 200 with the updated rolePermission rows on success', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:edit']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.permission.count.mockResolvedValue(1);
    prismaMock.rolePermission.deleteMany.mockResolvedValue({});
    prismaMock.rolePermission.createMany.mockResolvedValue({});
    prismaMock.rolePermission.findMany.mockResolvedValue([
      { roleId: ROLE_ID, permissionId: PERMISSION_ID, permission: { id: PERMISSION_ID, key: 'rbac.roles:view' } },
    ]);
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await request(app)
      .put(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ permissionIds: [PERMISSION_ID] });
    expect(res.status).toBe(200);
    expect(res.body.data[0].permissionId).toBe(PERMISSION_ID);
  });

  it('returns 422 when a permissionId does not exist in the catalog (service-level validation)', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:edit']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.permission.count.mockResolvedValue(0); // none of the submitted ids matched
    const res = await request(app)
      .put(`/api/v1/rbac/roles/${ROLE_ID}/permissions`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ permissionIds: [PERMISSION_ID] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/rbac/bootstrap', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/rbac/bootstrap');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user/roles/permissions/menu/dashboardWidgets for any authenticated user', async () => {
    resolveMock.mockResolvedValue(['dashboard:view']);
    prismaMock.user.findFirst.mockResolvedValue({
      id: USER_ID,
      name: 'Admin User',
      email: 'admin@test.com',
      phone: null,
      status: 'active',
    });
    prismaMock.role.findMany.mockResolvedValue([
      { id: ROLE_ID, key: 'admin', name: 'Admin', isSuperAdmin: false },
    ]);
    prismaMock.roleDashboardWidget.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/rbac/bootstrap')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(USER_ID);
    expect(res.body.data.permissions).toEqual(['dashboard:view']);
    // filterMenuByPermissions is the *real* implementation here — only "dashboard" is granted view.
    expect(res.body.data.menu.map((n: { id: string }) => n.id)).toEqual(['dashboard']);
  });

  it('returns 404 when the token subject no longer exists (e.g. deleted user)', async () => {
    resolveMock.mockResolvedValue([]);
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/rbac/bootstrap')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/rbac/impersonate', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/rbac/impersonate').send({ targetUserId: TARGET_USER_ID });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a caller without rbac.users:custom (a non-super-admin)', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view', 'rbac.users:edit']);
    const res = await request(app)
      .post('/api/v1/rbac/impersonate')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ targetUserId: TARGET_USER_ID });
    expect(res.status).toBe(403);
  });

  it('returns 422 for a non-uuid targetUserId', async () => {
    resolveMock.mockResolvedValue(['rbac.users:custom']);
    const res = await request(app)
      .post('/api/v1/rbac/impersonate')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ targetUserId: 'not-a-uuid' });
    expect(res.status).toBe(422);
  });

  it('returns 200 with a previewToken for a caller with rbac.users:custom', async () => {
    resolveMock.mockResolvedValue(['rbac.users:custom']);
    prismaMock.user.findFirst.mockResolvedValue({
      id: TARGET_USER_ID,
      roles: [{ role: { key: 'customer' } }],
    });
    prismaMock.impersonationSession.create.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    const res = await request(app)
      .post('/api/v1/rbac/impersonate')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ targetUserId: TARGET_USER_ID });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.previewToken).toBe('string');
  });

  it('returns 422 when a caller tries to impersonate themselves', async () => {
    resolveMock.mockResolvedValue(['rbac.users:custom']);
    const res = await request(app)
      .post('/api/v1/rbac/impersonate')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ targetUserId: USER_ID });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('yourself');
  });

  it('returns 404 when the target user does not exist', async () => {
    resolveMock.mockResolvedValue(['rbac.users:custom']);
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/rbac/impersonate')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ targetUserId: TARGET_USER_ID });
    expect(res.status).toBe(404);
  });
});
