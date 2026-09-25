import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api/rbac/client';
import { HOME_DEALS_PAGE_SIZE, HOME_RAIL_SIZE } from '../app/pages/home/home-data';
import { loadCategoryData, loadHomeData, loadShellData } from './loaders';

const m = vi.hoisted(() => ({
  categories: vi.fn(),
  locations: vi.fn(),
  social: vi.fn(),
  category: vi.fn(),
  deals: vi.fn(),
  products: vi.fn(),
  therapists: vi.fn(),
  faqs: vi.fn(),
}));

vi.mock('../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/catalog')>()),
  listCatalogCategories: (...a: unknown[]) => m.categories(...a),
  listCatalogLocations: (...a: unknown[]) => m.locations(...a),
  listCatalogSocialLinks: (...a: unknown[]) => m.social(...a),
  getCatalogCategory: (...a: unknown[]) => m.category(...a),
  listCatalogDeals: (...a: unknown[]) => m.deals(...a),
  listCatalogProducts: (...a: unknown[]) => m.products(...a),
  listCatalogTherapists: (...a: unknown[]) => m.therapists(...a),
  listCatalogFaqs: (...a: unknown[]) => m.faqs(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.categories.mockResolvedValue({ data: [{ id: 'c1' }] });
  m.locations.mockResolvedValue({ data: [{ state: 'Maharashtra', city: 'Pune' }] });
  m.social.mockResolvedValue({ data: [{ id: 's1' }] });
  m.category.mockResolvedValue({ data: { id: 'c1', slug: 'massage', type: 'SERVICE', children: [] } });
  m.deals.mockResolvedValue({ data: [{ id: 'd1' }] });
  m.products.mockResolvedValue({ data: [{ id: 'p1' }] });
  m.therapists.mockResolvedValue({ data: [{ id: 't1' }] });
  m.faqs.mockResolvedValue({ data: [{ id: 'f1' }] });
});

describe('loadShellData', () => {
  it('returns categories, locations and social links', async () => {
    expect(await loadShellData()).toEqual({
      categories: [{ id: 'c1' }],
      locations: [{ state: 'Maharashtra', city: 'Pune' }],
      socialLinks: [{ id: 's1' }],
    });
  });

  it('a failing call yields [] for that field only', async () => {
    m.locations.mockRejectedValue(new Error('down'));
    const data = await loadShellData();
    expect(data.locations).toEqual([]);
    expect(data.categories).toEqual([{ id: 'c1' }]);
  });
});

describe('loadHomeData', () => {
  it('fetches the home lists with the home page sizes and no coordinates', async () => {
    expect(await loadHomeData()).toEqual({
      deals: [{ id: 'd1' }],
      products: [{ id: 'p1' }],
      therapists: [{ id: 't1' }],
      faqs: [{ id: 'f1' }],
    });
    expect(m.deals).toHaveBeenCalledWith({ pageSize: HOME_DEALS_PAGE_SIZE });
    expect(m.products).toHaveBeenCalledWith({ pageSize: HOME_RAIL_SIZE, sort: 'newest' });
    expect(m.therapists).toHaveBeenCalledWith({ pageSize: HOME_RAIL_SIZE });
  });

  it('a failing FAQ call yields []', async () => {
    m.faqs.mockRejectedValue(new Error('down'));
    expect((await loadHomeData()).faqs).toEqual([]);
  });
});

describe('loadCategoryData', () => {
  it('fetches the category and its city deals', async () => {
    const data = await loadCategoryData('massage', 'Pune');
    expect(m.category).toHaveBeenCalledWith('massage');
    expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c1', city: 'Pune', pageSize: 60 }));
    expect(data).toEqual({ category: expect.objectContaining({ id: 'c1' }), deals: [{ id: 'd1' }] });
  });

  it('fetches without city when none is given', async () => {
    await loadCategoryData('massage');
    expect(m.deals.mock.calls[0][0]).not.toHaveProperty('city');
  });

  it('a 404 category returns { category: null, deals: [] }', async () => {
    m.category.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Not found', 404));
    expect(await loadCategoryData('nope')).toEqual({ category: null, deals: [] });
    expect(m.deals).not.toHaveBeenCalled();
  });

  it('does not list deals for a product or therapy category', async () => {
    m.category.mockResolvedValue({ data: { id: 'c2', slug: 'oils', type: 'PRODUCT', children: [] } });
    expect((await loadCategoryData('oils')).deals).toEqual([]);
    expect(m.deals).not.toHaveBeenCalled();
  });
});

describe('payload trimming', () => {
  const fullDeal = {
    id: 'd1',
    title: 'Swedish',
    slug: 'swedish',
    shortDescription: 'short',
    description: 'long text',
    termsAndConditions: 'terms',
    notes: 'secret',
    policy: 'policy',
    originalPrice: '2000',
    salePrice: '1500',
    discountPercent: 25,
    durationMinutes: 60,
    images: ['a.jpg'],
    category: { id: 'c1', name: 'Massage', slug: 'massage', description: 'cat text' },
    subcategory: { id: 's1', name: 'Swedish', slug: 'swedish', description: null },
    vendor: { id: 'v1', slug: 'spa', businessName: 'Spa', city: 'Pune', logoUrl: 'l.png' },
    branch: { id: 'b1', name: 'Main', city: 'Pune', address: '1 Road', latitude: '1', longitude: '2' },
    packages: [{ id: 'p1', durationMinutes: 60, sellingPrice: '1500', originalPrice: null }],
    mediaImages: [{ id: 'm1', storageKey: 'k', originalFilename: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 9, sortOrder: 0, isPrimary: true }],
    mediaVideo: null,
    popularTags: [{ id: 't1', name: 'Trending', slug: 'trending' }],
    distanceKm: null,
  };
  const fullTherapist = {
    id: 't1',
    therapistType: 'Legs',
    personName: 'Ramesh',
    gender: 'M',
    specialization: 'x',
    bio: 'long bio',
    experienceYears: 5,
    photoUrl: 'p.jpg',
    packages: [],
    vendor: fullDeal.vendor,
    branch: fullDeal.branch,
  };
  const fullProduct = {
    id: 'p1',
    name: 'Oil',
    slug: 'oil',
    brand: 'B',
    description: 'long product text',
    summary: 'sum',
    image: 'o.jpg',
    imageAlt: 'Oil',
    price: '100',
    originalPrice: '120',
    discount: 10,
    category: null,
    subcategory: null,
    vendor: fullDeal.vendor,
  };

  it('keeps only the fields the home cards render', async () => {
    m.deals.mockResolvedValue({ data: [fullDeal] });
    m.products.mockResolvedValue({ data: [fullProduct] });
    m.therapists.mockResolvedValue({ data: [fullTherapist] });
    const home = await loadHomeData();
    const json = JSON.stringify(home);
    for (const key of ['notes', 'termsAndConditions', 'policy', 'description', 'shortDescription', 'bio', 'summary', 'address', 'originalFilename']) {
      expect(json).not.toContain(`"${key}"`);
    }
    expect(home.deals[0]).toMatchObject({ id: 'd1', title: 'Swedish', salePrice: '1500', packages: fullDeal.packages });
    expect(home.deals[0].mediaImages).toEqual([{ storageKey: 'k', sortOrder: 0, isPrimary: true }]);
    expect(home.therapists[0]).toMatchObject({ id: 't1', personName: 'Ramesh', photoUrl: 'p.jpg' });
    expect(home.products[0]).toMatchObject({ id: 'p1', name: 'Oil', image: 'o.jpg', price: '100' });
  });

  it('trims category page deals the same way', async () => {
    m.deals.mockResolvedValue({ data: [fullDeal] });
    const data = await loadCategoryData('massage');
    expect(JSON.stringify(data.deals)).not.toMatch(/"notes"|"termsAndConditions"/);
    expect(data.deals[0].branch).toEqual({ id: 'b1', name: 'Main', city: 'Pune' });
  });
});
