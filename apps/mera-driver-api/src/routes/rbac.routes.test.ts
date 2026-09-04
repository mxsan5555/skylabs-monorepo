import request from 'supertest';
import { randomUUID } from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

// Imported after the mock so every service under `../services/*` resolves against
// the mocked Prisma client.
import { app } from '../app';
import { signAccessToken } from '../lib/jwt';
import { invalidatePermissionCache } from '../services/permission.service';

const SUPER_ADMIN_PERMISSIONS = [
  'rbac.roles:view',
  'rbac.roles:create',
  'rbac.roles:edit',
  'rbac.roles:delete',
  'rbac.roles:status_change',
  'rbac.users:view',
  'rbac.users:create',
  'rbac.users:edit',
  'rbac.users:delete',
  'rbac.users:assign',
  'rbac.users:status_change',
  'rbac.audit-logs:view',
];

function grant(...keys: string[]) {
  mockPrisma.rolePermission.findMany.mockResolvedValue(keys.map((key) => ({ permission: { key } })));
}

function tokenFor(roles: string[], sub = 'caller-1') {
  return signAccessToken({ sub, roles, app: 'mera-driver' });
}

const superAdminToken = () => {
  grant(...SUPER_ADMIN_PERMISSIONS);
  return tokenFor(['super_admin']);
};

const ROLE_ROW = {
  id: 'role-1',
  key: 'fleet_manager',
  name: 'Fleet Manager',
  description: null,
  isSystem: false,
  isSuperAdmin: false,
  isActive: true,
  createdAt: new Date('2026-01-01').toISOString(),
};

describe('rbac.routes', () => {
  beforeEach(() => {
    resetPrismaMock();
    invalidatePermissionCache();
    // Every write path writes an audit log row — stub it so tests don't need to
    // repeat this in each case.
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  // -------------------------------------------------------------------------
  // Roles CRUD
  // -------------------------------------------------------------------------

  describe('GET /rbac/roles', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/rbac/roles');
      expect(res.status).toBe(401);
    });

    it('returns 403 when the caller lacks rbac.roles:view', async () => {
      grant(); // no permissions at all
      const res = await request(app).get('/rbac/roles').set('Authorization', `Bearer ${tokenFor(['customer'])}`);
      expect(res.status).toBe(403);
    });

    it('returns the role list for an authorized caller', async () => {
      mockPrisma.role.findMany.mockResolvedValue([ROLE_ROW]);
      const res = await request(app).get('/rbac/roles').set('Authorization', `Bearer ${superAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [ROLE_ROW], error: null });
    });
  });

  describe('POST /rbac/roles', () => {
    const validBody = { key: 'fleet_manager', name: 'Fleet Manager' };

    it('returns 401 without a token', async () => {
      const res = await request(app).post('/rbac/roles').send(validBody);
      expect(res.status).toBe(401);
    });

    it('returns 403 when the caller lacks rbac.roles:create', async () => {
      grant('rbac.roles:view'); // view only, not create
      const res = await request(app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${tokenFor(['viewer'])}`)
        .send(validBody);
      expect(res.status).toBe(403);
    });

    it('returns 422 when the body fails validation (key not snake_case)', async () => {
      const res = await request(app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ key: 'Not Snake Case', name: 'x' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates the role and writes an audit log for an authorized caller', async () => {
      mockPrisma.role.create.mockResolvedValue(ROLE_ROW);
      const res = await request(app)
        .post('/rbac/roles')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ data: ROLE_ROW, error: null });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'role.create', targetId: ROLE_ROW.id }) }),
      );
    });
  });

  describe('PATCH /rbac/roles/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).patch('/rbac/roles/role-1').send({ name: 'x' });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the role does not exist', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .patch('/rbac/roles/missing')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'New name' });
      expect(res.status).toBe(404);
    });

    it('updates the role for an authorized caller', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(ROLE_ROW);
      mockPrisma.role.update.mockResolvedValue({ ...ROLE_ROW, name: 'New name' });
      const res = await request(app)
        .patch('/rbac/roles/role-1')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ name: 'New name' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New name');
    });
  });

  describe('DELETE /rbac/roles/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).delete('/rbac/roles/role-1');
      expect(res.status).toBe(401);
    });

    it('returns 422 when the role is a system role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ ...ROLE_ROW, isSystem: true });
      const res = await request(app)
        .delete('/rbac/roles/role-1')
        .set('Authorization', `Bearer ${superAdminToken()}`);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('deletes the role for an authorized caller', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(ROLE_ROW);
      mockPrisma.role.delete.mockResolvedValue(ROLE_ROW);
      const res = await request(app)
        .delete('/rbac/roles/role-1')
        .set('Authorization', `Bearer ${superAdminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { id: 'role-1' }, error: null });
    });
  });

  // -------------------------------------------------------------------------
  // Permission catalog — this is the endpoint the fix made DB-backed. Before the
  // fix every `permissionId` was `null`; now at least the seeded ones resolve to
  // a real `Permission.id`.
  // -------------------------------------------------------------------------

  describe('GET /rbac/permissions/catalog', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/rbac/permissions/catalog');
      expect(res.status).toBe(401);
    });

    it('returns 403 without rbac.roles:view', async () => {
      grant();
      const res = await request(app)
        .get('/rbac/permissions/catalog')
        .set('Authorization', `Bearer ${tokenFor(['customer'])}`);
      expect(res.status).toBe(403);
    });

    it('returns real permissionIds for seeded (menuKey, action) pairs, not null-only', async () => {
      // Only `drivers:view` has a real seeded Permission row.
      mockPrisma.permission.findMany.mockResolvedValue([
        { id: 'perm-uuid-drivers-view', key: 'drivers:view', label: 'View Drivers' },
      ]);

      const res = await request(app)
        .get('/rbac/permissions/catalog')
        .set('Authorization', `Bearer ${superAdminToken()}`);

      expect(res.status).toBe(200);
      const nodes: Array<{ menuKey: string; actions: Array<{ action: string; permissionId: string | null }> }> =
        res.body.data;

      const drivers = nodes.find((n) => n.menuKey === 'drivers');
      expect(drivers).toBeDefined();
      const viewAction = drivers!.actions.find((a) => a.action === 'view');
      expect(viewAction?.permissionId).toBe('perm-uuid-drivers-view');

      // Sanity: the catalog is not *only* nulls — at least one real id came through.
      const allPermissionIds = nodes.flatMap((n) => n.actions.map((a) => a.permissionId));
      expect(allPermissionIds.some((id) => id !== null)).toBe(true);

      // Un-seeded pairs still defensively report null rather than throwing.
      const editAction = drivers!.actions.find((a) => a.action === 'edit');
      expect(editAction?.permissionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // GET / PUT roles/:id/permissions — added in the same fix as the catalog.
  // -------------------------------------------------------------------------

  describe('GET /rbac/roles/:id/permissions', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/rbac/roles/role-1/permissions');
      expect(res.status).toBe(401);
    });

    it('returns the flat permissionIds currently granted to the role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(ROLE_ROW);
      mockPrisma.rolePermission.findMany.mockImplementation(async ({ where }: { where?: { roleId?: string } } = {}) => {
        // Distinguish the requirePermission gate's own findMany call (filters by `role.key`)
        // from this route's findMany call (filters by `roleId`).
        if (where?.roleId) {
          return [{ permissionId: 'perm-uuid-1' }, { permissionId: 'perm-uuid-2' }];
        }
        return SUPER_ADMIN_PERMISSIONS.map((key) => ({ permission: { key } }));
      });

      const res = await request(app)
        .get('/rbac/roles/role-1/permissions')
        .set('Authorization', `Bearer ${tokenFor(['super_admin'])}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { permissionIds: ['perm-uuid-1', 'perm-uuid-2'] }, error: null });
    });
  });

  describe('PUT /rbac/roles/:id/permissions', () => {
    const validIds = [randomUUID(), randomUUID()];

    it('returns 401 without a token', async () => {
      const res = await request(app).put('/rbac/roles/role-1/permissions').send({ permissionIds: validIds });
      expect(res.status).toBe(401);
    });

    it('returns 422 when permissionIds are not UUIDs', async () => {
      const res = await request(app)
        .put('/rbac/roles/role-1/permissions')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ permissionIds: ['not-a-uuid'] });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 422 when a permissionId does not exist in the catalog', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(ROLE_ROW);
      mockPrisma.permission.count.mockResolvedValue(1); // caller sent 2, only 1 is real
      const res = await request(app)
        .put('/rbac/roles/role-1/permissions')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ permissionIds: validIds });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('replaces the role grant set and writes an audit log for a valid request', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(ROLE_ROW);
      mockPrisma.permission.count.mockResolvedValue(validIds.length);
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValue({ count: validIds.length });
      mockPrisma.rolePermission.findMany.mockImplementation(async ({ where }: { where?: { roleId?: string } } = {}) => {
        if (where?.roleId) {
          return validIds.map((permissionId) => ({ roleId: 'role-1', permissionId }));
        }
        return SUPER_ADMIN_PERMISSIONS.map((key) => ({ permission: { key } }));
      });

      const res = await request(app)
        .put('/rbac/roles/role-1/permissions')
        .set('Authorization', `Bearer ${superAdminToken()}`)
        .send({ permissionIds: validIds });

      expect(res.status).toBe(200);
      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'role-1' } });
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: validIds.map((permissionId) => ({ roleId: 'role-1', permissionId })),
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'role.permissions.set', targetId: 'role-1' }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Bootstrap — authenticated, any role, no extra permission gate.
  // -------------------------------------------------------------------------

  describe('GET /rbac/bootstrap', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/rbac/bootstrap');
      expect(res.status).toBe(401);
    });

    it('returns the bootstrap payload for any authenticated user regardless of role', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.com',
        phone: null,
        status: 'active',
      });
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'role-driver', key: 'driver', name: 'Driver', isSuperAdmin: false, isActive: true },
      ]);
      mockPrisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'dashboard:view' } }]);
      mockPrisma.roleDashboardWidget.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/rbac/bootstrap')
        .set('Authorization', `Bearer ${tokenFor(['driver'], 'user-1')}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe('user-1');
      expect(res.body.data.permissions).toContain('dashboard:view');
      expect(res.body.data.roles).toEqual([{ id: 'role-driver', key: 'driver', name: 'Driver', isSuperAdmin: false }]);
    });

    it('returns 404 when the token subject no longer exists (e.g. deleted user)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const res = await request(app)
        .get('/rbac/bootstrap')
        .set('Authorization', `Bearer ${tokenFor(['driver'], 'ghost-user')}`);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Impersonation ("Login As")
  // -------------------------------------------------------------------------

  describe('POST /rbac/impersonate', () => {
    const targetUserId = randomUUID();

    it('returns 401 without a token', async () => {
      const res = await request(app).post('/rbac/impersonate').send({ targetUserId });
      expect(res.status).toBe(401);
    });

    it('returns 403 from the permission gate when the caller lacks rbac.users:assign', async () => {
      grant('rbac.users:view'); // view only, not assign
      const res = await request(app)
        .post('/rbac/impersonate')
        .set('Authorization', `Bearer ${tokenFor(['support'])}`)
        .send({ targetUserId });
      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('rbac.users:assign');
    });

    it('returns 422 when targetUserId is not a UUID', async () => {
      grant('rbac.users:assign');
      const res = await request(app)
        .post('/rbac/impersonate')
        .set('Authorization', `Bearer ${tokenFor(['super_admin'])}`)
        .send({ targetUserId: 'not-a-uuid' });
      expect(res.status).toBe(422);
    });

    it('returns 403 for a caller who has rbac.users:assign but is not superadmin-flagged', async () => {
      // Passes the generic `requirePermission` gate...
      grant('rbac.users:assign');
      // ...but the narrower service-level check looks at the caller's actual
      // Role.isSuperAdmin flag, which is false here.
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { isSuperAdmin: false, isActive: true } }]);

      const res = await request(app)
        .post('/rbac/impersonate')
        .set('Authorization', `Bearer ${tokenFor(['support'], 'support-1')}`)
        .send({ targetUserId });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toMatch(/SuperAdmin/);
    });

    it('issues a preview token for a SuperAdmin-flagged caller', async () => {
      grant('rbac.users:assign');
      mockPrisma.userRole.findMany
        // First call: impersonation.service checks the CALLER's roles for isSuperAdmin.
        .mockResolvedValueOnce([{ role: { isSuperAdmin: true, isActive: true } }])
        // Second call: impersonation.service reads the TARGET's role keys for the preview token.
        .mockResolvedValueOnce([{ role: { key: 'driver' } }]);
      mockPrisma.user.findFirst.mockResolvedValue({ id: targetUserId, deletedAt: null });
      mockPrisma.impersonationSession.create.mockResolvedValue({ id: 'session-1' });

      const res = await request(app)
        .post('/rbac/impersonate')
        .set('Authorization', `Bearer ${tokenFor(['super_admin'], 'admin-1')}`)
        .send({ targetUserId });

      expect(res.status).toBe(200);
      expect(typeof res.body.data.previewToken).toBe('string');
      expect(mockPrisma.impersonationSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ superAdminUserId: 'admin-1', targetUserId }) }),
      );
    });

    it('returns 404 when the target user does not exist', async () => {
      grant('rbac.users:assign');
      mockPrisma.userRole.findMany.mockResolvedValueOnce([{ role: { isSuperAdmin: true, isActive: true } }]);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/rbac/impersonate')
        .set('Authorization', `Bearer ${tokenFor(['super_admin'], 'admin-1')}`)
        .send({ targetUserId });

      expect(res.status).toBe(404);
    });
  });
});
