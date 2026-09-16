import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { app } from '../app';
import { signAccessToken } from '../lib/jwt';
import { invalidatePermissionCache } from '../services/permission.service';

const USER_2_ID = '22222222-2222-2222-8222-222222222222';

function adminToken() {
  return signAccessToken({ sub: 'admin-1', roles: ['admin'], app: 'mera-driver' });
}

function grant(...keys: string[]) {
  mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
  mockPrisma.rolePermission.findMany.mockResolvedValue(keys.map((key) => ({ permission: { key } })));
}

beforeEach(() => {
  resetPrismaMock();
  invalidatePermissionCache();
});

describe('PATCH /drivers/:id/link-user', () => {
  it('returns 403 without drivers:assign', async () => {
    grant('drivers:view');
    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: '11111111-1111-1111-8111-111111111111' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the target user does not exist', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: '11111111-1111-1111-8111-111111111111' });

    expect(res.status).toBe(404);
  });

  it('links the driver, auto-assigns the driver role, and audit-logs it', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-driver', key: 'driver' });
    mockPrisma.userRole.upsert.mockResolvedValue({});
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: USER_2_ID });

    expect(res.status).toBe(200);
    expect(mockPrisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_roleId: { userId: USER_2_ID, roleId: 'role-driver' } } }),
    );
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { userId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.link' }) }),
    );
  });

  it('surfaces the unique-constraint violation as a clean 409 when the user is already linked to a driver', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null });
    mockPrisma.role.findUnique.mockResolvedValue(null); // no driver role row in this scenario — irrelevant to the conflict
    const { Prisma } = await import('../generated/prisma-client');
    mockPrisma.driver.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['userId'] },
      }),
    );

    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: USER_2_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('PATCH /drivers/:id/unlink-user', () => {
  it('clears the link and audit-logs it', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/unlink-user')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { userId: null } });
  });
});

describe('POST /drivers/:id/create-user', () => {
  it('returns 403 without drivers:assign', async () => {
    grant('drivers:view');
    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('creates a User, assigns the driver role, links it, and audit-logs it', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: null,
      firstName: 'Ravi',
      lastName: 'Kumar',
      phone: '9000000000',
      email: null,
      documents: [],
    });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-driver', key: 'driver' });
    mockPrisma.user.create.mockResolvedValue({ id: USER_2_ID });
    mockPrisma.userRole.create.mockResolvedValue({});
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Ravi Kumar', email: undefined, phone: '9000000000' },
    });
    expect(mockPrisma.userRole.create).toHaveBeenCalledWith({ data: { userId: USER_2_ID, roleId: 'role-driver' } });
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { userId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.user.create' }) }),
    );
  });

  it('returns 409 without creating anything when the driver is already linked', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', userId: USER_2_ID, documents: [] });

    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(409);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 422 when the driver has neither phone nor email', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', userId: null, phone: null, email: null, documents: [] });

    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});
