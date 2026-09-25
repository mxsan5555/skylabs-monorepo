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
  vendor: { id: 'vendor-1', businessName: 'ABC Salon', city: 'Gorakhpur' },
  branch: { id: 'branch-1', name: 'Gorakhpur Branch', city: 'Gorakhpur' },
};

const PRODUCT_ID = 'd1d1d1d1-0000-4000-8000-000000000004';

const productFixture = {
  id: PRODUCT_ID,
  name: 'Face Cream',
  slug: 'face-cream',
  brand: 'GlowCare',
  description: null,
  summary: null,
  image: null,
  imageAlt: null,
  price: '499.00',
  originalPrice: '599.00',
  discount: 17,
  category: { id: CATEGORY_ID, name: 'Salon & Grooming', slug: 'salon-grooming' },
  subcategory: null,
  vendor: { id: 'vendor-1', businessName: 'ABC Salon', city: 'Gorakhpur' },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Every public catalog read now enriches its result with active Popular Tag mappings (see
  // catalog.service.ts's withDealPopularTags/withTherapistPopularTags/withCategoryPopularTags) —
  // arranged once here (rather than per-test) since every test in this file exercises one of
  // those enriched reads; individual tests can still override with mockResolvedValueOnce.
  prismaMock.popularTagDeal.findMany.mockResolvedValue([]);
  prismaMock.popularTagProduct.findMany.mockResolvedValue([]);
  prismaMock.popularTagTherapist.findMany.mockResolvedValue([]);
  prismaMock.popularTagCategory.findMany.mockResolvedValue([]);
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
    // getActiveCategoryBySlugOrThrow's `include` now nests two levels deep (Subcategory[] ->
    // Type[] on each — see category.service.ts), so the fixture's subcategory needs its own
    // (possibly empty) `children` array too, matching that shape.
    prismaMock.category.findFirst.mockResolvedValue({ ...categoryFixture, children: [{ ...subcategoryFixture, children: [] }] });
    const res = await request(app).get('/api/v1/catalog/categories/salon-grooming');
    expect(res.status).toBe(200);
    expect(prismaMock.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'salon-grooming', isActive: true } }),
    );
  });
});

describe('GET /api/v1/catalog/deals', () => {
  it('3. shows a service deal (no master catalog row — title/duration live on the Deal itself)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals');
    expect(res.status).toBe(200);
    expect(res.body.data[0].title).toBe('Haircut deal');
    expect(res.body.data[0].product).toBeUndefined();
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

  it('never filters by productId — Deal has no Product concept (fully independent catalog entities)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('productId');
    expect(call.where.AND).toBeUndefined();
  });

  it('10. a service deal carries durationMinutes', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals');
    expect(res.body.data[0].durationMinutes).toBe(30);
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
    expect(call.select.vendor.select).toEqual({
      id: true,
      slug: true,
      businessName: true,
      city: true,
      logoUrl: true,
      mediaImages: expect.anything(),
      mediaVideo: expect.anything(),
    });
    expect(call.select.branch.select).toEqual({ id: true, name: true, city: true, address: true, latitude: true, longitude: true });
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

  it('state/city narrow results by merging into the active-branch filter, never overwriting it', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?state=Uttar%20Pradesh&city=Gorakhpur');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.branch).toEqual({ is: { isActive: true, state: 'Uttar Pradesh', city: 'Gorakhpur' } });
  });

  it('omitting state/city leaves the plain active-branch filter unchanged (backward-compat regression guard)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.branch).toEqual({ isActive: true });
  });

  it('sort=discount orders by discountPercent desc, nulls last', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?sort=discount');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ discountPercent: { sort: 'desc', nulls: 'last' } }] }),
    );
  });

  it('omitting sort still orders by createdAt desc (backward-compat regression guard)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('sort=newest explicitly also orders by createdAt desc', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?sort=newest');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('minPrice/maxPrice bound results via a salePrice where-filter', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?minPrice=300&maxPrice=800');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ salePrice: { gte: 300, lte: 800 } }) }),
    );
  });

  it('latitude/longitude present: computes real distanceKm per branch and sorts nearest-first, ignoring page skip/take (full-set sort)', async () => {
    // Gorakhpur (near) vs. Delhi (far) — a customer standing at the Gorakhpur coordinates should
    // see the Gorakhpur-branch deal first with a small distanceKm, the Delhi one after it with a
    // much larger one, regardless of `findMany`'s own array order (never a fabricated ordering).
    const nearDeal = { ...serviceDealFixture, id: 'near-deal', branch: { ...serviceDealFixture.branch, latitude: '26.7606', longitude: '83.3732' } };
    const farDeal = { ...serviceDealFixture, id: 'far-deal', branch: { ...serviceDealFixture.branch, latitude: '28.6139', longitude: '77.2090' } };
    prismaMock.deal.findMany.mockResolvedValue([farDeal, nearDeal]);
    prismaMock.deal.count.mockResolvedValue(2);
    const res = await request(app).get('/api/v1/catalog/deals?latitude=26.7606&longitude=83.3732');
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual(['near-deal', 'far-deal']);
    expect(res.body.data[0].distanceKm).toBeCloseTo(0, 1);
    expect(res.body.data[1].distanceKm).toBeGreaterThan(500);
    // The full matching set is fetched (no skip/take) so distance sort/pagination is correct
    // across the whole result set, not just whatever page-sized slice the DB would have returned.
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.anything(), take: expect.anything() }));
  });

  it('a branch with no coordinates gets distanceKm: null even when the caller supplies coordinates — never fabricated', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals?latitude=26.7606&longitude=83.3732');
    expect(res.body.data[0].distanceKm).toBeNull();
  });

  it('omitting latitude/longitude leaves distanceKm null and preserves the original DB order/pagination (backward-compat regression guard)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals');
    expect(res.body.data[0].distanceKm).toBeNull();
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: expect.any(Number) }));
  });

  it('422s an out-of-range latitude instead of crashing', async () => {
    const res = await request(app).get('/api/v1/catalog/deals?latitude=999&longitude=83.37');
    expect(res.status).toBe(422);
  });

  it('minPrice alone only sets gte (no lte key)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?minPrice=300');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.salePrice).toEqual({ gte: 300 });
  });

  it('omitting both minPrice and maxPrice applies no salePrice filter at all (backward-compat regression guard)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.salePrice).toBeUndefined();
  });
});

describe('GET /api/v1/catalog/deals sorts and filters', () => {
  const VENDOR_ID_1 = 'f1f1f1f1-0000-4000-8000-000000000001';
  const VENDOR_ID_2 = 'f2f2f2f2-0000-4000-8000-000000000002';
  const BRANCH_ID_1 = 'f3f3f3f3-0000-4000-8000-000000000003';

  it('1. sort=price_asc orders by salePrice asc, ties by createdAt desc', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?sort=price_asc');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ salePrice: 'asc' }, { createdAt: 'desc' }] }),
    );
  });

  it('2. sort=price_desc orders by salePrice desc, ties by createdAt desc', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals?sort=price_desc');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ salePrice: 'desc' }, { createdAt: 'desc' }] }),
    );
  });

  it('3. no sort defaults to relevance, which is createdAt desc without coordinates (unchanged SQL order)', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/deals');
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('4. vendorIds=<uuid1>,<uuid2> filters via vendorId in [...]; branchIds=<uuid> filters via branchId in [...]', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.deal.count.mockResolvedValue(0);
    await request(app).get(`/api/v1/catalog/deals?vendorIds=${VENDOR_ID_1},${VENDOR_ID_2}&branchIds=${BRANCH_ID_1}`);
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.vendorId).toEqual({ in: [VENDOR_ID_1, VENDOR_ID_2] });
    expect(call.where.branchId).toEqual({ in: [BRANCH_ID_1] });
  });

  it('5. vendorIds=not-a-uuid fails validation', async () => {
    const res = await request(app).get('/api/v1/catalog/deals?vendorIds=not-a-uuid');
    expect(res.status).toBe(422);
    expect(prismaMock.deal.findMany).not.toHaveBeenCalled();
  });

  it('6. radiusKm + coordinates: drops out-of-radius deals, without skip/take (full-set filter+sort+paginate in memory)', async () => {
    const nearDeal = { ...serviceDealFixture, id: 'near-deal', branch: { ...serviceDealFixture.branch, latitude: '26.7606', longitude: '83.3732' } };
    const farDeal = { ...serviceDealFixture, id: 'far-deal', branch: { ...serviceDealFixture.branch, latitude: '26.5', longitude: '83.3732' } }; // ~29km south
    prismaMock.deal.findMany.mockResolvedValue([farDeal, nearDeal]);
    prismaMock.deal.count.mockResolvedValue(2);
    const res = await request(app).get('/api/v1/catalog/deals?radiusKm=5&latitude=26.7606&longitude=83.3732');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('near-deal');
    expect(res.body.meta.total).toBe(1);
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.anything(), take: expect.anything() }));
  });

  it('7. radiusKm without coordinates is ignored; the normal SQL skip/take path is used', async () => {
    prismaMock.deal.findMany.mockResolvedValue([serviceDealFixture]);
    prismaMock.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/deals?radiusKm=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.deal.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: expect.any(Number) }));
  });

  it('8. radiusKm=0 and radiusKm=501 fail validation', async () => {
    const zero = await request(app).get('/api/v1/catalog/deals?radiusKm=0');
    expect(zero.status).toBe(422);
    const tooBig = await request(app).get('/api/v1/catalog/deals?radiusKm=501');
    expect(tooBig.status).toBe(422);
  });

  it('9. sort=discount with coordinates keeps the findMany (discount) order instead of forcing nearest-first', async () => {
    const nearDeal = { ...serviceDealFixture, id: 'near-deal', discountPercent: 10, branch: { ...serviceDealFixture.branch, latitude: '26.7606', longitude: '83.3732' } };
    const farDeal = { ...serviceDealFixture, id: 'far-deal', discountPercent: 50, branch: { ...serviceDealFixture.branch, latitude: '28.6139', longitude: '77.2090' } };
    // findMany already returns them in "discount desc" order (as the DB's own ORDER BY would) —
    // farDeal (50% off) before nearDeal (10% off), even though nearDeal is geographically closer.
    prismaMock.deal.findMany.mockResolvedValue([farDeal, nearDeal]);
    prismaMock.deal.count.mockResolvedValue(2);
    const res = await request(app).get('/api/v1/catalog/deals?sort=discount&latitude=26.7606&longitude=83.3732');
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual(['far-deal', 'near-deal']);
  });
});

describe('GET /api/v1/catalog/deals/facets', () => {
  const facetRows = [
    { id: 'deal-a', vendorId: 'vendor-1', branchId: 'branch-1', salePrice: '500', vendor: { businessName: 'Glow Beauty Studio' }, branch: { name: 'Taramandal Branch', city: 'Gorakhpur', latitude: '26.7606', longitude: '83.3732' } },
    { id: 'deal-b', vendorId: 'vendor-1', branchId: 'branch-2', salePrice: '900', vendor: { businessName: 'Glow Beauty Studio' }, branch: { name: 'East Branch', city: 'Gorakhpur', latitude: '26.77', longitude: '83.3732' } },
    { id: 'deal-c', vendorId: 'vendor-2', branchId: 'branch-3', salePrice: '1500', vendor: { businessName: 'Zen Spa' }, branch: { name: 'Basti Branch', city: 'Basti', latitude: '26.5', longitude: '83.3732' } },
  ];

  it('1. returns vendors/branches/distance/price facets computed from the base-filtered rows', async () => {
    prismaMock.deal.findMany.mockResolvedValue(facetRows);
    const res = await request(app).get(`/api/v1/catalog/deals/facets?categoryId=${CATEGORY_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vendors).toEqual([
      { id: 'vendor-1', name: 'Glow Beauty Studio', count: 2 },
      { id: 'vendor-2', name: 'Zen Spa', count: 1 },
    ]);
    expect(res.body.data.branches).toEqual([
      { id: 'branch-1', name: 'Taramandal Branch', city: 'Gorakhpur', vendorName: 'Glow Beauty Studio', count: 1 },
      { id: 'branch-2', name: 'East Branch', city: 'Gorakhpur', vendorName: 'Glow Beauty Studio', count: 1 },
      { id: 'branch-3', name: 'Basti Branch', city: 'Basti', vendorName: 'Zen Spa', count: 1 },
    ]);
    expect(res.body.data.distance).toEqual([]);
    expect(res.body.data.price).toEqual({ min: 500, max: 1500 });
  });

  it('2. the base findMany excludes vendorIds/branchIds/price filters (applied in memory) but includes categoryId, with a select limited to facet fields', async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    await request(app).get(`/api/v1/catalog/deals/facets?categoryId=${CATEGORY_ID}&vendorIds=f1f1f1f1-0000-4000-8000-000000000001&minPrice=100`);
    const call = prismaMock.deal.findMany.mock.calls[0][0];
    expect(call.where.categoryId).toBe(CATEGORY_ID);
    expect(call.where.vendorId).toBeUndefined();
    expect(call.where.salePrice).toBeUndefined();
    expect(call.select).toEqual({
      id: true,
      vendorId: true,
      branchId: true,
      salePrice: true,
      vendor: { select: { businessName: true } },
      branch: { select: { name: true, city: true, latitude: true, longitude: true } },
    });
  });

  it('3. with coordinates, distance has all 6 buckets', async () => {
    prismaMock.deal.findMany.mockResolvedValue(facetRows);
    const res = await request(app).get('/api/v1/catalog/deals/facets?latitude=26.7606&longitude=83.3732');
    expect(res.status).toBe(200);
    expect(res.body.data.distance).toHaveLength(6);
  });

  it('4. vendorIds=bad fails validation', async () => {
    const res = await request(app).get('/api/v1/catalog/deals/facets?vendorIds=bad');
    expect(res.status).toBe(422);
    expect(prismaMock.deal.findMany).not.toHaveBeenCalled();
  });

  it("5. is not swallowed by /deals/:id (registered before it, so 'facets' is never parsed as a deal id)", async () => {
    prismaMock.deal.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/catalog/deals/facets');
    expect(res.status).toBe(200);
    expect(prismaMock.deal.findFirst).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/catalog/products', () => {
  it('lists active products with an active vendor, no branch/approval concepts (Product is fully independent of Deal)', async () => {
    prismaMock.product.findMany.mockResolvedValue([productFixture]);
    prismaMock.product.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/products');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Face Cream');
    expect(res.body.data[0].price).toBe('499.00');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true, vendor: { status: 'ACTIVE' } }) }),
    );
  });

  it('never requests private vendor fields from Prisma (KYC, bank, owner, audit)', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/products');
    const call = prismaMock.product.findMany.mock.calls[0][0];
    const vendorFields = Object.keys(call.select.vendor.select);
    for (const forbidden of ['kycDocuments', 'kycStatus', 'ownerUserId', 'bankAccountNumber', 'bankIfsc', 'gstNumber', 'panNumber', 'businessEmail', 'businessPhone']) {
      expect(vendorFields).not.toContain(forbidden);
    }
  });

  it('filters by categoryId/subcategoryId/vendorId when given', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    const vendorId = 'e5e5e5e5-0000-4000-8000-000000000009';
    await request(app).get(`/api/v1/catalog/products?categoryId=${CATEGORY_ID}&subcategoryId=${SUBCATEGORY_ID}&vendorId=${vendorId}`);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID, vendorId }) }),
    );
  });

  it('sort=discount orders by discount desc, nulls last', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/products?sort=discount');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ discount: { sort: 'desc', nulls: 'last' } }] }),
    );
  });

  it('minPrice/maxPrice bound results via a price where-filter', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/products?minPrice=300&maxPrice=800');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ price: { gte: 300, lte: 800 } }) }),
    );
  });

  it('6. sort=price_asc orders by price asc, ties by createdAt desc', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/products?sort=price_asc');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ price: 'asc' }, { createdAt: 'desc' }] }),
    );
  });

  it('6. sort=price_desc orders by price desc, ties by createdAt desc', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/products?sort=price_desc');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ price: 'desc' }, { createdAt: 'desc' }] }),
    );
  });

  it('6. sort=relevance (the new default) orders by createdAt desc, same as newest', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/products?sort=relevance');
    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});

describe('GET /api/v1/catalog/products/:id', () => {
  it('returns 404 for a product that fails the visibility filter (inactive product or inactive vendor)', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/catalog/products/${PRODUCT_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns a visible product by id', async () => {
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    const res = await request(app).get(`/api/v1/catalog/products/${PRODUCT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Face Cream');
    expect(prismaMock.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: PRODUCT_ID, isActive: true, vendor: { status: 'ACTIVE' } }) }),
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

describe('GET /api/v1/catalog/vendors/:slug', () => {
  const vendorFixture = { id: 'vendor-1', slug: 'abc-salon', businessName: 'ABC Salon', branches: [] };

  it('404s for an unknown or non-ACTIVE vendor', async () => {
    prismaMock.vendor.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/catalog/vendors/abc-salon');
    expect(res.status).toBe(404);
  });

  it('narrows nested branches by state/city when given, merging into the active-branch filter', async () => {
    prismaMock.vendor.findFirst.mockResolvedValue(vendorFixture);
    const res = await request(app).get('/api/v1/catalog/vendors/abc-salon?state=Uttar%20Pradesh&city=Gorakhpur');
    expect(res.status).toBe(200);
    const call = prismaMock.vendor.findFirst.mock.calls[0][0];
    expect(call.select.branches.where).toEqual({ isActive: true, state: 'Uttar Pradesh', city: 'Gorakhpur' });
  });

  it('omitting state/city leaves the plain active-branch filter unchanged (backward-compat regression guard)', async () => {
    prismaMock.vendor.findFirst.mockResolvedValue(vendorFixture);
    const res = await request(app).get('/api/v1/catalog/vendors/abc-salon');
    expect(res.status).toBe(200);
    const call = prismaMock.vendor.findFirst.mock.calls[0][0];
    expect(call.select.branches.where).toEqual({ isActive: true });
  });
});

describe('GET /api/v1/catalog/locations', () => {
  it('returns {state, city, latitude, longitude} per active city, averaging branch coordinates', async () => {
    prismaMock.branch.groupBy.mockResolvedValue([
      { state: 'Maharashtra', city: 'Pune', _avg: { latitude: '18.520400', longitude: '73.856700' } },
      { state: 'Uttar Pradesh', city: 'Gorakhpur', _avg: { latitude: null, longitude: null } },
    ]);
    const res = await request(app).get('/api/v1/catalog/locations');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { state: 'Maharashtra', city: 'Pune', latitude: 18.5204, longitude: 73.8567 },
      { state: 'Uttar Pradesh', city: 'Gorakhpur', latitude: null, longitude: null },
    ]);
    expect(prismaMock.branch.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['state', 'city'],
        where: expect.objectContaining({ isActive: true }),
        _avg: { latitude: true, longitude: true },
      }),
    );
  });
});

/**
 * Feature: public Therapist catalog (GET /catalog/therapists, /catalog/therapists/:id)
 * Scenario: previously zero test coverage despite being a named stop in the purchase flow
 * (Auth -> Categories -> ... -> Therapists -> ... ), and a public unauthenticated surface.
 *
 * Given: an anonymous visitor browsing therapists
 * When: they list therapists (optionally filtered by vendorId/branchId/search) or view one by id
 * Then: only active therapists at an ACTIVE vendor / active branch are ever visible
 *
 * Edge cases:
 * - an inactive therapist, or one at an inactive branch/suspended vendor, 404s on direct lookup
 *   rather than leaking a raw row
 * - an empty result set still returns 200 with an empty array + correct pagination meta, not an
 *   error
 */
const THERAPIST_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const therapistFixture = {
  id: THERAPIST_ID,
  therapistType: 'Massage Therapist',
  personName: 'Suresh Chandra',
  isActive: true,
  vendor: { id: 'vendor-1', businessName: 'ABC Salon', slug: 'abc-salon' },
  branch: { id: 'branch-1', name: 'Gorakhpur Branch', city: 'Gorakhpur' },
};

describe('GET /api/v1/catalog/therapists', () => {
  it('returns the active therapist list with no auth required', async () => {
    prismaMock.therapist.findMany.mockResolvedValue([therapistFixture]);
    prismaMock.therapist.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/therapists');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ ...therapistFixture, popularTags: [], distanceKm: null }]);
    expect(prismaMock.therapist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, vendor: { status: 'ACTIVE' }, branch: { isActive: true } }),
      }),
    );
  });

  it('returns an empty array with correct pagination meta when nothing matches — not an error', async () => {
    prismaMock.therapist.findMany.mockResolvedValue([]);
    prismaMock.therapist.count.mockResolvedValue(0);
    const res = await request(app).get('/api/v1/catalog/therapists?branchId=00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 0 }));
  });

  it('filters by vendorId when provided', async () => {
    prismaMock.therapist.findMany.mockResolvedValue([therapistFixture]);
    prismaMock.therapist.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/therapists?vendorId=11111111-0000-4000-8000-000000000000');
    expect(res.status).toBe(200);
    expect(prismaMock.therapist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: '11111111-0000-4000-8000-000000000000' }) }),
    );
  });

  it('422s an invalid (non-uuid) branchId query param', async () => {
    const res = await request(app).get('/api/v1/catalog/therapists?branchId=not-a-uuid');
    expect(res.status).toBe(422);
    expect(prismaMock.therapist.findMany).not.toHaveBeenCalled();
  });

  const THERAPY_CATEGORY_ID = '99999999-0000-4000-8000-000000000009';
  const SUBCATEGORY_ID = '88888888-0000-4000-8000-000000000008';
  const TYPE_TIER_ID = '77777777-0000-4000-8000-000000000007';

  it('categoryId (no subcategoryId): resolves the full 2-level subtree below it, not just direct children', async () => {
    // Therapist.specializationCategoryId is tagged at the Type tier (2 levels below a top-level
    // category) in real seed data — a naive single-level `parentId` lookup would silently miss it.
    prismaMock.category.findMany
      .mockResolvedValueOnce([{ id: SUBCATEGORY_ID }]) // direct children of the selected node
      .mockResolvedValueOnce([{ id: TYPE_TIER_ID }]); // grandchildren (Type tier)
    prismaMock.therapist.findMany.mockResolvedValue([therapistFixture]);
    prismaMock.therapist.count.mockResolvedValue(1);
    const res = await request(app).get(`/api/v1/catalog/therapists?categoryId=${THERAPY_CATEGORY_ID}`);
    expect(res.status).toBe(200);
    expect(prismaMock.therapist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          specializationCategoryId: { in: [THERAPY_CATEGORY_ID, SUBCATEGORY_ID, TYPE_TIER_ID] },
        }),
      }),
    );
  });

  it('subcategoryId wins over categoryId and resolves its own subtree', async () => {
    prismaMock.category.findMany
      .mockResolvedValueOnce([{ id: TYPE_TIER_ID }]) // children of the subcategory
      .mockResolvedValueOnce([]); // no grandchildren below the Type tier
    prismaMock.therapist.findMany.mockResolvedValue([]);
    prismaMock.therapist.count.mockResolvedValue(0);
    const res = await request(app).get(
      `/api/v1/catalog/therapists?categoryId=${THERAPY_CATEGORY_ID}&subcategoryId=${SUBCATEGORY_ID}`,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.therapist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          specializationCategoryId: { in: [SUBCATEGORY_ID, TYPE_TIER_ID] },
        }),
      }),
    );
  });
});

describe('GET /api/v1/catalog/therapists/:id', () => {
  it('returns 404 for an unknown therapist id', async () => {
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/catalog/therapists/${THERAPIST_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 (not the raw row) for an inactive therapist — never leaks a hidden therapist by id', async () => {
    // getPublicTherapistOrThrow's `where` already folds isActive/vendor.status/branch.isActive
    // into the query itself, so the mock returning null here IS the correct simulation of "this
    // id exists but fails the visibility gate" — same convention as the deals/:id 404 test above.
    prismaMock.therapist.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/catalog/therapists/${THERAPIST_ID}`);
    expect(res.status).toBe(404);
    expect(prismaMock.therapist.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: THERAPIST_ID, isActive: true, vendor: { status: 'ACTIVE' }, branch: { isActive: true } }),
      }),
    );
  });

  it('returns the therapist detail for a valid, active id', async () => {
    prismaMock.therapist.findFirst.mockResolvedValue(therapistFixture);
    const res = await request(app).get(`/api/v1/catalog/therapists/${THERAPIST_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ...therapistFixture, popularTags: [] });
  });

  it('422s a non-uuid :id param', async () => {
    const res = await request(app).get('/api/v1/catalog/therapists/not-a-uuid');
    expect(res.status).toBe(422);
    expect(prismaMock.therapist.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * Feature: public CMS reads (GET /catalog/blog-posts*, /catalog/about-us, /catalog/contact-us)
 * Scenario: anonymous storefront visitors reading Blog Posts / About Us / Contact Us content.
 *
 * Given: an anonymous visitor with no Authorization header at all
 * When: they list/read blog posts or read the About Us / Contact Us singleton
 * Then: only PUBLISHED posts are ever visible, and the singleton content routes work with zero auth
 *
 * Edge cases:
 * - a DRAFT post's slug 404s on direct lookup, same as a nonexistent slug — never leaks a hidden post
 * - an empty result set still returns 200 with an empty array, not an error
 */
const publishedPostFixture = {
  id: 'aa000000-0000-4000-8000-000000000001',
  title: 'Deep Tissue Massage Benefits',
  slug: 'deep-tissue-massage-benefits',
  excerpt: 'Everything you need to know.',
  category: { slug: 'wellness' },
  body: [{ type: 'paragraph', text: 'Hello world' }],
  author: 'Jane Doe',
  readMinutes: 4,
  tags: ['wellness'],
  publishedAt: new Date('2025-01-01T00:00:00.000Z'),
  metaTitle: null,
  metaDescription: null,
  mediaImages: [],
};

describe('GET /api/v1/catalog/blog-posts', () => {
  it('returns only PUBLISHED posts with no auth required', async () => {
    prismaMock.blogPost.findMany.mockResolvedValue([publishedPostFixture]);
    prismaMock.blogPost.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/catalog/blog-posts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('never accepts a caller-supplied status override', async () => {
    prismaMock.blogPost.findMany.mockResolvedValue([]);
    prismaMock.blogPost.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/blog-posts?status=DRAFT');
    const call = prismaMock.blogPost.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('PUBLISHED');
  });

  it('returns an empty array with pagination meta when nothing matches — not an error', async () => {
    prismaMock.blogPost.findMany.mockResolvedValue([]);
    prismaMock.blogPost.count.mockResolvedValue(0);
    const res = await request(app).get('/api/v1/catalog/blog-posts');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 0 }));
  });

  it('filters by categorySlug/search when given', async () => {
    prismaMock.blogPost.findMany.mockResolvedValue([]);
    prismaMock.blogPost.count.mockResolvedValue(0);
    await request(app).get('/api/v1/catalog/blog-posts?categorySlug=wellness&search=tissue');
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { is: { slug: 'wellness' } },
          title: { contains: 'tissue', mode: 'insensitive' },
        }),
      }),
    );
  });
});

describe('GET /api/v1/catalog/blog-posts/:slug', () => {
  it('returns the published post by slug with no auth required', async () => {
    prismaMock.blogPost.findFirst.mockResolvedValue(publishedPostFixture);
    const res = await request(app).get('/api/v1/catalog/blog-posts/deep-tissue-massage-benefits');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('deep-tissue-massage-benefits');
    expect(prismaMock.blogPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'deep-tissue-massage-benefits', status: 'PUBLISHED' } }),
    );
  });

  it('404s for a DRAFT post slug — never leaks an unpublished post by slug', async () => {
    // getPublishedBlogPostBySlugOrThrow's `where` already folds status: 'PUBLISHED' into the
    // query, so the mock returning null here IS the correct simulation of "this slug exists but
    // is still a draft" — same convention as the deals/:id and therapists/:id 404 tests above.
    prismaMock.blogPost.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/catalog/blog-posts/still-a-draft');
    expect(res.status).toBe(404);
  });

  it('404s for a slug that does not exist at all', async () => {
    prismaMock.blogPost.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/catalog/blog-posts/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/catalog/about-us', () => {
  it('returns the saved About Us content with no Authorization header at all', async () => {
    prismaMock.aboutUsContent.findUnique.mockResolvedValue({
      id: 'singleton',
      heroTitle: 'Who we are',
      heroSubtitle: '',
      missionStatement: '',
      body: [],
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      mediaImages: [],
    });
    const res = await request(app).get('/api/v1/catalog/about-us');
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('Who we are');
  });

  it('find-or-creates the singleton row when nothing has been saved yet', async () => {
    prismaMock.aboutUsContent.findUnique.mockResolvedValue(null);
    prismaMock.aboutUsContent.create.mockResolvedValue({
      id: 'singleton',
      heroTitle: '',
      heroSubtitle: '',
      missionStatement: '',
      body: [],
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      mediaImages: [],
    });
    const res = await request(app).get('/api/v1/catalog/about-us');
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('');
  });
});

describe('GET /api/v1/catalog/contact-us', () => {
  it('returns the saved Contact Us content with no Authorization header at all', async () => {
    prismaMock.contactUsContent.findUnique.mockResolvedValue({
      id: 'singleton',
      address: '123 Main St',
      phone: '555-0100',
      email: 'hello@skylabs.dev',
      mapEmbedUrl: '',
      socialLinks: [],
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const res = await request(app).get('/api/v1/catalog/contact-us');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('hello@skylabs.dev');
  });

  it('find-or-creates the singleton row when nothing has been saved yet', async () => {
    prismaMock.contactUsContent.findUnique.mockResolvedValue(null);
    prismaMock.contactUsContent.create.mockResolvedValue({
      id: 'singleton',
      address: '',
      phone: '',
      email: '',
      mapEmbedUrl: '',
      socialLinks: [],
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const res = await request(app).get('/api/v1/catalog/contact-us');
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('');
  });
});

describe('GET /api/v1/catalog/faqs', () => {
  it('returns only isActive FAQs, with no Authorization header at all', async () => {
    prismaMock.faq.findMany.mockResolvedValue([
      { id: 'faq-1', question: 'How do I book?', answer: 'Select a deal and pay.' },
    ]);
    const res = await request(app).get('/api/v1/catalog/faqs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('never exposes isActive/sortOrder/timestamps — only question/answer', async () => {
    prismaMock.faq.findMany.mockResolvedValue([
      { id: 'faq-1', question: 'How do I book?', answer: 'Select a deal and pay.' },
    ]);
    const res = await request(app).get('/api/v1/catalog/faqs');
    expect(prismaMock.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, question: true, answer: true } }),
    );
    expect(res.body.data[0]).not.toHaveProperty('sortOrder');
  });

  it('returns an empty array when there are no active FAQs — not an error', async () => {
    prismaMock.faq.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/catalog/faqs');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

/**
 * Feature: public CMS reads for the new content types (Blog Categories / Legal Pages /
 * How It Works / Careers / Social Media links).
 * Scenario: anonymous storefront visitors reading each of these with no auth.
 *
 * Given: an anonymous visitor with no Authorization header at all
 * When: they read blog categories / a legal page by slug / how-it-works / careers / social links
 * Then: only active/published content is ever visible, and every route works with zero auth
 *
 * Edge cases:
 * - an unknown or DRAFT website-page slug 404s, same as never leaking a hidden page
 * - an empty result set still returns 200 with an empty array, not an error
 */
describe('GET /api/v1/catalog/blog-categories', () => {
  it('returns only isActive blog categories, with no Authorization header at all', async () => {
    prismaMock.blogCategory.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Wellness', slug: 'wellness', description: null },
    ]);
    const res = await request(app).get('/api/v1/catalog/blog-categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.blogCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('returns an empty array when there are no active categories — not an error', async () => {
    prismaMock.blogCategory.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/catalog/blog-categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/v1/catalog/pages/:slug', () => {
  it('returns the published page by slug with no auth required', async () => {
    prismaMock.websitePage.findFirst.mockResolvedValue({
      id: 'page-1',
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      content: [{ type: 'paragraph', text: 'We respect your privacy.' }],
      status: 'PUBLISHED',
      metaTitle: null,
      metaDescription: null,
    });
    const res = await request(app).get('/api/v1/catalog/pages/privacy-policy');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('privacy-policy');
    expect(prismaMock.websitePage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'privacy-policy', status: 'PUBLISHED' } }),
    );
  });

  it('404s for a DRAFT page slug — never leaks an unpublished page', async () => {
    // getPublicWebsitePageBySlugOrThrow's `where` already folds status: 'PUBLISHED' into the
    // query, so the mock returning null here IS the correct simulation of "this slug exists but
    // is still a draft".
    prismaMock.websitePage.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/catalog/pages/still-a-draft');
    expect(res.status).toBe(404);
  });

  it('404s for an unknown slug', async () => {
    prismaMock.websitePage.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/catalog/pages/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/catalog/how-it-works', () => {
  it('returns the hero content plus only active steps, with no Authorization header at all', async () => {
    prismaMock.howItWorksContent.findUnique.mockResolvedValue({
      id: 'singleton',
      heroTitle: 'How It Works',
      heroSubtitle: 'Book in three easy steps',
      metaTitle: null,
      metaDescription: null,
    });
    prismaMock.howItWorksStep.findMany.mockResolvedValue([
      { id: 'step-1', title: 'Choose a Deal', description: 'Browse and pick.', icon: 'search', sortOrder: 0, isActive: true },
    ]);
    const res = await request(app).get('/api/v1/catalog/how-it-works');
    expect(res.status).toBe(200);
    expect(res.body.data.steps).toHaveLength(1);
    expect(res.body.data.content.heroTitle).toBe('How It Works');
    expect(prismaMock.howItWorksStep.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('returns an empty steps array when there are no active steps yet — not an error', async () => {
    prismaMock.howItWorksContent.findUnique.mockResolvedValue({
      id: 'singleton',
      heroTitle: null,
      heroSubtitle: null,
      metaTitle: null,
      metaDescription: null,
    });
    prismaMock.howItWorksStep.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/catalog/how-it-works');
    expect(res.status).toBe(200);
    expect(res.body.data.steps).toEqual([]);
  });
});

describe('GET /api/v1/catalog/careers', () => {
  it('returns the hero content plus only PUBLISHED job listings, with no Authorization header at all', async () => {
    prismaMock.careersPageContent.findUnique.mockResolvedValue({
      id: 'singleton',
      heroTitle: 'Careers',
      heroSubtitle: 'Join our team',
      metaTitle: null,
      metaDescription: null,
    });
    prismaMock.careersJobListing.findMany.mockResolvedValue([
      { id: 'job-1', jobTitle: 'Massage Therapist', status: 'PUBLISHED' },
    ]);
    const res = await request(app).get('/api/v1/catalog/careers');
    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(1);
    expect(prismaMock.careersJobListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });

  it('never accepts a caller-supplied status override — unpublished DRAFT jobs are excluded server-side', async () => {
    prismaMock.careersPageContent.findUnique.mockResolvedValue({
      id: 'singleton',
      heroTitle: null,
      heroSubtitle: null,
      metaTitle: null,
      metaDescription: null,
    });
    prismaMock.careersJobListing.findMany.mockResolvedValue([]);
    await request(app).get('/api/v1/catalog/careers?status=DRAFT');
    const call = prismaMock.careersJobListing.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('PUBLISHED');
  });
});

describe('GET /api/v1/catalog/social-links', () => {
  it('returns only isActive social links, with no Authorization header at all', async () => {
    prismaMock.socialMediaLink.findMany.mockResolvedValue([
      { id: 'link-1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/skylabs' },
    ]);
    const res = await request(app).get('/api/v1/catalog/social-links');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.socialMediaLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, select: { id: true, platform: true, displayName: true, url: true } }),
    );
  });

  it('returns an empty array when there are no active social links — not an error', async () => {
    prismaMock.socialMediaLink.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/catalog/social-links');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
