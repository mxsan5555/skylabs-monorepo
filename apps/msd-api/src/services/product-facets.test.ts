import { describe, it, expect } from 'vitest';
import { computeProductFacets, type ProductFacetRow } from './product-facets';

const cat = (id: string) => ({ id, name: id.toUpperCase(), slug: id });
const p = (id: string, price: number, category: string, tag: string | null): ProductFacetRow => ({ id, price: String(price), category: cat(category), tag });
const rows = [p('1', 100, 'skin', 'new'), p('2', 300, 'skin', 'hot'), p('3', 500, 'hair', 'new'), p('4', 700, 'hair', null)];

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
});
