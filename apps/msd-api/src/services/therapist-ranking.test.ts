import { describe, it, expect } from 'vitest';
import { lowestPackagePrice, rankTherapists } from './therapist-ranking';

const here = { latitude: 26.76, longitude: 83.37 };
const t = (id: string, prices: number[], km: number | null) => ({
  id,
  packages: prices.map((p) => ({ sellingPrice: String(p) })),
  branch: { latitude: km === null ? null : String(here.latitude + km * 0.009), longitude: String(here.longitude) },
});
const rows = [t('a', [900, 500], 10), t('b', [300], 2), t('c', [], 1), t('d', [700], null)];
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe('lowestPackagePrice', () => {
  it('is the cheapest active package, or null without one', () => {
    expect(lowestPackagePrice(rows[0].packages)).toBe(500);
    expect(lowestPackagePrice([])).toBeNull();
  });
});

describe('rankTherapists (ST-40)', () => {
  it('keeps the incoming order for relevance without coordinates', () => {
    expect(ids(rankTherapists(rows, { sort: 'relevance' }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by lowest package price, therapists without a package last', () => {
    expect(ids(rankTherapists(rows, { sort: 'price_asc' }))).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(rankTherapists(rows, { sort: 'price_desc' }))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('sorts nearest first for relevance and distance with coordinates', () => {
    expect(ids(rankTherapists(rows, { sort: 'distance', ...here }))).toEqual(['c', 'b', 'a', 'd']);
    expect(ids(rankTherapists(rows, { sort: 'relevance', ...here }))).toEqual(['c', 'b', 'a', 'd']);
  });

  it('distance without coordinates behaves like relevance', () => {
    expect(ids(rankTherapists(rows, { sort: 'distance' }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by price (no package → out) and by radius', () => {
    expect(ids(rankTherapists(rows, { sort: 'relevance', minPrice: 400 }))).toEqual(['a', 'd']);
    expect(ids(rankTherapists(rows, { sort: 'relevance', ...here, radiusKm: 5 }))).toEqual(['c', 'b']);
  });

  it('adds distanceKm and fromPrice', () => {
    const [first] = rankTherapists([rows[1]], { sort: 'relevance', ...here });
    expect(first.fromPrice).toBe(300);
    expect(first.distanceKm).toBeCloseTo(2, 0);
  });
});
