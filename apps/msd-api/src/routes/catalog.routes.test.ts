import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from '../app';
import { prisma } from '../lib/prisma';

const prismaMock = vi.mocked(prisma, true);

const CATEGORY_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const SUBCATEGORY_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const DEAL_ID = 'c0c0c0c0-0000-4000-8000-000000000003';

const categoryFixture = { id: CATEGORY_ID, name: 'Salon & Grooming', slug: 'salon-grooming', description: null, parentId: null, sortOrder: 0, isActive: true };
const subcategoryFixture = { id: SUBCATEGORY_ID, name: 'Hair', slug: 'hair', description: null, parentId: CATEGORY_ID, sortOrder: 0, isActive: true };

const serviceDealFixture = {
  id: DEAL_ID,
  title: 'Haircut deal',
  slug: 'haircut-deal',
  originalPrice: '399.00',
  salePrice: '299.00',
  durationMinutes: 30,
  category: { id: CATEGORY_ID, name: 'Salon & Grooming', slug: 'salon-grooming' },
  subcategory: null,
  service: { id: 'svc-1', name: 'Haircut', slug: 'haircut' },
  product: null,
  vendor: { id: 'vendor-1', businessName: 'ABC Salon', city: 'Gorakhpur' },
  branch: { id: 'branch-1', name: 'Gorakhpur Branch', city: 'Gorakhpur' },
};

const productDealFixture = {
  ...serviceDealFixture,
  id: 'd1d1d1d1-0000-4000-8000-000000000004',
  title: 'Face cream deal',
  durationMinutes: null,
  service: null,
  product: { id: 'prod-1', name: 'Face Cream', slug: 'face-cream' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/catalog/categories', () => {
  it('1. returns a category tree with no auth required', async () => {
    prismaMock.category.findMany.mockResolvedValue([categoryFixture, subcategoryFixture]);
    const res = await request(app).get('/api/v1/catalog/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('salon-grooming');
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it("2. nests active subcategories under their parent (subcategory catalogue)", async () => {
    prismaMock.category.findMany.mockResolvedValue([categoryFixture, subcategoryFixture]);
    const res = await request(app).get('/api/v1/catalog/categories');
    expect(res.status).toBe(200);
    expect(res.body.data[0].children).toHaveLength(1);
    expect(res.body.data[0].children[0].slug).toBe('hair');
  });
});

describe('GET /api/v1/catalog/categories/:slug', () => {
  it('returns 404 for an unknown or inactive category', async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/catalog/categories/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('only looks up active categories by slug', async () => {
    prismaMock.category.findFirst.mockResolvedValue({ ...categoryFixture, children: [subcategoryFixture] });
    const res = await request(app).get('/api/v1/catalog/categories/salon-grooming');
    expect(res.status).toBe(200);
    expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'salon-grooming', isActive: true } }),
    );
  });
});

describe('GET /api/v1/catalog/deals', () => {
  it('3. shows a service deal', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals');
    expect(res.status).toBe(200);
    expect(res.body.data[0].service.name).toBe('Haircut');
  });

  it('4. shows a product deal', async () => {
    prismaMock.deal.findMany.mockResolvedValue([productDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals?type=product');
    expect(res.status).toBe(200);
    expect(res.body.data[0].product.name).toBe('Face Cream');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: { not: null } }) }),
    );
  });

  it('5/6/7/8/9. always filters to ACTIVE + APPROVED + active vendor + active branch (inactive/rejected/unapproved/inactive-vendor/inactive-branch all excluded by construction)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          approvalStatus: 'APPROVED',
          vendor: { status: 'ACTIVE' },
          branch: { isActive: true },
        }),
      }),
    );
  });

  it('also excludes a deal whose linked service/product has itself gone inactive', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.AND).toContainEqual({ OR: [{ serviceId: null }, { service: { is: { isActive: true } } }] });
    expect(call.where.AND).toContainEqual({ OR: [{ productId: null }, { product: { is: { isActive: true } } }] });
  });

  it('10. a service deal carries durationMinutes', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals');
    expect(res.body.data[0].durationMinutes).toBe(30);
  });

  it('11. a product deal has no durationMinutes', async () => {
    prismaMock.deal.findMany.mockResolvedValue([productDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals?type=product');
    expect(res.body.data[0].durationMinutes).toBeNull();
  });

  it('12. shows vendor and branch correctly', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals');
    expect(res.body.data[0].vendor.businessName).toBe('ABC Salon');
    expect(res.body.data[0].branch.name).toBe('Gorakhpur Branch');
  });

  it('13. never requests private vendor/branch fields from Prisma (KYC, bank, owner, audit)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.select.vendor.select).toEqual({ id: true, slug: true, businessName: true, city: true, logoUrl: true });
    expect(call.select.branch.select).toEqual({ id: true, name: true, city: true, address: true });
    const vendorFields = Object.keys(call.select.vendor.select);
    const branchFields = Object.keys(call.select.branch.select);
    for (const forbidden of ['kycDocuments', 'kycStatus', 'ownerUserId', 'bankAccountNumber', 'bankIfsc', 'gstNumber', 'panNumber', 'businessEmail', 'businessPhone']) {
      expect(vendorFields).not.toContain(forbidden);
      expect(branchFields).not.toContain(forbidden);
    }
  });

  it('filters by categoryId/subcategoryId when given', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get(`/api/v1/catalog/deals?categoryId=${CATEGORY_ID}&subcategoryId=${SUBCATEGORY_ID}`);
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID }) }),
    );
  });
});

describe('GET /api/v1/catalog/deals/:id', () => {
  it('returns 404 for a deal that fails the visibility filter (inactive/rejected/unapproved/hidden vendor or branch)', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(null); // simulates the where-clause excluding it
    const res = await request(app).get(`/api/v1/catalog/deals/${DEAL_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns a visible deal by id, applying the same visibility where-clause as the list', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(serviceDealFixture);
    const res = await request(app).get(`/api/v1/catalog/deals/${DEAL_ID}`);
    expect(res.status).toBe(200);
    expect(prismaMock.deal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DEAL_ID, status: 'ACTIVE', approvalStatus: 'APPROVED' }),
      }),
    );
  });
});
