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
const VENDOR_ID = 'e0e0e0e0-0000-4000-8000-000000000009';
const PRODUCT_ID = 'c0c0c0c0-0000-4000-8000-000000000003';

const productFixture = {
  id: PRODUCT_ID,
  vendorId: VENDOR_ID,
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

/**
 * Product is now vendor-owned (see the `direct_category_access` migration) — this router is
 * only the cross-vendor, READ-ONLY superadmin oversight surface. Create/update/status/delete/
 * media are vendor-scoped and tested in vendors.routes.test.ts instead (self-service under
 * `/vendors/me/products`, admin-on-behalf under `/vendors/:vendorId/products`).
 */
describe('GET /api/v1/products (superadmin oversight)', () => {
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

  it('returns 200 with the cross-vendor product list', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.product.findMany.mockResolvedValue([productFixture]);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('supports filtering by vendorId', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.product.findMany.mockResolvedValue([productFixture]);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app)
      .get(`/api/v1/products?vendorId=${VENDOR_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_ID }) }),
    );
  });
});

describe('GET /api/v1/products/:id (superadmin oversight)', () => {
  it('returns a product by id', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    const res = await request(app)
      .get(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PRODUCT_ID);
  });

  it('404s for a missing product', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.product.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(404);
  });
});
