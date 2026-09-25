import { describe, it, expect } from 'vitest';
import { DISTANCE_BUCKETS_KM, computeDealFacets, haversineKm, rankDeals, type FacetRow } from './deal-ranking';

const here = { latitude: 26.76, longitude: 83.37 }; // Gorakhpur
const row = (id: string, km: number | null, extra: Partial<FacetRow> = {}): FacetRow => ({
  id,
  vendorId: 'v1',
  branchId: 'b1',
  salePrice: '100',
  vendor: { businessName: 'Glow' },
  // ~0.009 degrees of latitude ≈ 1 km
  branch: { name: 'Main', city: 'Gorakhpur', latitude: km === null ? null : String(here.latitude + km * 0.009), longitude: String(here.longitude) },
  ...extra,
});

describe('haversineKm', () => {
  it('measures about 1 km for 0.009 degrees of latitude', () => {
    expect(haversineKm(26.76, 83.37, 26.769, 83.37)).toBeCloseTo(1, 1);
  });
});

describe('rankDeals', () => {
  const rows = [row('far', 30), row('near', 2), row('none', null)];

  it('keeps the incoming order without coordinates and adds null distances', () => {
    const out = rankDeals(rows, { sort: 'relevance' });
    expect(out.map((r) => r.id)).toEqual(['far', 'near', 'none']);
    expect(out.every((r) => r.distanceKm === null)).toBe(true);
  });

  it('sorts nearest first for relevance and distance when coordinates are given', () => {
    expect(rankDeals(rows, { sort: 'relevance', ...here }).map((r) => r.id)).toEqual(['near', 'far', 'none']);
    expect(rankDeals(rows, { sort: 'distance', ...here }).map((r) => r.id)).toEqual(['near', 'far', 'none']);
  });

  it('keeps the incoming (SQL) order for price sorts even with coordinates', () => {
    expect(rankDeals(rows, { sort: 'price_asc', ...here }).map((r) => r.id)).toEqual(['far', 'near', 'none']);
  });

  it('drops deals outside the radius (and deals without coordinates) when a radius is set', () => {
    expect(rankDeals(rows, { sort: 'relevance', ...here, radiusKm: 10 }).map((r) => r.id)).toEqual(['near']);
  });

  it('ignores the radius without coordinates', () => {
    expect(rankDeals(rows, { sort: 'relevance', radiusKm: 10 })).toHaveLength(3);
  });
});

describe('computeDealFacets', () => {
  const rows = [
    row('a', 2, { vendorId: 'v1', branchId: 'b1', salePrice: '500' }),
    row('b', 8, { vendorId: 'v1', branchId: 'b2', salePrice: '900', branch: { name: 'East', city: 'Gorakhpur', latitude: String(here.latitude + 8 * 0.009), longitude: String(here.longitude) } }),
    row('c', 40, { vendorId: 'v2', branchId: 'b3', salePrice: '1500', vendor: { businessName: 'Zen' }, branch: { name: 'West', city: 'Basti', latitude: String(here.latitude + 40 * 0.009), longitude: String(here.longitude) } }),
  ];

  it('counts vendors ignoring the vendor selection but applying the others', () => {
    const f = computeDealFacets(rows, { vendorIds: ['v2'], branchIds: [], ...here });
    expect(f.vendors).toEqual([
      { id: 'v1', name: 'Glow', count: 2 },
      { id: 'v2', name: 'Zen', count: 1 },
    ]);
  });

  it('applies the vendor selection to branch counts and keeps zero-count options', () => {
    const f = computeDealFacets(rows, { vendorIds: ['v1'], branchIds: [], ...here });
    expect(f.branches).toEqual([
      { id: 'b1', name: 'Main', city: 'Gorakhpur', vendorName: 'Glow', count: 1 },
      { id: 'b2', name: 'East', city: 'Gorakhpur', vendorName: 'Glow', count: 1 },
      { id: 'b3', name: 'West', city: 'Basti', vendorName: 'Zen', count: 0 },
    ]);
  });

  it('buckets distance cumulatively, ignoring the radius selection', () => {
    const f = computeDealFacets(rows, { vendorIds: [], branchIds: [], radiusKm: 5, ...here });
    expect(f.distance).toEqual(DISTANCE_BUCKETS_KM.map((km) => ({ km, count: [2, 8, 40].filter((d) => d <= km).length })));
  });

  it('returns no distance buckets without coordinates', () => {
    expect(computeDealFacets(rows, { vendorIds: [], branchIds: [] }).distance).toEqual([]);
  });

  it('reports the price range ignoring the price selection', () => {
    const f = computeDealFacets(rows, { vendorIds: [], branchIds: [], minPrice: 1000 });
    expect(f.price).toEqual({ min: 500, max: 1500 });
  });

  it('uses the price selection for the other facets', () => {
    const f = computeDealFacets(rows, { vendorIds: [], branchIds: [], minPrice: 1000 });
    expect(f.vendors.find((v) => v.id === 'v1')?.count).toBe(0);
  });

  it('returns a null price range when nothing matches', () => {
    expect(computeDealFacets([], { vendorIds: [], branchIds: [] }).price).toBeNull();
  });
});
