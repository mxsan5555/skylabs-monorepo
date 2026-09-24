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
