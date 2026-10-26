/** Filter-panel counts for the public product list (`GET /catalog/products/facets`). Each facet
 *  applies the other facets' selections but not its own, like `computeDealFacets`. */
import { OFFER_TAGS } from './offer-tag';

type Num = number | string | { toString(): string };

export interface ProductFacetRow {
  id: string;
  price: Num;
  category: { id: string; name: string; slug: string } | null;
  tag: string | null;
}

export interface ProductFacetSelection {
  categoryIds: string[];
  tags: string[];
  minPrice?: number;
  maxPrice?: number;
}

type Facet = 'category' | 'tag' | 'price';

export function computeProductFacets(rows: ProductFacetRow[], sel: ProductFacetSelection) {
  const passes = (r: ProductFacetRow, except: Facet) => {
    const price = Number(r.price);
    return (
      (except === 'category' || sel.categoryIds.length === 0 || (r.category !== null && sel.categoryIds.includes(r.category.id))) &&
      (except === 'tag' || sel.tags.length === 0 || (r.tag !== null && sel.tags.includes(r.tag))) &&
      (except === 'price' || ((sel.minPrice === undefined || price >= sel.minPrice) && (sel.maxPrice === undefined || price <= sel.maxPrice)))
    );
  };

  // Count desc; ties keep first-seen order (same as computeDealFacets).
  const categories = new Map<string, { id: string; name: string; slug: string; count: number }>();
  for (const r of rows) {
    if (!r.category) continue;
    const c = categories.get(r.category.id) ?? { ...r.category, count: 0 };
    if (passes(r, 'category')) c.count += 1;
    categories.set(r.category.id, c);
  }

  const tagged = rows.filter((r) => passes(r, 'tag'));
  const tags = OFFER_TAGS.map((tag) => ({ tag, count: tagged.filter((r) => r.tag === tag).length }));

  const prices = rows.filter((r) => passes(r, 'price')).map((r) => Number(r.price));
  const price = prices.length
    ? prices.reduce((acc, p) => ({ min: Math.min(acc.min, p), max: Math.max(acc.max, p) }), { min: prices[0], max: prices[0] })
    : null;

  return { categories: [...categories.values()].sort((a, b) => b.count - a.count), tags, price };
}
