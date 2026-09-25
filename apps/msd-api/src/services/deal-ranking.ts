/** In-memory ranking and facet counting for the public deal list (small result sets). */

export type DealSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance' | 'newest' | 'discount';
export const DISTANCE_BUCKETS_KM = [1, 5, 10, 20, 50, 100] as const;

type Num = number | string | { toString(): string };
type BranchGeo = { latitude: Num | null; longitude: Num | null } | null;

/** Great-circle distance in kilometers between two lat/lng points. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function distanceOf(branch: BranchGeo, latitude?: number, longitude?: number): number | null {
  if (latitude === undefined || longitude === undefined || branch?.latitude == null || branch.longitude == null) return null;
  return haversineKm(latitude, longitude, Number(branch.latitude), Number(branch.longitude));
}

export interface RankOptions {
  sort: DealSort;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}

/** Attaches `distanceKm`, drops rows outside `radiusKm` (only with coordinates), and sorts nearest
 *  first for `relevance`/`distance` when coordinates are given. Other sorts keep the incoming
 *  (SQL-ordered) order; the sort is stable. */
export function rankDeals<T extends { branch: BranchGeo }>(rows: T[], opts: RankOptions): (T & { distanceKm: number | null })[] {
  const hasCoords = opts.latitude !== undefined && opts.longitude !== undefined;
  let out = rows.map((row) => ({ ...row, distanceKm: distanceOf(row.branch, opts.latitude, opts.longitude) }));
  if (hasCoords && opts.radiusKm !== undefined) {
    const radius = opts.radiusKm;
    out = out.filter((r) => r.distanceKm !== null && r.distanceKm <= radius);
  }
  if (hasCoords && (opts.sort === 'relevance' || opts.sort === 'distance')) {
    out = [...out].sort((a, b) => {
      if (a.distanceKm === null) return b.distanceKm === null ? 0 : 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }
  return out;
}

export interface FacetRow {
  id: string;
  vendorId: string;
  branchId: string;
  salePrice: Num;
  vendor: { businessName: string } | null;
  branch: { name: string; city: string | null; latitude: Num | null; longitude: Num | null } | null;
}

export interface FacetSelection {
  vendorIds: string[];
  branchIds: string[];
  radiusKm?: number;
  minPrice?: number;
  maxPrice?: number;
  latitude?: number;
  longitude?: number;
}

export interface DealFacets {
  vendors: { id: string; name: string; count: number }[];
  branches: { id: string; name: string; city: string | null; vendorName: string; count: number }[];
  distance: { km: number; count: number }[];
  price: { min: number; max: number } | null;
}

type Facet = 'vendor' | 'branch' | 'radius' | 'price';

/** Counts per facet. `rows` must already match every non-facet filter (category, city, search);
 *  each facet's counts apply the other facets' selections but not its own. Options list every
 *  vendor/branch in `rows` (zero counts included) so selected-but-empty choices stay visible. */
export function computeDealFacets(rows: FacetRow[], sel: FacetSelection): DealFacets {
  const hasCoords = sel.latitude !== undefined && sel.longitude !== undefined;
  const dist = new Map(rows.map((r) => [r.id, distanceOf(r.branch, sel.latitude, sel.longitude)]));
  const passes = (r: FacetRow, except: Facet) => {
    const price = Number(r.salePrice);
    const km = dist.get(r.id) ?? null;
    return (
      (except === 'vendor' || sel.vendorIds.length === 0 || sel.vendorIds.includes(r.vendorId)) &&
      (except === 'branch' || sel.branchIds.length === 0 || sel.branchIds.includes(r.branchId)) &&
      (except === 'radius' || !hasCoords || sel.radiusKm === undefined || (km !== null && km <= sel.radiusKm)) &&
      (except === 'price' || ((sel.minPrice === undefined || price >= sel.minPrice) && (sel.maxPrice === undefined || price <= sel.maxPrice)))
    );
  };
  // Count desc only — ties keep the Map's insertion order (first-seen-in-`rows` order), a stable
  // sort with no secondary key. A name tiebreak would reorder same-count ties alphabetically,
  // which is not what callers of this facet (and its own test) expect.
  const byCount = <O extends { count: number }>(a: O, b: O) => b.count - a.count;

  const vendors = new Map<string, { id: string; name: string; count: number }>();
  const branches = new Map<string, DealFacets['branches'][number]>();
  for (const r of rows) {
    const v = vendors.get(r.vendorId) ?? { id: r.vendorId, name: r.vendor?.businessName ?? '', count: 0 };
    if (passes(r, 'vendor')) v.count += 1;
    vendors.set(r.vendorId, v);
    const b = branches.get(r.branchId) ?? { id: r.branchId, name: r.branch?.name ?? '', city: r.branch?.city ?? null, vendorName: r.vendor?.businessName ?? '', count: 0 };
    if (passes(r, 'branch')) b.count += 1;
    branches.set(r.branchId, b);
  }

  const inRange = rows.filter((r) => passes(r, 'radius')).map((r) => dist.get(r.id) ?? null);
  const distance = hasCoords
    ? DISTANCE_BUCKETS_KM.map((km) => ({ km, count: inRange.filter((d) => d !== null && d <= km).length }))
    : [];

  const prices = rows.filter((r) => passes(r, 'price')).map((r) => Number(r.salePrice));
  // reduce, not Math.min(...prices): spreading a very large array can exceed the call-stack limit.
  const price = prices.length
    ? prices.reduce((acc, p) => ({ min: Math.min(acc.min, p), max: Math.max(acc.max, p) }), { min: prices[0], max: prices[0] })
    : null;

  return { vendors: [...vendors.values()].sort(byCount), branches: [...branches.values()].sort(byCount), distance, price };
}
