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

const PARENT_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const CHILD_ID = 'b0b0b0b0-0000-4000-8000-000000000002';

const parentFixture = { id: PARENT_ID, name: 'Spa & Wellness', slug: 'spa-wellness', parentId: null, sortOrder: 0, isActive: true, _count: { children: 0 } };
const childFixture = { id: CHILD_ID, name: 'Massage', slug: 'massage', parentId: PARENT_ID, sortOrder: 0, isActive: true, _count: { children: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/categories', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(401);
  });

  it('returns 403 without masters.categories:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the category list', async () => {
    resolveMock.mockResolvedValue(['masters.categories:view']);
    prismaMock.category.findMany.mockResolvedValue([parentFixture]);
    prismaMock.category.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/categories?scope=top')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/categories', () => {
  it('creates a top-level category and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique.mockResolvedValue(null); // slug free
    prismaMock.category.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PARENT_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness' });
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 409 when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique.mockResolvedValue(parentFixture);
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness' });
    expect(res.status).toBe(409);
  });

  it('returns 422 when parentId references a category that is itself a subcategory', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce({ ...childFixture, parentId: PARENT_ID }); // parent lookup: parentId is itself set
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Deep tissue', slug: 'deep-tissue', parentId: CHILD_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/categories/:id', () => {
  it('rejects a category becoming its own parent', async () => {
    resolveMock.mockResolvedValue(['masters.categories:edit']);
    prismaMock.category.findUnique.mockResolvedValue(parentFixture);
    const res = await request(app)
      .patch(`/api/v1/categories/${PARENT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ parentId: PARENT_ID });
    expect(res.status).toBe(422);
  });

  it('rejects turning a category with existing subcategories into a subcategory itself', async () => {
    resolveMock.mockResolvedValue(['masters.categories:edit']);
    prismaMock.category.findUnique.mockResolvedValue({ ...parentFixture, _count: { children: 2 } });
    const res = await request(app)
      .patch(`/api/v1/categories/${PARENT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ parentId: CHILD_ID });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/categories/:id', () => {
  it('returns 409 when the category still has subcategories', async () => {
    resolveMock.mockResolvedValue(['masters.categories:delete']);
    prismaMock.category.findUnique.mockResolvedValue({ ...parentFixture, _count: { children: 1 } });
    const res = await request(app)
      .delete(`/api/v1/categories/${PARENT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.category.delete).not.toHaveBeenCalled();
  });

  it('returns 409 when the category is still referenced by a deal', async () => {
    resolveMock.mockResolvedValue(['masters.categories:delete']);
    prismaMock.category.findUnique.mockResolvedValue(childFixture);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app)
      .delete(`/api/v1/categories/${CHILD_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.category.delete).not.toHaveBeenCalled();
  });

  it('returns 409 when the category is still referenced by a service', async () => {
    resolveMock.mockResolvedValue(['masters.categories:delete']);
    prismaMock.category.findUnique.mockResolvedValue(childFixture);
    prismaMock.deal.count.mockResolvedValue(0);
    prismaMock.service.count.mockResolvedValue(1);
    const res = await request(app)
      .delete(`/api/v1/categories/${CHILD_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.category.delete).not.toHaveBeenCalled();
  });

  it('deletes successfully when unreferenced', async () => {
    resolveMock.mockResolvedValue(['masters.categories:delete']);
    prismaMock.category.findUnique.mockResolvedValue(childFixture);
    prismaMock.deal.count.mockResolvedValue(0);
    prismaMock.service.count.mockResolvedValue(0);
    prismaMock.category.delete.mockResolvedValue(childFixture);
    const res = await request(app)
      .delete(`/api/v1/categories/${CHILD_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});
