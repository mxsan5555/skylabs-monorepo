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
const PRODUCT_ID = 'c0c0c0c0-0000-4000-8000-000000000003';

const categoryFixture = { id: CATEGORY_ID, name: 'Skin Care', parentId: null };
const subcategoryFixture = { id: SUBCATEGORY_ID, name: 'Masks', parentId: CATEGORY_ID };
const productFixture = {
  id: PRODUCT_ID,
  name: 'Gelling Mask',
  slug: 'gelling-mask',
  categoryId: CATEGORY_ID,
  subcategoryId: null,
  price: '3368.00',
  isNew: true,
  isFeatured: true,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/products', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(401);
  });

  it('returns 403 without products:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the product list', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.product.findMany.mockResolvedValue([productFixture]);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("a vendor-role token (products:view only) can also list, matching the existing vendor grant", async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'vendor-1', roles: ['vendor'] }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/products', () => {
  it('creates a product and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['products:create']);
    prismaMock.product.findUnique.mockResolvedValue(null); // slug free
    prismaMock.category.findUnique.mockResolvedValue(categoryFixture); // categoryId exists
    prismaMock.product.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PRODUCT_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Gelling Mask', slug: 'gelling-mask', categoryId: CATEGORY_ID, price: '3368.00' });
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 409 when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['products:create']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Gelling Mask', slug: 'gelling-mask', categoryId: CATEGORY_ID, price: '3368.00' });
    expect(res.status).toBe(409);
  });

  it('returns 422 when subcategoryId is not a child of categoryId', async () => {
    resolveMock.mockResolvedValue(['products:create']);
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(categoryFixture) // categoryId lookup
      .mockResolvedValueOnce({ id: 'unrelated', name: 'Other', parentId: null }); // subcategory lookup: wrong parent
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Gelling Mask', slug: 'gelling-mask', categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID, price: '3368.00' });
    expect(res.status).toBe(422);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('returns 422 for a non-decimal price', async () => {
    resolveMock.mockResolvedValue(['products:create']);
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Gelling Mask', slug: 'gelling-mask', categoryId: CATEGORY_ID, price: '33.6.8' });
    expect(res.status).toBe(422);
  });

  it('creates successfully with a valid category/subcategory pair', async () => {
    resolveMock.mockResolvedValue(['products:create']);
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.category.findUnique
      .mockResolvedValueOnce(categoryFixture)
      .mockResolvedValueOnce(subcategoryFixture);
    prismaMock.product.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: PRODUCT_ID, ...data }),
    );
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ name: 'Gelling Mask', slug: 'gelling-mask', categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID, price: '3368.00' });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/v1/products/:id/status and DELETE', () => {
  it('toggles status', async () => {
    resolveMock.mockResolvedValue(['products:edit']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.update.mockResolvedValue({ ...productFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/products/${PRODUCT_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('deletes a product', async () => {
    resolveMock.mockResolvedValue(['products:delete']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.delete.mockResolvedValue(productFixture);
    const res = await request(app)
      .delete(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 403 for a vendor-role token attempting to delete (no products:delete grant)', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    const res = await request(app)
      .delete(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'vendor-1', roles: ['vendor'] }));
    expect(res.status).toBe(403);
    expect(prismaMock.product.delete).not.toHaveBeenCalled();
  });
});
