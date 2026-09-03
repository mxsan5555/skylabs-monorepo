import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

vi.mock('../lib/media-storage', () => ({
  getUploadRoot: vi.fn(() => '/fake/uploads/media'),
  writeMediaFile: vi.fn(async (subdir: string, parentId: string, buffer: Buffer) => ({
    storageKey: `${subdir}/${parentId}/fake.jpg`,
    sizeBytes: buffer.length,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
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

/** A byte-exact, magic-byte-valid JPEG buffer within the 30KB-80KB window — same helper
 *  convention as media.routes.test.ts. */
function validJpeg(): Buffer {
  const buffer = Buffer.alloc(50 * 1024, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

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
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness', type: 'SERVICE' });
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 when a top-level category is created with no type', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness' });
    expect(res.status).toBe(422);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });

  it('allows a subcategory to omit type (it inherits its parent\'s type by join)', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce(parentFixture); // parent lookup
    prismaMock.category.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: CHILD_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Massage', slug: 'massage', parentId: PARENT_ID });
    expect(res.status).toBe(201);
  });

  it('returns 409 when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique.mockResolvedValue(parentFixture);
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness', type: 'SERVICE' });
    expect(res.status).toBe(409);
  });

  it('returns a clean 409 (not a raw 500) when a double-submit races past the app-layer slug check and hits the DB unique constraint', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique.mockResolvedValue(null); // app-layer pre-check sees the slug as free
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.category.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness', type: 'SERVICE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('still returns 201 with the created category when the audit-log write itself fails (best-effort, never blocks the response)', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique.mockResolvedValue(null);
    prismaMock.category.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PARENT_ID, ...data }),
    );
    prismaMock.auditLog.create.mockRejectedValue(new Error('audit db unreachable'));
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Spa & Wellness', slug: 'spa-wellness', type: 'SERVICE' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(PARENT_ID);
  });

  it('allows a Type-tier row (3rd level) whose parent is itself a subcategory', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce({ ...childFixture, parentId: PARENT_ID }) // parent lookup: parentId is itself set (depth 2)
      .mockResolvedValueOnce(parentFixture); // grandparent lookup: top-level, parentId null -> depth 3 is fine
    prismaMock.category.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'new-type-id', ...data }),
    );
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Deep tissue', slug: 'deep-tissue', parentId: CHILD_ID });
    expect(res.status).toBe(201);
  });

  it('returns 422 when a 4th level is attempted (grandparent already has a parent)', async () => {
    resolveMock.mockResolvedValue(['masters.categories:create']);
    const typeFixture = { ...childFixture, id: 'type-1', parentId: CHILD_ID };
    prismaMock.category.findUnique
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce(typeFixture) // parent lookup: parentId set (depth 3)
      .mockResolvedValueOnce({ ...childFixture, parentId: PARENT_ID }); // grandparent lookup: ALSO has a parentId -> reject
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Too Deep', slug: 'too-deep', parentId: 'type-1' });
    expect(res.status).toBe(422);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/categories/:id/images', () => {
  it('uploads an image and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['masters.categories:edit']);
    // .mockReset() (not just a fresh .mockResolvedValue()) — vi.clearAllMocks() in the outer
    // beforeEach only clears call history, not a still-queued .mockResolvedValueOnce() chain
    // left over from an earlier depth-limit test in this same file; reset guarantees a clean
    // slate regardless of what's queued.
    prismaMock.category.findUnique.mockReset().mockResolvedValue(parentFixture);
    prismaMock.categoryImage.count.mockResolvedValue(0);
    prismaMock.categoryImage.create.mockResolvedValue({ id: 'img-1' });
    const res = await request(app)
      .post(`/api/v1/categories/${PARENT_ID}/images`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('404s when the category does not exist', async () => {
    resolveMock.mockResolvedValue(['masters.categories:edit']);
    prismaMock.category.findUnique.mockReset().mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/categories/${PARENT_ID}/images`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/categories/:id/images/:imageId', () => {
  it('deletes the image and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['masters.categories:edit']);
    prismaMock.category.findUnique.mockResolvedValue(parentFixture);
    prismaMock.categoryImage.findUnique.mockResolvedValue({ id: 'img-1', categoryId: PARENT_ID, isPrimary: false, storageKey: 'categories/x/img-1.jpg' });
    prismaMock.categoryImage.delete.mockResolvedValue({ storageKey: 'categories/x/img-1.jpg' });
    const res = await request(app)
      .delete(`/api/v1/categories/${PARENT_ID}/images/img-1`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe('PATCH /api/v1/categories/:id/images/:imageId/primary', () => {
  it('sets the primary image', async () => {
    resolveMock.mockResolvedValue(['masters.categories:edit']);
    prismaMock.category.findUnique.mockResolvedValue(parentFixture);
    prismaMock.categoryImage.findUnique.mockResolvedValue({ id: 'img-2', categoryId: PARENT_ID, isPrimary: false, storageKey: 'y' });
    prismaMock.categoryImage.updateMany.mockResolvedValue({});
    prismaMock.categoryImage.update.mockResolvedValue({});
    const res = await request(app)
      .patch(`/api/v1/categories/${PARENT_ID}/images/img-2/primary`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
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

  it('returns 409 when the category is still referenced by a product', async () => {
    resolveMock.mockResolvedValue(['masters.categories:delete']);
    prismaMock.category.findUnique.mockResolvedValue(childFixture);
    prismaMock.deal.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app)
      .delete(`/api/v1/categories/${CHILD_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.category.delete).not.toHaveBeenCalled();
  });

  it('returns 409 when the category is still granted to a vendor', async () => {
    resolveMock.mockResolvedValue(['masters.categories:delete']);
    prismaMock.category.findUnique.mockResolvedValue(childFixture);
    prismaMock.deal.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.vendorCategoryAccess.count.mockResolvedValue(1);
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
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.vendorCategoryAccess.count.mockResolvedValue(0);
    prismaMock.category.delete.mockResolvedValue(childFixture);
    const res = await request(app)
      .delete(`/api/v1/categories/${CHILD_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});
