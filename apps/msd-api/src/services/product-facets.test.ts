import { describe, it, expect } from 'vitest';
import { computeProductFacets, type ProductFacetRow } from './product-facets';

const cat = (id: string) => ({ id, name: id.toUpperCase(), slug: id });
const p = (id: string, price: number, category: string, tag: string | null, vendor = 'm1'): ProductFacetRow => ({
  id,
  price: String(price),
  category: cat(category),
  tag,
  vendorId: vendor,
  vendor: { businessName: `Shop ${vendor}` },
});
const rows = [p('1', 100, 'skin', 'new'), p('2', 300, 'skin', 'hot', 'm2'), p('3', 500, 'hair', 'new', 'm2'), p('4', 700, 'hair', null)];

describe('computeProductFacets (ST-40)', () => {
  it('counts categories ignoring the category selection but applying the others', () => {
    const f = computeProductFacets(rows, { categoryIds: ['skin'], tags: ['new'] });
    expect(f.categories).toEqual([
      { id: 'skin', name: 'SKIN', slug: 'skin', count: 1 },
      { id: 'hair', name: 'HAIR', slug: 'hair', count: 1 },
    ]);
  });

  it('counts tags ignoring the tag selection', () => {
    const f = computeProductFacets(rows, { categoryIds: ['skin'], tags: ['new'] });
    expect(f.tags).toEqual([
      { tag: 'expire_soon', count: 0 },
      { tag: 'hot', count: 1 },
      { tag: 'new', count: 1 },
      { tag: 'deal', count: 0 },
    ]);
  });

  it('price range ignores the price selection', () => {
    expect(computeProductFacets(rows, { categoryIds: [], tags: [], minPrice: 400 }).price).toEqual({ min: 100, max: 700 });
    expect(computeProductFacets([], { categoryIds: [], tags: [] }).price).toBeNull();
  });

  it('counts businesses ignoring the business selection but applying the others (item 4)', () => {
    const f = computeProductFacets(rows, { categoryIds: ['hair'], tags: [], vendorIds: ['m1'] });
    expect(f.vendors).toEqual([
      { id: 'm1', name: 'Shop m1', count: 1 },
      { id: 'm2', name: 'Shop m2', count: 1 },
    ]);
    // The business selection narrows the other facets.
    expect(f.categories.find((c) => c.id === 'skin')?.count).toBe(1);
    expect(f.price).toEqual({ min: 700, max: 700 });
  });

  it('sorts businesses by count and lists one with no matches at zero', () => {
    const f = computeProductFacets(rows, { categoryIds: [], tags: ['hot'] });
    expect(f.vendors).toEqual([
      { id: 'm2', name: 'Shop m2', count: 1 },
      { id: 'm1', name: 'Shop m1', count: 0 },
    ]);
  });
});
