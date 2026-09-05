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

const TAG_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const CATEGORY_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const DEAL_ID = 'c0c0c0c0-0000-4000-8000-000000000003';

const tagFixture = { id: TAG_ID, name: 'Trending', slug: 'trending', isActive: true, createdAt: new Date(), updatedAt: new Date() };
const tagWithCounts = { ...tagFixture, _count: { categories: 0, deals: 0, products: 0, therapists: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

/**
 * Feature: Popular Tag admin CRUD + mapping (`/popular-tags`)
 * Scenario: Superadmin creates dynamic marketing labels and maps them onto Category/Deal/
 * Product/Therapist rows, gated on the existing `masters.tags` permission.
 *
 * Given: an admin with masters.tags:view/create/edit/delete
 * When: they list/create/update/activate/deactivate/delete tags and map/unmap them
 * Then: every mutating action is permission-gated, deactivating never deletes mappings, and
 *       delete is blocked while any mapping still exists
 */
describe('GET /api/v1/popular-tags', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/popular-tags');
    expect(res.status).toBe(401);
  });

  it('returns 403 without masters.tags:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/popular-tags')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the tag list', async () => {
    resolveMock.mockResolvedValue(['masters.tags:view']);
    prismaMock.popularTag.findMany.mockResolvedValue([tagWithCounts]);
    prismaMock.popularTag.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/popular-tags')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([JSON.parse(JSON.stringify(tagWithCounts))]);
  });
});

describe('POST /api/v1/popular-tags', () => {
  it('creates a tag when the slug is available', async () => {
    resolveMock.mockResolvedValue(['masters.tags:create']);
    prismaMock.popularTag.findUnique.mockResolvedValue(null);
    prismaMock.popularTag.create.mockResolvedValue(tagFixture);
    const res = await request(app)
      .post('/api/v1/popular-tags')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Trending', slug: 'trending' });
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it('409s when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['masters.tags:create']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagFixture);
    const res = await request(app)
      .post('/api/v1/popular-tags')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Trending', slug: 'trending' });
    expect(res.status).toBe(409);
    expect(prismaMock.popularTag.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/popular-tags/:id/status — deactivate/reactivate never touches mappings', () => {
  it('deactivating a tag only flips isActive, without deleting any PopularTag* rows', async () => {
    resolveMock.mockResolvedValue(['masters.tags:edit']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.popularTag.update.mockResolvedValue({ ...tagFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/popular-tags/${TAG_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(prismaMock.popularTagCategory.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.popularTagDeal.deleteMany).not.toHaveBeenCalled();
  });

  it('reactivating a tag restores it without requiring any remapping call', async () => {
    resolveMock.mockResolvedValue(['masters.tags:edit']);
    prismaMock.popularTag.findUnique.mockResolvedValue({ ...tagWithCounts, isActive: false });
    prismaMock.popularTag.update.mockResolvedValue({ ...tagFixture, isActive: true });
    const res = await request(app)
      .patch(`/api/v1/popular-tags/${TAG_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
    expect(prismaMock.popularTagCategory.upsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/popular-tags/:id', () => {
  it('409s when the tag still has any mapping', async () => {
    resolveMock.mockResolvedValue(['masters.tags:delete']);
    prismaMock.popularTag.findUnique.mockResolvedValue({ ...tagWithCounts, _count: { categories: 1, deals: 0, products: 0, therapists: 0 } });
    const res = await request(app)
      .delete(`/api/v1/popular-tags/${TAG_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.popularTag.delete).not.toHaveBeenCalled();
  });

  it('deletes a tag with zero mappings', async () => {
    resolveMock.mockResolvedValue(['masters.tags:delete']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.popularTag.delete.mockResolvedValue(tagFixture);
    const res = await request(app)
      .delete(`/api/v1/popular-tags/${TAG_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.popularTag.delete).toHaveBeenCalledWith({ where: { id: TAG_ID } });
  });
});

describe('POST /api/v1/popular-tags/:id/mappings', () => {
  it('maps a tag onto a category', async () => {
    resolveMock.mockResolvedValue(['masters.tags:edit']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
    prismaMock.popularTagCategory.upsert.mockResolvedValue({ id: 'link-1', tagId: TAG_ID, categoryId: CATEGORY_ID });
    const res = await request(app)
      .post(`/api/v1/popular-tags/${TAG_ID}/mappings`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ targetType: 'category', targetId: CATEGORY_ID });
    expect(res.status).toBe(201);
    expect(prismaMock.popularTagCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { tagId: TAG_ID, categoryId: CATEGORY_ID } }),
    );
  });

  it('maps a tag onto a deal', async () => {
    resolveMock.mockResolvedValue(['masters.tags:edit']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.deal.findUnique.mockResolvedValue({ id: DEAL_ID });
    prismaMock.popularTagDeal.upsert.mockResolvedValue({ id: 'link-2', tagId: TAG_ID, dealId: DEAL_ID });
    const res = await request(app)
      .post(`/api/v1/popular-tags/${TAG_ID}/mappings`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ targetType: 'deal', targetId: DEAL_ID });
    expect(res.status).toBe(201);
  });

  it('422s when the target does not exist', async () => {
    resolveMock.mockResolvedValue(['masters.tags:edit']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.category.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/popular-tags/${TAG_ID}/mappings`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ targetType: 'category', targetId: CATEGORY_ID });
    expect(res.status).toBe(422);
    expect(prismaMock.popularTagCategory.upsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/popular-tags/:id/mappings/:targetType/:targetId', () => {
  it('unmaps a tag from a category', async () => {
    resolveMock.mockResolvedValue(['masters.tags:edit']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.popularTagCategory.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .delete(`/api/v1/popular-tags/${TAG_ID}/mappings/category/${CATEGORY_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.popularTagCategory.deleteMany).toHaveBeenCalledWith({ where: { tagId: TAG_ID, categoryId: CATEGORY_ID } });
  });
});

describe('GET /api/v1/popular-tags/:id/mappings', () => {
  it('lists current mappings across all four entity types', async () => {
    resolveMock.mockResolvedValue(['masters.tags:view']);
    prismaMock.popularTag.findUnique.mockResolvedValue(tagWithCounts);
    prismaMock.popularTagCategory.findMany.mockResolvedValue([{ category: { id: CATEGORY_ID, name: 'Massage' } }]);
    prismaMock.popularTagDeal.findMany.mockResolvedValue([]);
    prismaMock.popularTagProduct.findMany.mockResolvedValue([]);
    prismaMock.popularTagTherapist.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get(`/api/v1/popular-tags/${TAG_ID}/mappings`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([{ id: CATEGORY_ID, name: 'Massage' }]);
  });
});
