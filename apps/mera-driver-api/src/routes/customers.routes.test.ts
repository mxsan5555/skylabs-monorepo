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

describe('PATCH /customers/:id/link-user', () => {
  it('returns 403 without customers:assign', async () => {
    grant('customers:view');
    const res = await request(app)
      .patch('/customers/customer-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: '11111111-1111-1111-8111-111111111111' });
    expect(res.status).toBe(403);
  });

  it('links the customer, auto-assigns the customer role, and audit-logs it', async () => {
    grant('customers:assign');
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    mockPrisma.userRole.upsert.mockResolvedValue({});
    mockPrisma.customer.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/customers/customer-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: USER_2_ID });

    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { userId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'customer.link' }) }),
    );
  });

  it('returns 404 when the target user does not exist', async () => {
    grant('customers:assign');
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/customers/customer-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: USER_2_ID });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /customers/:id/unlink-user', () => {
  it('clears the link and audit-logs it', async () => {
    grant('customers:assign');
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    mockPrisma.customer.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/customers/customer-1/unlink-user')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { userId: null } });
  });
});

describe('POST /customers/:id/create-user', () => {
  it('returns 403 without customers:assign', async () => {
    grant('customers:view');
    const res = await request(app).post('/customers/customer-1/create-user').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('creates a User, assigns the customer role, links it, and audit-logs it', async () => {
    grant('customers:assign');
    mockPrisma.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      userId: null,
      firstName: 'Anita',
      lastName: 'Sharma',
      mobileNumber: '9000000000',
      email: null,
    });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    mockPrisma.user.create.mockResolvedValue({ id: USER_2_ID });
    mockPrisma.userRole.create.mockResolvedValue({});
    mockPrisma.customer.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app).post('/customers/customer-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Anita Sharma', email: undefined, phone: '9000000000' },
    });
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { userId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'customer.user.create' }) }),
    );
  });

  it('returns 409 without creating anything when the customer is already linked', async () => {
    grant('customers:assign');
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', userId: USER_2_ID });

    const res = await request(app).post('/customers/customer-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(409);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 422 when the customer has neither phone nor email', async () => {
    grant('customers:assign');
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', userId: null, mobileNumber: null, email: null });

    const res = await request(app).post('/customers/customer-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});
