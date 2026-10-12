import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal, CatalogProduct, CatalogTherapist } from '../../../api/catalog';

const listCatalogDealsMock = vi.fn();
const listCatalogProductsMock = vi.fn();
const listCatalogTherapistsMock = vi.fn();

vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
  listCatalogProducts: (...args: unknown[]) => listCatalogProductsMock(...args),
  listCatalogTherapists: (...args: unknown[]) => listCatalogTherapistsMock(...args),
}));

import { useSearchSuggestions } from './use-search-suggestions';

const CATEGORIES: CatalogCategoryWithChildren[] = [
  {
    id: 'cat-1',
    name: 'Massage',
    slug: 'massage',
    description: null,
    children: [{ id: 'sub-1', name: 'Swedish', slug: 'swedish', description: null }],
  },
];

function deal(overrides: Partial<CatalogDeal>): CatalogDeal {
  return {
    id: 'deal-1',
    title: 'Full Body Massage',
    slug: 'full-body-massage',
    shortDescription: null,
    description: null,
    termsAndConditions: null,
    notes: null,
    policy: null,
    originalPrice: '999',
    salePrice: '699',
    discountPercent: 30,
    durationMinutes: 60,
    images: [],
    category: null,
    subcategory: null,
    vendor: null,
    branch: null,
    packages: [],
    ...overrides,
  } as CatalogDeal;
}

function product(overrides: Partial<CatalogProduct>): CatalogProduct {
  return {
    id: 'product-1',
    name: 'Massage Oil',
    slug: 'massage-oil',
    brand: null,
    description: null,
    summary: null,
    image: null,
    imageAlt: null,
    price: '299',
    originalPrice: null,
    discount: null,
    category: null,
    subcategory: null,
    vendor: null,
    ...overrides,
  } as CatalogProduct;
}

function therapist(overrides: Partial<CatalogTherapist>): CatalogTherapist {
  return {
    id: 'therapist-1',
    therapistType: 'Massage Therapist',
    personName: 'Asha Kumar',
    gender: null,
    specialization: null,
    bio: null,
    experienceYears: null,
    photoUrl: null,
    packages: [],
    vendor: null,
    branch: null,
    ...overrides,
  } as CatalogTherapist;
}

const NO_LOCATION = { city: null, state: null, coords: null };

beforeEach(() => {
  vi.useFakeTimers();
  listCatalogDealsMock.mockReset().mockResolvedValue({ data: [] });
  listCatalogProductsMock.mockReset().mockResolvedValue({ data: [] });
  listCatalogTherapistsMock.mockReset().mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSearchSuggestions', () => {
  it('returns nothing below the minimum query length, without calling any API', () => {
    const { result } = renderHook(() => useSearchSuggestions('m', CATEGORIES, NO_LOCATION));
    expect(result.current.groups).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(listCatalogDealsMock).not.toHaveBeenCalled();
  });

  it('matches categories and subcategories synchronously, before the debounced API calls resolve', () => {
    const { result } = renderHook(() => useSearchSuggestions('swed', CATEGORIES, NO_LOCATION));
    const sub = result.current.groups.find((g) => g.key === 'subcategories');
    expect(sub?.items).toEqual([{ id: 'sub-1', label: 'Swedish', sublabel: 'Massage', href: '/category/massage?sub=swedish' }]);
    expect(result.current.loading).toBe(true);
  });

  it('debounces the deal/product/therapist fetch and passes the visitor location through', async () => {
    listCatalogDealsMock.mockResolvedValue({ data: [deal({ id: 'd1', title: 'Hot Stone Massage' })] });
    const location = { city: 'Pune', state: 'Maharashtra', coords: { latitude: 18.5, longitude: 73.8 } };
    const { result } = renderHook(() => useSearchSuggestions('massage', CATEGORIES, location));

    expect(listCatalogDealsMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.loading).toBe(false);
    expect(listCatalogDealsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'massage', city: 'Pune', state: 'Maharashtra', latitude: 18.5, longitude: 73.8 }),
    );
    expect(listCatalogTherapistsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'massage', latitude: 18.5, longitude: 73.8 }),
    );
    const dealsGroup = result.current.groups.find((g) => g.key === 'deals');
    expect(dealsGroup?.items).toEqual([{ id: 'd1', label: 'Hot Stone Massage', sublabel: undefined, href: '/deal/d1' }]);
  });

  it('collapses rapid keystrokes into a single fetch for the latest query only', async () => {
    const { rerender } = renderHook(({ q }) => useSearchSuggestions(q, CATEGORIES, NO_LOCATION), {
      initialProps: { q: 'ma' },
    });
    rerender({ q: 'mas' });
    rerender({ q: 'massa' });
    rerender({ q: 'massage' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(listCatalogDealsMock).toHaveBeenCalledTimes(1);
    expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'massage' }));
  });

  it('discards a stale response that resolves after a newer query has already superseded it', async () => {
    let resolveFirst!: (v: { data: CatalogDeal[] }) => void;
    listCatalogDealsMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));

    const { result, rerender } = renderHook(({ q }) => useSearchSuggestions(q, CATEGORIES, NO_LOCATION), {
      initialProps: { q: 'stale query' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    listCatalogDealsMock.mockResolvedValue({ data: [deal({ id: 'fresh', title: 'Fresh Deal' })] });
    rerender({ q: 'fresh query' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveFirst({ data: [deal({ id: 'stale', title: 'Stale Deal' })] });
      await Promise.resolve();
      await Promise.resolve();
    });

    const dealsGroup = result.current.groups.find((g) => g.key === 'deals');
    expect(dealsGroup?.items.map((i) => i.id)).toEqual(['fresh']);
  });

  it('maps products and therapists to their detail-page hrefs', async () => {
    listCatalogProductsMock.mockResolvedValue({ data: [product({ id: 'p1', name: 'Massage Oil', brand: 'AromaCo' })] });
    listCatalogTherapistsMock.mockResolvedValue({ data: [therapist({ id: 't1', personName: 'Asha Kumar', therapistType: 'Legs Therapist' })] });
    const { result } = renderHook(() => useSearchSuggestions('massage', CATEGORIES, NO_LOCATION));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.groups.find((g) => g.key === 'products')?.items).toEqual([
      { id: 'p1', label: 'Massage Oil', sublabel: 'AromaCo', href: '/products/p1' },
    ]);
    expect(result.current.groups.find((g) => g.key === 'therapists')?.items).toEqual([
      { id: 't1', label: 'Asha Kumar', sublabel: 'Legs Therapist', href: '/therapist/t1' },
    ]);
  });

  it('reports no groups once every source settles empty', async () => {
    const { result } = renderHook(() => useSearchSuggestions('nothingmatches', CATEGORIES, NO_LOCATION));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.groups).toEqual([]);
  });

  it('keeps deal/product suggestions when one endpoint rejects', async () => {
    listCatalogDealsMock.mockResolvedValue({ data: [deal({ id: 'd1', title: 'Hot Stone Massage' })] });
    listCatalogTherapistsMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSearchSuggestions('massage', CATEGORIES, NO_LOCATION));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.groups.find((g) => g.key === 'deals')?.items).toHaveLength(1);
    expect(result.current.groups.find((g) => g.key === 'therapists')).toBeUndefined();
  });
});
