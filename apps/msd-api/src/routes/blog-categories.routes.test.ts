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

const CATEGORY_ID = 'b0b0b0b0-0000-4000-8000-000000000001';

const categoryFixture = {
  id: CATEGORY_ID,
  name: 'Wellness',
  slug: 'wellness',
  description: 'Wellness related posts',
  sortOrder: 0,
  isActive: true,
  _count: { posts: 0 },
};

const validCreatePayload = {
  name: 'Skincare',
  slug: 'skincare',
  description: 'Skincare related posts',
  sortOrder: 1,
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/blog-categories', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/blog-categories');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.blog-category:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/blog-categories').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the paginated list, including inactive rows (admin caller)', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:view']);
    prismaMock.blogCategory.findMany.mockResolvedValue([{ ...categoryFixture, isActive: false }]);
    prismaMock.blogCategory.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/blog-categories?page=2&pageSize=10').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isActive).toBe(false);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 1, page: 2, pageSize: 10 }));
    expect(prismaMock.blogCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it('filters by search (name contains, case-insensitive)', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:view']);
    prismaMock.blogCategory.findMany.mockResolvedValue([]);
    prismaMock.blogCategory.count.mockResolvedValue(0);
    await request(app).get('/api/v1/blog-categories?search=skin').set('Authorization', authHeader());
    expect(prismaMock.blogCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: { contains: 'skin', mode: 'insensitive' } }) }),
    );
  });
});

describe('POST /api/v1/blog-categories', () => {
  it('returns 403 without cms.blog-category:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/blog-categories').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(403);
  });

  it('creates a blog category and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:create']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(null); // slug free
    prismaMock.blogCategory.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: CATEGORY_ID, isActive: true, ...data }),
    );
    const res = await request(app).post('/api/v1/blog-categories').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(CATEGORY_ID);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 with fieldErrors when name is missing', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:create']);
    const { name, ...withoutName } = validCreatePayload;
    void name;
    const res = await request(app).post('/api/v1/blog-categories').set('Authorization', authHeader()).send(withoutName);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.name).toBeDefined();
    expect(prismaMock.blogCategory.create).not.toHaveBeenCalled();
  });

  it('returns 422 with fieldErrors when slug is missing', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:create']);
    const { slug, ...withoutSlug } = validCreatePayload;
    void slug;
    const res = await request(app).post('/api/v1/blog-categories').set('Authorization', authHeader()).send(withoutSlug);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.slug).toBeDefined();
    expect(prismaMock.blogCategory.create).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid (non-kebab-case) slug', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:create']);
    const res = await request(app)
      .post('/api/v1/blog-categories')
      .set('Authorization', authHeader())
      .send({ ...validCreatePayload, slug: 'Not A Slug!' });
    expect(res.status).toBe(422);
    expect(prismaMock.blogCategory.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:create']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(categoryFixture);
    const res = await request(app).post('/api/v1/blog-categories').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(409);
    expect(prismaMock.blogCategory.create).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when a double-submit races past the app-layer slug check and hits the DB unique constraint', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:create']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(null);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.blogCategory.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app).post('/api/v1/blog-categories').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('GET /api/v1/blog-categories/:id', () => {
  it('returns 404 when the category does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:view']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/blog-categories/${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
  });

  it('returns the category', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:view']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(categoryFixture);
    const res = await request(app).get(`/api/v1/blog-categories/${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(CATEGORY_ID);
  });
});

describe('PATCH /api/v1/blog-categories/:id', () => {
  it('returns 403 without cms.blog-category:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/blog-categories/${CATEGORY_ID}`)
      .set('Authorization', authHeader())
      .send({ name: 'New Name' });
    expect(res.status).toBe(403);
  });

  it('updates the category', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:edit']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(categoryFixture);
    prismaMock.blogCategory.update.mockResolvedValue({ ...categoryFixture, name: 'New Name' });
    const res = await request(app)
      .patch(`/api/v1/blog-categories/${CATEGORY_ID}`)
      .set('Authorization', authHeader())
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('toggles isActive (deactivate) via the plain PATCH route — no separate /status route for this resource', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:edit']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(categoryFixture);
    prismaMock.blogCategory.update.mockResolvedValue({ ...categoryFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/blog-categories/${CATEGORY_ID}`)
      .set('Authorization', authHeader())
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('404s when the category does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:edit']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/blog-categories/${CATEGORY_ID}`)
      .set('Authorization', authHeader())
      .send({ name: 'New Name' });
    expect(res.status).toBe(404);
    expect(prismaMock.blogCategory.update).not.toHaveBeenCalled();
  });

  it('returns 409 when editing to a slug already used by another category', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:edit']);
    prismaMock.blogCategory.findUnique
      .mockResolvedValueOnce(categoryFixture) // getBlogCategoryOrThrow
      .mockResolvedValueOnce({ ...categoryFixture, id: 'another-category-id' }); // assertSlugAvailable finds a different category
    const res = await request(app)
      .patch(`/api/v1/blog-categories/${CATEGORY_ID}`)
      .set('Authorization', authHeader())
      .send({ slug: 'taken-slug' });
    expect(res.status).toBe(409);
    expect(prismaMock.blogCategory.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/blog-categories/:id', () => {
  it('returns 403 without cms.blog-category:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).delete(`/api/v1/blog-categories/${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the category and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:delete']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(categoryFixture);
    prismaMock.blogCategory.delete.mockResolvedValue(categoryFixture);
    const res = await request(app).delete(`/api/v1/blog-categories/${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the category does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:delete']);
    prismaMock.blogCategory.findUnique.mockResolvedValue(null);
    const res = await request(app).delete(`/api/v1/blog-categories/${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(prismaMock.blogCategory.delete).not.toHaveBeenCalled();
  });

  it('returns 409 when the category is still referenced by blog posts', async () => {
    resolveMock.mockResolvedValue(['cms.blog-category:delete']);
    prismaMock.blogCategory.findUnique.mockResolvedValue({ ...categoryFixture, _count: { posts: 3 } });
    const res = await request(app).delete(`/api/v1/blog-categories/${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(409);
    expect(prismaMock.blogCategory.delete).not.toHaveBeenCalled();
  });
});
