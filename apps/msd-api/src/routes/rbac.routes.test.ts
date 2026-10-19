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
  invalidatePermissionCache: vi.fn(),
  isSuperAdminRoleSet: vi.fn().mockResolvedValue(false),
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

/**
 * Feature: User Management role filter + Superadmin exclusion (Vendor Validation/Permissions
 * audit, Phase 6). `listUsers` joins through `UserRole -> Role.key` for the `roleKey` filter and
 * excludes any Superadmin-flagged role's users from every call by default — Superadmin manages
 * their own profile via the separate `/rbac/users/me` surface (Phase 7), not as a row here.
 */
describe('GET /api/v1/rbac/users', () => {
  const nonSuperadminUser = {
    id: TARGET_USER_ID,
    name: 'Priya Vendor',
    email: 'priya@example.com',
    phone: null,
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    roles: [{ role: { id: ROLE_ID, key: 'vendor', name: 'Vendor' } }],
  };

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/rbac/users');
    expect(res.status).toBe(401);
  });

  it('excludes Superadmin-flagged users by default, never a role-key string compare', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findMany.mockResolvedValue([nonSuperadminUser]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ roles: { none: { role: { isSuperAdmin: true } } } }]),
        }),
      }),
    );
  });

  it('filters by roleKey via a UserRole -> Role.key join, never a client-supplied vendorId-style trust', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findMany.mockResolvedValue([nonSuperadminUser]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/rbac/users?roleKey=vendor')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ roles: { some: { role: { key: 'vendor' } } } }]),
        }),
      }),
    );
  });

  /**
   * The matrix's own-scoped "Logs (login history)" row applies to `lastLoginAt` in the staff
   * list too, not just the dedicated login-history endpoint — otherwise Admin's own-only Logs
   * permission would leak another user's login activity through this list response alone.
   */
  it('strips lastLoginAt for every OTHER user when the caller is not a genuine SuperAdmin', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findMany.mockResolvedValue([{ ...nonSuperadminUser, lastLoginAt: new Date('2026-05-01T00:00:00Z') }]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] })); // USER_ID !== TARGET_USER_ID
    expect(res.status).toBe(200);
    expect(res.body.data[0].lastLoginAt).toBeNull();
  });

  it('keeps lastLoginAt visible for a genuine SuperAdmin caller', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findMany.mockResolvedValue([{ ...nonSuperadminUser, lastLoginAt: new Date('2026-05-01T00:00:00Z') }]);
    prismaMock.user.count.mockResolvedValue(1);
    const { isSuperAdminRoleSet } = await import('../services/permission-resolver.service');
    vi.mocked(isSuperAdminRoleSet).mockResolvedValueOnce(true); // Once — `clearAllMocks` in beforeEach doesn't revert a persistent mockResolvedValue, and every other test in this file needs the default `false`.
    const res = await request(app)
      .get('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].lastLoginAt).not.toBeNull();
  });

  it('keeps lastLoginAt visible for the caller\'s own row within the list', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findMany.mockResolvedValue([{ ...nonSuperadminUser, id: USER_ID, lastLoginAt: new Date('2026-05-01T00:00:00Z') }]);
    prismaMock.user.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].lastLoginAt).not.toBeNull();
  });
});

/**
 * Feature: Staff Users detail/mutation endpoints must never become a back door onto an account
 * `listUsers` itself would exclude (customer-only, Vendor-owner, Superadmin) — `User Management
 * (Internal Staff)` task, section 3/5. `assertStaffUserOrThrow` is the single guard every
 * admin-on-behalf `:id` route calls before touching anything; these tests prove the guard
 * actually runs (404, never reaching the mutation) rather than merely existing in the source.
 */
describe('Staff Users admin-on-behalf routes reject an excluded account id', () => {
  it('GET /rbac/users/:id 404s and never calls getUserOrThrow\'s own findFirst a second time usefully', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findFirst.mockResolvedValue(null); // assertStaffUserOrThrow's own lookup
    const res = await request(app)
      .get(`/api/v1/rbac/users/${TARGET_USER_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(404);
  });

  it('GET /rbac/users/:id strips lastLoginAt for another user when the caller is not a genuine SuperAdmin', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findFirst
      .mockResolvedValueOnce({ id: TARGET_USER_ID }) // assertStaffUserOrThrow's own lookup
      .mockResolvedValueOnce({
        id: TARGET_USER_ID,
        name: 'Fellow Staff',
        email: 'staff@example.com',
        phone: null,
        status: 'active',
        lastLoginAt: new Date('2026-05-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        roles: [],
      });
    const res = await request(app)
      .get(`/api/v1/rbac/users/${TARGET_USER_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.lastLoginAt).toBeNull();
  });

  it('PATCH /rbac/users/:id 404s for an excluded account and never calls user.update', async () => {
    resolveMock.mockResolvedValue(['rbac.users:edit']);
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/rbac/users/${TARGET_USER_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ name: 'Should not apply' });
    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('PUT /rbac/users/:id/role 404s for an excluded account and never touches userRole', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ roleId: ROLE_ID });
    expect(res.status).toBe(404);
    expect(prismaMock.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('POST /rbac/users/:id/sessions/revoke-all 404s for an excluded account and never revokes anything', async () => {
    resolveMock.mockResolvedValue(['rbac.users:edit']);
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/rbac/users/${TARGET_USER_ID}/sessions/revoke-all`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(404);
    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Feature: "Logs (login history)" is own-scoped for every role except an actual Superadmin —
 * `GET /rbac/users/:id/login-history` must 404 (not merely 403 — don't confirm existence) when
 * a non-Superadmin caller with `rbac.users:view` (e.g. Admin) requests a DIFFERENT user's id,
 * while their OWN id (and any id, for a genuine Superadmin) still works.
 */
describe('GET /api/v1/rbac/users/:id/login-history — own-scoped unless Superadmin', () => {
  const staffFixture = {
    id: TARGET_USER_ID,
    name: 'Fellow Staff',
    email: 'staff@example.com',
    phone: null,
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('404s when Admin requests a DIFFERENT user\'s login history', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findFirst.mockResolvedValue(staffFixture); // passes assertStaffUserOrThrow
    const res = await request(app)
      .get(`/api/v1/rbac/users/${TARGET_USER_ID}/login-history`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(404);
    expect(prismaMock.loginHistory.findMany).not.toHaveBeenCalled();
  });

  it('succeeds when the caller requests their OWN login history (id === sub)', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findFirst.mockResolvedValue({ ...staffFixture, id: USER_ID });
    prismaMock.loginHistory.findMany.mockResolvedValue([]);
    prismaMock.loginHistory.count.mockResolvedValue(0);
    const res = await request(app)
      .get(`/api/v1/rbac/users/${USER_ID}/login-history`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
  });

  it('succeeds for a genuine Superadmin requesting a DIFFERENT user\'s login history', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    prismaMock.user.findFirst.mockResolvedValue(staffFixture);
    prismaMock.loginHistory.findMany.mockResolvedValue([]);
    prismaMock.loginHistory.count.mockResolvedValue(0);
    const { isSuperAdminRoleSet } = await import('../services/permission-resolver.service');
    vi.mocked(isSuperAdminRoleSet).mockResolvedValueOnce(true); // Once — `clearAllMocks` in beforeEach doesn't revert a persistent mockResolvedValue, and every other test in this file needs the default `false`.
    const res = await request(app)
      .get(`/api/v1/rbac/users/${TARGET_USER_ID}/login-history`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }));
    expect(res.status).toBe(200);
  });

  it('GET /rbac/users/me/login-history works with no rbac.users:* permission at all', async () => {
    resolveMock.mockResolvedValue([]); // Marketing/Sales/Support/Member — none of them hold rbac.users:*
    prismaMock.loginHistory.findMany.mockResolvedValue([]);
    prismaMock.loginHistory.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/api/v1/rbac/users/me/login-history')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['marketing'] }));
    expect(res.status).toBe(200);
  });
});

/**
 * Feature: Superadmin (and every other authenticated user's) own profile self-service (Vendor
 * Validation/Permissions audit, Phase 7). Authenticate-only — no `rbac.users:*` permission is
 * required, since every signed-in user (Superadmin included) must be able to view/edit their own
 * row. `UserUpdateSchema` has no `role`/`roleIds` field at all, so a role change can never be
 * smuggled through this route for any caller, Superadmin included — this is a blanket rule by
 * construction, not a Superadmin-specific carve-out.
 */
describe('GET/PATCH /api/v1/rbac/users/me', () => {
  const selfUser = {
    id: USER_ID,
    name: 'Self User',
    email: 'self@example.com',
    phone: null,
    status: 'active',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    roles: [{ role: { id: ROLE_ID, key: 'super_admin', name: 'Super Admin' } }],
  };

  it('GET returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/rbac/users/me');
    expect(res.status).toBe(401);
  });

  it('GET returns the caller\'s own row with no rbac.users:* permission granted at all', async () => {
    resolveMock.mockResolvedValue([]);
    prismaMock.user.findFirst.mockResolvedValue(selfUser);
    const res = await request(app)
      .get('/api/v1/rbac/users/me')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(USER_ID);
  });

  it('PATCH updates name/email/phone for a Superadmin caller with no rbac.users:* permission needed', async () => {
    resolveMock.mockResolvedValue([]);
    prismaMock.user.findFirst.mockResolvedValue(selfUser);
    prismaMock.user.update.mockResolvedValue({ ...selfUser, name: 'Updated Name' });
    const res = await request(app)
      .patch('/api/v1/rbac/users/me')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } }),
    );
  });

  it('PATCH silently ignores a roleIds field in the body — role can never be changed through this route', async () => {
    resolveMock.mockResolvedValue([]);
    prismaMock.user.findFirst.mockResolvedValue(selfUser);
    prismaMock.user.update.mockResolvedValue(selfUser);
    const res = await request(app)
      .patch('/api/v1/rbac/users/me')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ name: 'Self User', roleIds: [OTHER_ROLE_ID] });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ roleIds: expect.anything() }) }),
    );
  });
});

describe('POST /api/v1/rbac/users', () => {
  const validBody = { name: 'Nikita Sharma', email: 'nikita@example.com', roleId: ROLE_ID };

  it('returns 409 (not a raw 500) when the email/phone unique constraint is hit at the DB, previously an unhandled P2002', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
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
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
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

  /**
   * Section 8 regression guard: a staff user created/edited with a bare 10-digit phone must be
   * stored in the SAME normalized `+91XXXXXXXXXX` form `normalizeIdentifier()` resolves a real
   * OTP login to (`auth.routes.ts`'s `/otp/request`+`/otp/verify`) — otherwise "9889259224" (as
   * typed by an Admin here) and "+919889259224" (as normalized at login) would never match the
   * same `User.phone` row.
   */
  it('normalizes a bare 10-digit phone to +91XXXXXXXXXX before it ever reaches the service/DB', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.user.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: TARGET_USER_ID, ...data, roles: [] }),
    );
    const res = await request(app)
      .post('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ ...validBody, phone: '9889259224' });
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+919889259224' }) }),
    );
  });

  it('rejects a malformed phone (wrong digit count / leading digit) with a 422, never silently storing it as-is', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    const res = await request(app)
      .post('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ ...validBody, phone: '12345' });
    expect(res.status).toBe(422);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects a roleId resolving to Customer or Member — only eligible internal roles are assignable here', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    prismaMock.role.findUnique.mockResolvedValue({ ...roleFixture, key: 'vendor' });
    const res = await request(app)
      .post('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send(validBody);
    expect(res.status).toBe(422);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects a payload shaped for the old multi-role API (roleIds array) with 422, never silently accepting it', async () => {
    resolveMock.mockResolvedValue(['rbac.users:create']);
    const res = await request(app)
      .post('/api/v1/rbac/users')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ name: 'Nikita Sharma', email: 'nikita@example.com', roleIds: [ROLE_ID, OTHER_ROLE_ID] });
    expect(res.status).toBe(422);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/rbac/users/:id/role — atomic single-role replace', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`).send({ roleId: ROLE_ID });
    expect(res.status).toBe(401);
  });

  it('replaces the user\'s entire role set with exactly the new role (delete-then-create, never additive)', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findFirst
      .mockResolvedValueOnce({ id: TARGET_USER_ID }) // assertStaffUserOrThrow
      .mockResolvedValueOnce({ id: TARGET_USER_ID, roles: [{ role: { id: OTHER_ROLE_ID, key: 'sales', name: 'Sales' } }] }) // getUserOrThrow (before)
      .mockResolvedValueOnce({ id: TARGET_USER_ID, roles: [{ role: roleFixture }] }); // getUserOrThrow (after, inside setStaffUserRole)
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.userRole.deleteMany.mockResolvedValue({});
    prismaMock.userRole.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});

    const res = await request(app)
      .put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ roleId: ROLE_ID });

    expect(res.status).toBe(200);
    expect(prismaMock.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: TARGET_USER_ID } });
    expect(prismaMock.userRole.create).toHaveBeenCalledWith({ data: { userId: TARGET_USER_ID, roleId: ROLE_ID } });
  });

  it('rejects assigning the Customer role through staff user management', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID });
    prismaMock.role.findUnique.mockResolvedValue({ ...roleFixture, key: 'customer' });

    const res = await request(app)
      .put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ roleId: ROLE_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects assigning the Member (vendor) role through staff user management', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID });
    prismaMock.role.findUnique.mockResolvedValue({ ...roleFixture, key: 'vendor' });

    const res = await request(app)
      .put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ roleId: ROLE_ID });

    expect(res.status).toBe(422);
    expect(prismaMock.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a multi-role-shaped payload (roleIds array) with 422', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    const res = await request(app)
      .put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ roleIds: [ROLE_ID, OTHER_ROLE_ID] });
    expect(res.status).toBe(422);
  });

  it('returns 403 without rbac.users:assign (e.g. Admin has only rbac.users:view per the matrix)', async () => {
    resolveMock.mockResolvedValue(['rbac.users:view']);
    const res = await request(app)
      .put(`/api/v1/rbac/users/${TARGET_USER_ID}/role`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }))
      .send({ roleId: ROLE_ID });
    expect(res.status).toBe(403);
  });
});

describe('GET/PUT /api/v1/rbac/role-conflicts — legacy multi-role review', () => {
  it('GET returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/rbac/role-conflicts');
    expect(res.status).toBe(401);
  });

  it('GET returns every flagged account with its current roles', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: TARGET_USER_ID,
        name: 'Conflicted',
        email: 'c@example.com',
        phone: null,
        status: 'active',
        roles: [{ role: { id: ROLE_ID, key: 'customer', name: 'Customer' } }, { role: { id: OTHER_ROLE_ID, key: 'vendor', name: 'Member' } }],
        vendorProfile: null,
      },
    ]);
    const res = await request(app)
      .get('/api/v1/rbac/role-conflicts')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].roles.map((r: { key: string }) => r.key)).toEqual(['customer', 'vendor']);
  });

  it('PUT resolves a flagged account to the chosen role and clears the flag', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findFirst
      .mockResolvedValueOnce({ id: TARGET_USER_ID, roleConflict: true, roles: [] }) // getUserOrThrow — route-level "before" snapshot
      .mockResolvedValueOnce({ id: TARGET_USER_ID, roleConflict: true, roles: [] }) // getUserOrThrow — resolveAccountRoleConflict's own roleConflict check
      .mockResolvedValueOnce({ id: TARGET_USER_ID, roleConflict: false, roles: [{ role: { id: OTHER_ROLE_ID, key: 'vendor', name: 'Member' } }] }); // getUserOrThrow — final re-fetch for the response
    prismaMock.role.findUnique.mockResolvedValue({ ...roleFixture, key: 'vendor' });
    prismaMock.userRole.deleteMany.mockResolvedValue({});
    prismaMock.userRole.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});

    const res = await request(app)
      .put(`/api/v1/rbac/role-conflicts/${TARGET_USER_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ roleId: OTHER_ROLE_ID });

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TARGET_USER_ID }, data: { roleConflict: false } }),
    );
  });

  it('PUT rejects resolving an account that is not actually flagged', async () => {
    resolveMock.mockResolvedValue(['rbac.users:assign']);
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET_USER_ID, roleConflict: false });
    const res = await request(app)
      .put(`/api/v1/rbac/role-conflicts/${TARGET_USER_ID}`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['super_admin'] }))
      .send({ roleId: ROLE_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.userRole.deleteMany).not.toHaveBeenCalled();
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

/**
 * Regression coverage for the real bug: `roles.tsx` had no way to learn a role's saved
 * dashboard-widget grants after a role switch or page reload (only `PUT .../widgets` existed —
 * write + return new state), so the UI always rendered every widget unchecked regardless of what
 * was actually saved in `RoleDashboardWidget`. This is the read half of that same table, mirroring
 * `GET /roles/:id/permissions` exactly.
 */
describe('GET /api/v1/rbac/roles/:id/widgets', () => {
  const WIDGET_ID = '3b9a4f6c-9f0f-4a4c-8f9a-2f6f1a0e5d3a';

  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/v1/rbac/roles/${ROLE_ID}/widgets`);
    expect(res.status).toBe(401);
  });

  it('returns 422 for a malformed :id', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    const res = await request(app)
      .get('/api/v1/rbac/roles/not-a-uuid/widgets')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(422);
  });

  it("returns 200 with the role's currently saved widget rows, not an empty list, when grants exist", async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    prismaMock.role.findUnique.mockResolvedValue(roleFixture);
    prismaMock.roleDashboardWidget.findMany.mockResolvedValue([
      { roleId: ROLE_ID, widgetId: WIDGET_ID, order: 0, widget: { id: WIDGET_ID, key: 'orders-recent', title: 'Total Orders', module: 'orders' } },
    ]);
    const res = await request(app)
      .get(`/api/v1/rbac/roles/${ROLE_ID}/widgets`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { roleId: ROLE_ID, widgetId: WIDGET_ID, order: 0, widget: { id: WIDGET_ID, key: 'orders-recent', title: 'Total Orders', module: 'orders' } },
    ]);
  });

  it('returns 404 when the role does not exist', async () => {
    resolveMock.mockResolvedValue(['rbac.roles:view']);
    prismaMock.role.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/rbac/roles/${OTHER_ROLE_ID}/widgets`)
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['admin'] }));
    expect(res.status).toBe(404);
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

  /** Regression: bootstrap is fetched right after login AND on every refresh/mount, and the
   *  frontend's own `loadBootstrap` already signs out on a 401/403 — reused here (rather than a
   *  new frontend mechanism) to actually end a suspended Member's session, not just block their
   *  next login attempt. */
  it('403s a suspended Member — their own bootstrap, not an admin\'s', async () => {
    resolveMock.mockResolvedValue(['dashboard:view']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_ID, name: 'Vendor Owner', email: 'owner@test.com', phone: null, status: 'active' });
    prismaMock.vendor.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    const res = await request(app)
      .get('/api/v1/rbac/bootstrap')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Your member account is suspended. Please contact support.');
  });

  it('does not 403 a SuperAdmin previewing a suspended Member (isPreview token)', async () => {
    resolveMock.mockResolvedValue(['dashboard:view']);
    prismaMock.user.findFirst.mockResolvedValue({ id: USER_ID, name: 'Vendor Owner', email: 'owner@test.com', phone: null, status: 'active' });
    prismaMock.vendor.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    prismaMock.role.findMany.mockResolvedValue([{ id: ROLE_ID, key: 'vendor', name: 'Vendor', isSuperAdmin: false }]);
    prismaMock.roleDashboardWidget.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/rbac/bootstrap')
      .set('Authorization', bearerFor({ sub: USER_ID, roles: ['vendor'], isPreview: true, impersonatedBy: 'admin-1' }));
    expect(res.status).toBe(200);
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
