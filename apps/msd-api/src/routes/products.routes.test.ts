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
const VENDOR_B_ID = 'f0f0f0f0-0000-4000-8000-00000000000a';
const VENDOR_A_USER_ID = 'd0d0d0d0-0000-4000-8000-000000000008';
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

const vendorAFixture = { id: VENDOR_ID, ownerUserId: VENDOR_A_USER_ID, businessName: 'Vendor A' };

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

  it('supports filtering by vendorId (admin/staff caller only — see the vendor-isolation suite below for a Vendor caller)', async () => {
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

/**
 * CRITICAL: `products:view` (unlike the admin-only `vendors:view` gating Branches/Deals/
 * Therapists' equivalent cross-vendor routes) is also held by the `vendor` role itself — see
 * seed.ts's `grant('vendor', [...'products:view'...])` — so this router previously trusted a
 * caller-supplied `?vendorId=` (or returned every vendor's products when it was omitted) instead
 * of ever resolving the caller's OWN vendor identity. A logged-in Vendor must always be
 * force-scoped to their own vendor here, exactly like Orders already are.
 */
describe('GET /api/v1/products — Vendor isolation (CRITICAL)', () => {
  it('a Vendor caller (no vendorId query param) sees ONLY their own vendor\'s products, never every vendor\'s', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findMany.mockResolvedValue([productFixture]);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', bearerFor({ sub: VENDOR_A_USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_ID }) }),
    );
  });

  it('a Vendor caller cannot see another vendor\'s products by spoofing ?vendorId= — the query param is ignored, not trusted', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app)
      .get(`/api/v1/products?vendorId=${VENDOR_B_ID}`)
      .set('Authorization', bearerFor({ sub: VENDOR_A_USER_ID, roles: ['vendor'] }));
    // The caller's OWN vendorId wins — VENDOR_B_ID from the query string never reaches the query.
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_ID }) }),
    );
    expect(prismaMock.product.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_B_ID }) }),
    );
  });

  it('Superadmin/admin (no Vendor profile) still sees every vendor\'s products, unaffected by the fix', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(null); // admin/staff caller owns no Vendor profile
    prismaMock.product.findMany.mockResolvedValue([productFixture]);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    // No vendorId filter at all — every vendor's products included, exactly as before this fix.
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ vendorId: expect.anything() }) }),
    );
  });
});

describe('GET /api/v1/products/:id — Vendor isolation (CRITICAL, ID-tampering)', () => {
  it('a Vendor caller can open their OWN product by id', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue(productFixture); // vendorId === VENDOR_ID, the caller's own
    const res = await request(app)
      .get(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: VENDOR_A_USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PRODUCT_ID);
  });

  it('a Vendor caller CANNOT open another vendor\'s product by guessing/tampering its id — blocked, not just hidden from the list', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_B_ID }); // belongs to a different vendor
    const res = await request(app)
      .get(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: VENDOR_A_USER_ID, roles: ['vendor'] }));
    expect(res.status).toBe(403);
  });

  it('Superadmin/admin can still open any vendor\'s product by id, unaffected by the fix', async () => {
    resolveMock.mockResolvedValue(['products:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    const res = await request(app)
      .get(`/api/v1/products/${PRODUCT_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
  });
});
