import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const CATEGORY_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const SUBCATEGORY_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const SERVICE_ID = 'c0c0c0c0-0000-4000-8000-000000000003';

const categoryFixture = { id: CATEGORY_ID, name: 'Salon & Grooming', parentId: null };
const subcategoryFixture = { id: SUBCATEGORY_ID, name: 'Hair', parentId: CATEGORY_ID };
const serviceFixture = {
  id: SERVICE_ID,
  name: 'Haircut',
  slug: 'haircut',
  categoryId: CATEGORY_ID,
  subcategoryId: null,
  defaultDurationMinutes: 30,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/services', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/services');
    expect(res.status).toBe(401);
  });

  it('returns 403 without services:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the service list', async () => {
    resolveMock.mockResolvedValue(['services:view']);
    prismaMock.service.findMany.mockResolvedValue([serviceFixture]);
    prismaMock.service.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('a vendor-role token (services:view only) can also list, matching the existing vendor grant', async () => {
    resolveMock.mockResolvedValue(['services:view']);
    prismaMock.service.findMany.mockResolvedValue([]);
    prismaMock.service.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'vendor-1', roles: ['vendor'] }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/services', () => {
  it('creates a service and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['services:create']);
    prismaMock.service.findUnique.mockResolvedValue(null); // slug free
    prismaMock.category.findUnique.mockResolvedValue(categoryFixture); // categoryId exists
    prismaMock.service.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: SERVICE_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Haircut', slug: 'haircut', categoryId: CATEGORY_ID, defaultDurationMinutes: 30 });
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 409 when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['services:create']);
    prismaMock.service.findUnique.mockResolvedValue(serviceFixture);
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Haircut', slug: 'haircut', categoryId: CATEGORY_ID });
    expect(res.status).toBe(409);
  });

  it('returns 422 when subcategoryId is not a child of categoryId', async () => {
    resolveMock.mockResolvedValue(['services:create']);
    prismaMock.service.findUnique.mockResolvedValue(null);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(categoryFixture) // categoryId lookup
      .mockResolvedValueOnce({ id: 'unrelated', name: 'Other', parentId: null }); // subcategory lookup: wrong parent
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Haircut', slug: 'haircut', categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.service.create).not.toHaveBeenCalled();
  });

  it('creates successfully with a valid category/subcategory pair', async () => {
    resolveMock.mockResolvedValue(['services:create']);
    prismaMock.service.findUnique.mockResolvedValue(null);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(categoryFixture)
      .mockResolvedValueOnce(subcategoryFixture);
    prismaMock.service.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: SERVICE_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Haircut', slug: 'haircut', categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/v1/services/:id/status and DELETE', () => {
  it('toggles status', async () => {
    resolveMock.mockResolvedValue(['services:edit']);
    prismaMock.service.findUnique.mockResolvedValue(serviceFixture);
    prismaMock.service.update.mockResolvedValue({ ...serviceFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/services/${SERVICE_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('deletes a service', async () => {
    resolveMock.mockResolvedValue(['services:delete']);
    prismaMock.service.findUnique.mockResolvedValue(serviceFixture);
    prismaMock.service.delete.mockResolvedValue(serviceFixture);
    const res = await request(app)
      .delete(`/api/v1/services/${SERVICE_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 403 for a vendor-role token attempting to delete (no services:delete grant)', async () => {
    resolveMock.mockResolvedValue(['services:view']);
    const res = await request(app)
      .delete(`/api/v1/services/${SERVICE_ID}`)
      .set('Authorization', bearerFor({ sub: 'vendor-1', roles: ['vendor'] }));
    expect(res.status).toBe(403);
    expect(prismaMock.service.delete).not.toHaveBeenCalled();
  });
});
