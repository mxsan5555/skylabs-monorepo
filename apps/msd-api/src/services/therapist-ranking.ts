/** In-memory filtering and sorting for the public therapist list (small result sets), so every
 *  page continues the previous page's order. Mirrors `deal-ranking.ts`. */
import { distanceOf } from './deal-ranking';

export type TherapistSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance';

type Num = number | string | { toString(): string };
type BranchGeo = { latitude: Num | null; longitude: Num | null } | null;

/** The "From" price: the cheapest active package, or null without one. */
export function lowestPackagePrice(packages: { sellingPrice: Num }[]): number | null {
  return packages.reduce<number | null>((min, p) => {
    const price = Number(p.sellingPrice);
    return min === null || price < min ? price : min;
  }, null);
}

export interface TherapistRankOptions {
  sort: TherapistSort;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  minPrice?: number;
  maxPrice?: number;
}

/** Nulls last, otherwise ascending (`dir` 1) or descending (-1). */
const compareNullable = (a: number | null, b: number | null, dir: 1 | -1) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir;

/** Adds `distanceKm` and `fromPrice`, drops rows outside the price range (no package → out when
 *  a bound is set) or the radius (only with coordinates), then sorts: price by `fromPrice`,
 *  relevance/distance nearest first with coordinates. Otherwise the incoming order; stable. */
export function rankTherapists<T extends { branch: BranchGeo; packages: { sellingPrice: Num }[] }>(
  rows: T[],
  opts: TherapistRankOptions,
): (T & { distanceKm: number | null; fromPrice: number | null })[] {
  const hasCoords = opts.latitude !== undefined && opts.longitude !== undefined;
  const { minPrice, maxPrice, radiusKm } = opts;
  const out = rows
    .map((row) => ({ ...row, distanceKm: distanceOf(row.branch, opts.latitude, opts.longitude), fromPrice: lowestPackagePrice(row.packages) }))
    .filter((r) => minPrice === undefined || (r.fromPrice !== null && r.fromPrice >= minPrice))
    .filter((r) => maxPrice === undefined || (r.fromPrice !== null && r.fromPrice <= maxPrice))
    .filter((r) => !hasCoords || radiusKm === undefined || (r.distanceKm !== null && r.distanceKm <= radiusKm));
  if (opts.sort === 'price_asc' || opts.sort === 'price_desc') {
    const dir = opts.sort === 'price_asc' ? 1 : -1;
    return out.sort((a, b) => compareNullable(a.fromPrice, b.fromPrice, dir));
  }
  if (hasCoords) return out.sort((a, b) => compareNullable(a.distanceKm, b.distanceKm, 1));
  return out;
}
