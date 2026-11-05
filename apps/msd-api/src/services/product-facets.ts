/** Filter-panel counts for the public product list (`GET /catalog/products/facets`). Each facet
 *  applies the other facets' selections but not its own, like `computeDealFacets`. */
import { OFFER_TAGS } from './offer-tag';

type Num = number | string | { toString(): string };

export interface ProductFacetRow {
  id: string;
  price: Num;
  category: { id: string; name: string; slug: string } | null;
  tag: string | null;
  vendorId: string;
  vendor: { businessName: string | null } | null;
}

export interface ProductFacetSelection {
  categoryIds: string[];
  tags: string[];
  /** Business (member) ids; empty or missing = all (item 4). */
  vendorIds?: string[];
  minPrice?: number;
  maxPrice?: number;
}

type Facet = 'category' | 'tag' | 'price' | 'vendor';

export function computeProductFacets(rows: ProductFacetRow[], sel: ProductFacetSelection) {
  const vendorIds = sel.vendorIds ?? [];
  const passes = (r: ProductFacetRow, except: Facet) => {
    const price = Number(r.price);
    return (
      (except === 'vendor' || vendorIds.length === 0 || vendorIds.includes(r.vendorId)) &&
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

  const vendors = new Map<string, { id: string; name: string; count: number }>();
  for (const r of rows) {
    const v = vendors.get(r.vendorId) ?? { id: r.vendorId, name: r.vendor?.businessName ?? '', count: 0 };
    if (passes(r, 'vendor')) v.count += 1;
    vendors.set(r.vendorId, v);
  }

  const tagged = rows.filter((r) => passes(r, 'tag'));
  const tags = OFFER_TAGS.map((tag) => ({ tag, count: tagged.filter((r) => r.tag === tag).length }));

  const prices = rows.filter((r) => passes(r, 'price')).map((r) => Number(r.price));
  const price = prices.length
    ? prices.reduce((acc, p) => ({ min: Math.min(acc.min, p), max: Math.max(acc.max, p) }), { min: prices[0], max: prices[0] })
    : null;

  const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;
  return { categories: [...categories.values()].sort(byCount), vendors: [...vendors.values()].sort(byCount), tags, price };
}
