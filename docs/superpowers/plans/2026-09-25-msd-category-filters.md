# msd Category Filter Panel, Sorts and List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the category toolbar's search, city chip and price dialog with a Groupon-style filter side panel (Your location, Distance, Price, Business, Branches), add price/distance sorts, and a List / Grid / Map view switch.

**Architecture:** msd-api gains new deal sorts, multi-vendor/branch and radius filters, and a `/catalog/deals/facets` endpoint (counts computed in memory, each facet ignoring its own selection). msd gets small components (`ViewSwitch`, `SidebarLayout`, `PriceRangeField`, `CheckboxFacet`, `FilterPanel`, `CityPickerDialog`) and one hook (`useMediaQuery`); the category page composes them and keeps all filter state in the URL. shared-ui's `sky-product-card` gets a generic `layout="horizontal"` option for the list view.

**Tech Stack:** Express + Prisma + Zod + zod-to-openapi + Vitest/supertest (msd-api); React 19 + React Router 6 + Vitest/Testing Library + Material Web via shared-ui (msd); LIT (shared-ui).

**Spec:** `docs/superpowers/specs/2026-09-25-msd-category-filters-design.md`

**Rules for every task**
- NEVER run `git stash`, `git reset`, `git checkout -- <file>`, `git clean`, or anything that discards work. To see an old version use `git show HEAD:<path>` into a temp file outside the repo.
- Only touch the files the task names. `git add` only those; never `.gitignore` or `.impeccable/`. Never touch `.env.local` files.
- `packages/shared-ui` is touched ONLY in Task 5 (the `layout` option).
- Every commit message ends with the exact line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands from the repo root `C:\Sandeep New\Projects\Professional\skylabs\internal-projects\skylabs-monorepo`. msd tests: `npx vitest run --root apps/msd <path>`. msd-api tests: `npx vitest run --root apps/msd-api <path>`. shared-ui tests: `npx nx run shared-ui:test` (or `npx vitest run --root packages/shared-ui <path>` if that config exists).
- eslint rejects empty functions (`() => {}`) everywhere including tests: use `vi.fn()` in tests.
- jsdom limit (verified earlier): under Vitest `@lit/react` resolves to its Node/SSR build, so shared-ui **wrapper** components (`Slider`, `OutlinedTextField`, `Menu`, `Dialog`, `IconButton`, ...) do NOT set element properties in tests. Raw `createElement('md-…')` elements DO get props from React. React-handled events (`onClick`, `onChange` on raw elements) and attributes work. Tests assert behaviour/attributes; when a component must be testable through a property, render the raw element.
- CSS: M3 tokens only; lengths 2/4/8/12/16/20/24/32/48px, 160px, 272px, 320px, 480px, 600px; breakpoints 600px / 840px.
- If an existing test fails for a real behaviour reason, STOP and report NEEDS_CONTEXT with the output.

## File map

| Area | Files |
|---|---|
| API | `apps/msd-api/src/schemas/catalog.schema.ts`, `apps/msd-api/src/services/catalog.service.ts`, `apps/msd-api/src/services/deal-ranking.ts` (+ `.test.ts`) (new), `apps/msd-api/src/routes/catalog.routes.ts`, `apps/msd-api/src/routes/catalog.routes.test.ts`, `apps/msd-api/src/openapi/registry.ts` |
| msd client | `apps/msd/src/api/catalog.ts` |
| shared-ui | `packages/shared-ui/src/components/sky-product-card/sky-product-card.ts` (+ its test), `apps/msd/src/types/sky-elements.d.ts` |
| msd components | `components/view-switch/`, `components/sidebar-layout/`, `components/price-range-field/`, `components/checkbox-facet/`, `components/filter-panel/`, `components/city-picker-dialog/`, `hooks/use-media-query.ts`; modify `components/card-grid/`, `components/deal-card.tsx`, `components/sky-product-card-wc.tsx`, `components/site-header/city-chip.tsx` |
| page | `apps/msd/src/app/pages/category/category.tsx` (+ test), `apps/msd/src/content.json` |
| delete | `apps/msd/src/app/components/price-filter-dialog/` (Task 11) |
| docs | `TASK.md` |

---

### Task 1: Deal ranking helper (API, pure functions)

**Files:** Create `apps/msd-api/src/services/deal-ranking.ts`, `apps/msd-api/src/services/deal-ranking.test.ts`.

This holds the in-memory logic both the list and the facets use, so it is unit-tested without Prisma.

- [ ] **Step 1: Failing test** — `deal-ranking.test.ts`:
```ts
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
```
- [ ] **Step 2:** `npx vitest run --root apps/msd-api src/services/deal-ranking.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** — `deal-ranking.ts`:
```ts
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
  const byCount = <O extends { name: string; count: number }>(a: O, b: O) => b.count - a.count || a.name.localeCompare(b.name);

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
  const price = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;

  return { vendors: [...vendors.values()].sort(byCount), branches: [...branches.values()].sort(byCount), distance, price };
}
```
- [ ] **Step 4:** Test → PASS (13). `npx eslint apps/msd-api/src/services/deal-ranking.ts apps/msd-api/src/services/deal-ranking.test.ts` → clean.
- [ ] **Step 5: Commit** — `git add` both files; `feat(msd-api): deal ranking and facet counting helpers`.

---

### Task 2: Deal list sorts and filters (API)

**Files:** Modify `apps/msd-api/src/schemas/catalog.schema.ts`, `apps/msd-api/src/services/catalog.service.ts`, `apps/msd-api/src/routes/catalog.routes.ts`, `apps/msd-api/src/routes/catalog.routes.test.ts`.

- [ ] **Step 1: Failing route tests.** Read `catalog.routes.test.ts` first (it mocks Prisma via `createPrismaMock`; deals come from `prismaMock.deal.findMany` + `prismaMock.deal.count`). Add a `describe('GET /api/v1/catalog/deals sorts and filters', ...)` (use the same URL prefix the file's existing deal tests use) with these tests:
  1. `sort=price_asc` → `prismaMock.deal.findMany` called with `orderBy: [{ salePrice: 'asc' }, { createdAt: 'desc' }]`.
  2. `sort=price_desc` → `orderBy: [{ salePrice: 'desc' }, { createdAt: 'desc' }]`.
  3. no sort → default `relevance`: `orderBy: { createdAt: 'desc' }` (unchanged SQL order without coordinates).
  4. `vendorIds=<uuid1>,<uuid2>` → `where` contains `vendorId: { in: [uuid1, uuid2] }`; `branchIds=<uuid>` → `branchId: { in: [uuid] }`.
  5. `vendorIds=not-a-uuid` → 400.
  6. `radiusKm=5&latitude=26.76&longitude=83.37` with two deals from `findMany` (one ~2 km, one ~30 km, via `branch.latitude/longitude` strings as in Task 1's fixtures) → body `data` has 1 item and `meta.total` is 1; `findMany` was called WITHOUT `skip`/`take` (full set, then paged in memory).
  7. `radiusKm=5` without coordinates → normal SQL path (`findMany` called with `skip`/`take`), radius ignored.
  8. `radiusKm=0` and `radiusKm=501` → 400.
  9. `sort=discount&latitude=…&longitude=…` → items keep the `findMany` order (discount now respected with coordinates) — this is an intended behaviour change: before, coordinates always forced nearest-first.
  Run → FAIL.
- [ ] **Step 2: Schema.** In `CatalogDealQuerySchema`:
```ts
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'distance', 'newest', 'discount']).optional().default('relevance'),
  /** Comma-separated vendor UUIDs (max 50). */
  vendorIds: z.string().regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/i).optional(),
  /** Comma-separated branch UUIDs (max 50). */
  branchIds: z.string().regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/i).optional(),
  /** Radius in km around latitude/longitude; ignored without coordinates. */
  radiusKm: z.coerce.number().gt(0).max(500).optional(),
```
  Update the `sort` doc comment: `relevance` = nearest first with coordinates, otherwise newest; `price_asc`/`price_desc` by sale price; `distance` = nearest first (relevance without coordinates); `newest`/`discount` kept for existing callers; no rating sort (no review data).
  Export a helper in the same file: `export const splitIds = (value?: string) => (value ? value.split(',').filter(Boolean) : undefined);`
- [ ] **Step 3: Service.** In `catalog.service.ts`:
  - Import `rankDeals, type DealSort` from `./deal-ranking` and replace the file's private `haversineKm` + `withDistance` uses in `listPublicDeals` with `rankDeals` (keep `withDistance` if other functions — therapists, vendor detail — still use it; do not change those callers).
  - `listPublicDeals` opts: `sort?: DealSort; vendorIds?: string[]; branchIds?: string[]; radiusKm?: number;`.
  - Extract the `where` building into `export function buildDealWhere(opts: …)` (same fields as today plus `vendorIds` → `vendorId: { in }` and `branchIds` → `branchId: { in }`; when both `vendorId` and `vendorIds` are given, `vendorIds` wins; same for branch). `listPublicDeals` uses it.
  - `orderBy` by sort: `price_asc` → `[{ salePrice: 'asc' }, { createdAt: 'desc' }]`; `price_desc` → `[{ salePrice: 'desc' }, { createdAt: 'desc' }]`; `discount` → existing; everything else → `{ createdAt: 'desc' }`.
  - Coordinates present (both) OR (`radiusKm` and coordinates): fetch the full set `findMany({ where, orderBy, select })`, `rankDeals(rows, { sort, latitude, longitude, radiusKm })`, `total = ranked.length`, slice the page, then `withDealPopularTags(page)`. Otherwise the existing SQL `skip/take` path with the new `orderBy` (attach `distanceKm: null` as today via `rankDeals(rows, { sort })`).
- [ ] **Step 4: Route.** Destructure `vendorIds`, `branchIds`, `radiusKm` and pass `vendorIds: splitIds(vendorIds)`, `branchIds: splitIds(branchIds)`, `radiusKm`.
- [ ] **Step 5:** `npx vitest run --root apps/msd-api src/routes/catalog.routes.test.ts src/services` → PASS (all old tests too). `npx tsc -p apps/msd-api/tsconfig.app.json --noEmit 2>&1 | grep -E "catalog|deal-ranking"` → nothing (find the right tsconfig name in `apps/msd-api/` if `tsconfig.app.json` differs). eslint on changed files → clean.
- [ ] **Step 6: Commit** — `feat(msd-api): deal price/distance sorts, multi vendor/branch and radius filters`.

---

### Task 3: Deal facets endpoint + product sorts (API)

**Files:** Modify `catalog.schema.ts`, `catalog.service.ts`, `catalog.routes.ts`, `catalog.routes.test.ts`, `apps/msd-api/src/openapi/registry.ts`.

- [ ] **Step 1: Failing route tests** (new describe):
  1. `GET …/catalog/deals/facets?categoryId=<uuid>` → 200, `data` has `vendors`, `branches`, `distance: []`, `price` computed from the mocked `findMany` rows (use 2-3 rows shaped like `FacetRow`: `id, vendorId, branchId, salePrice, vendor.businessName, branch.name/city/latitude/longitude`).
  2. `findMany` for facets is called with a `where` that does NOT include the vendorIds/branchIds/price filters (they are applied in memory) but does include `categoryId`, and with a `select` limited to the facet fields.
  3. with `latitude/longitude` → `distance` has 6 buckets.
  4. `vendorIds=bad` → 400.
  5. `/catalog/deals/facets` is not swallowed by `/catalog/deals/:id` (the route must be registered BEFORE `/deals/:id`).
  6. products: `GET …/catalog/products?sort=price_asc` → `prismaMock.product.findMany` `orderBy: [{ price: 'asc' }, { createdAt: 'desc' }]`; `price_desc` likewise; `relevance` → `{ createdAt: 'desc' }`.
  Run → FAIL.
- [ ] **Step 2: Schema.** `export const CatalogDealFacetQuerySchema = CatalogDealQuerySchema.omit({ page: true, pageSize: true, sort: true }).openapi('CatalogDealFacetQuery');` (if `.omit` is unavailable on the extended schema, build it with `.pick` of the filter keys). Product `sort` enum → `['relevance', 'price_asc', 'price_desc', 'newest', 'discount']`, default `relevance`.
- [ ] **Step 3: Service.**
```ts
const FACET_DEAL_SELECT = {
  id: true,
  vendorId: true,
  branchId: true,
  salePrice: true,
  vendor: { select: { businessName: true } },
  branch: { select: { name: true, city: true, latitude: true, longitude: true } },
} as const;

/** Facet counts for the category filter panel. Base filters go to SQL; vendor, branch, radius and
 *  price are applied in memory so each facet can ignore its own selection. */
export async function getPublicDealFacets(opts: Omit<Parameters<typeof buildDealWhere>[0], 'vendorIds' | 'branchIds' | 'minPrice' | 'maxPrice' | 'vendorId' | 'branchId'> & {
  vendorIds?: string[];
  branchIds?: string[];
  radiusKm?: number;
  minPrice?: number;
  maxPrice?: number;
  latitude?: number;
  longitude?: number;
}) {
  const { vendorIds = [], branchIds = [], radiusKm, minPrice, maxPrice, latitude, longitude, ...base } = opts;
  const rows = await prisma.deal.findMany({ where: buildDealWhere(base), select: FACET_DEAL_SELECT });
  return computeDealFacets(rows, { vendorIds, branchIds, radiusKm, minPrice, maxPrice, latitude, longitude });
}
```
  (Adjust the `Omit<…>` typing to whatever `buildDealWhere`'s parameter type is; the point: SQL gets category/subcategory/state/city/search only.) Product `orderBy`: `price_asc` → `[{ price: 'asc' }, { createdAt: 'desc' }]`, `price_desc` → desc, `discount` unchanged, else `{ createdAt: 'desc' }`; widen the product service's `sort` type.
- [ ] **Step 4: Route** (place ABOVE `router.get('/deals/:id', …)`):
```ts
router.get('/deals/facets', validateQuery(CatalogDealFacetQuerySchema), async (req, res, next) => {
  try {
    const { vendorIds, branchIds, ...rest } = req.validatedQuery as ReturnType<typeof CatalogDealFacetQuerySchema.parse>;
    sendData(res, await catalogService.getPublicDealFacets({ ...rest, vendorIds: splitIds(vendorIds), branchIds: splitIds(branchIds) }));
  } catch (err) {
    next(err);
  }
});
```
  (Drop `vendorId`/`branchId` from `rest` before passing if the service type rejects them.)
- [ ] **Step 5: OpenAPI.** In `registry.ts`, register `GET /catalog/deals/facets` next to the existing `/catalog/deals` registration, with `request.query: CatalogDealFacetQuerySchema` and a 200 response schema describing `{ vendors[], branches[], distance[], price | null }` (follow the file's existing pattern for a public catalog route).
- [ ] **Step 6:** API tests → PASS; tsc/eslint as Task 2. Also `npx nx build msd-api` → succeeds.
- [ ] **Step 7: Commit** — `feat(msd-api): deal facets endpoint and product price sorts`.

---

### Task 4: msd API client

**Files:** Modify `apps/msd/src/api/catalog.ts`.

- [ ] **Step 1: Implement.**
  - `export type CatalogDealSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance' | 'newest' | 'discount';` and `export type CatalogProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'discount';` — use them for `listCatalogDeals` / `listCatalogProducts` `sort`.
  - `listCatalogDeals` opts add `vendorIds?: string[]; branchIds?: string[]; radiusKm?: number;` and serialise arrays: build the query object as `{ ...opts, vendorIds: opts.vendorIds?.length ? opts.vendorIds.join(',') : undefined, branchIds: opts.branchIds?.length ? opts.branchIds.join(',') : undefined }` before `toQuery` (check `toQuery` drops `undefined`).
  - Add:
```ts
export interface CatalogDealFacets {
  vendors: { id: string; name: string; count: number }[];
  branches: { id: string; name: string; city: string | null; vendorName: string; count: number }[];
  distance: { km: number; count: number }[];
  price: { min: number; max: number } | null;
}

/** Filter-panel counts for the same filters as `listCatalogDeals` (no paging/sort). */
export function getCatalogDealFacets(opts: Omit<Parameters<typeof listCatalogDeals>[0], 'page' | 'pageSize' | 'sort'>) {
  const { vendorIds, branchIds, ...rest } = opts ?? {};
  return apiGet<CatalogDealFacets>(
    `/catalog/deals/facets${toQuery({ ...rest, vendorIds: vendorIds?.length ? vendorIds.join(',') : undefined, branchIds: branchIds?.length ? branchIds.join(',') : undefined })}`,
    null,
  );
}
```
- [ ] **Step 2:** `npx tsc -p apps/msd/tsconfig.app.json --noEmit 2>&1 | grep -E "api/catalog|pages/(category|search|home)"` → no NEW errors (category.tsx still passes old sort values; they remain valid members). `npx vitest run --root apps/msd src/app/pages src/api` → PASS.
- [ ] **Step 3: Commit** — `feat(msd): catalog client sorts, multi filters and deal facets`.

---

### Task 5: `sky-product-card` horizontal layout (shared-ui) + list layout plumbing

**Files:** Modify `packages/shared-ui/src/components/sky-product-card/sky-product-card.ts`, its test file in the same folder, `apps/msd/src/types/sky-elements.d.ts`, `apps/msd/src/app/components/sky-product-card-wc.tsx`, `apps/msd/src/app/components/deal-card.tsx`, `apps/msd/src/app/components/card-grid/card-grid.tsx`, `card-grid.css`, `card-grid.test.tsx`; check `packages/shared-ui/src/react.ts` for a `SkyProductCardReact` wrapper that needs nothing (LIT reflects the new property).

- [ ] **Step 1: Failing tests.**
  - In the card's test file: `layout` defaults to `'vertical'`; setting `layout = 'horizontal'` reflects the `layout="horizontal"` attribute (after `await el.updateComplete`).
  - `card-grid.test.tsx`: `<CardGrid layout="list">` renders the list with class `card-grid__list card-grid__list--list`; default has no `--list` modifier.
  Run shared-ui and card-grid tests → FAIL.
- [ ] **Step 2: shared-ui.** In `sky-product-card.ts`:
  - `static properties` add `layout: { type: String, reflect: true }`; `declare layout: 'vertical' | 'horizontal';` default `'vertical'` in the constructor; document it in the class doc comment ("`layout="horizontal"`: media left, content right; stacks when the card is narrower than 600px").
  - CSS: add `:host { container-type: inline-size; }` (keep existing host rules) and
```css
    @container (min-width: 600px) {
      :host([layout='horizontal']) .card {
        flex-direction: row;
      }
      :host([layout='horizontal']) .media {
        flex: 0 0 40%;
        min-inline-size: 160px;
        aspect-ratio: auto;
      }
    }
```
  Read the card's existing `.card` / `.media` / body rules first and adapt selectors so the horizontal card has: media filling full card height on the left (`object-fit: cover`), body on the right with the same padding, favourite button still on the image. If `.card` is not a flex column today, make the horizontal rule set `display: flex; flex-direction: row` explicitly. Only the `[layout='horizontal']` path may change; the default card must look identical.
  - Run the shared-ui card tests → PASS; `npx nx build shared-ui` → succeeds.
- [ ] **Step 3: msd plumbing.**
  - `sky-elements.d.ts`: add `layout?: 'vertical' | 'horizontal';` to the `sky-product-card` element props.
  - `sky-product-card-wc.tsx` and `deal-card.tsx`: accept `layout?: 'vertical' | 'horizontal'` and pass it to the element as the `layout` attribute/prop (follow how `variant` is passed).
  - `card-grid.tsx`: add prop `layout?: 'grid' | 'list'` (default grid); list class `card-grid__list${layout === 'list' ? ' card-grid__list--list' : ''}`. `card-grid.css`: `.card-grid__list--list { grid-template-columns: minmax(0, 1fr); }`.
- [ ] **Step 4:** msd `src/app/components` tests → PASS; tsc grep for the changed files → nothing.
- [ ] **Step 5: Commit** — stage the shared-ui card files, `sky-elements.d.ts`, `sky-product-card-wc.tsx`, `deal-card.tsx`, card-grid files; `feat(shared-ui,msd): horizontal product card layout and list grid`.

---

### Task 6: `ViewSwitch` + `useMediaQuery`

**Files:** Create `apps/msd/src/app/components/view-switch/view-switch.tsx`, `view-switch.test.tsx`; `apps/msd/src/hooks/use-media-query.ts`, `use-media-query.test.ts`.

- [ ] **Step 1: Failing tests.**
`view-switch.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewSwitch } from './view-switch';

const options = [
  { value: 'list', label: 'List view', icon: 'view_list' },
  { value: 'grid', label: 'Grid view', icon: 'grid_view' },
  { value: 'map', label: 'Map view', icon: 'map' },
];

describe('ViewSwitch', () => {
  it('renders a labelled group with the active view pressed', () => {
    render(<ViewSwitch label="Results view" options={options} value="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Results view' })).toBeTruthy();
    const buttons = Array.from(document.querySelectorAll('md-icon-button'));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['List view', 'Grid view', 'Map view']);
  });

  it('reports the picked view', () => {
    const onChange = vi.fn();
    render(<ViewSwitch label="Results view" options={options} value="grid" onChange={onChange} />);
    fireEvent.click(document.querySelectorAll('md-icon-button')[2]);
    expect(onChange).toHaveBeenCalledWith('map');
  });
});
```
`use-media-query.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useMediaQuery } from './use-media-query';

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the fallback without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useMediaQuery('(min-width: 840px)', true)).result.current).toBe(true);
  });

  it('follows the media query after mount', () => {
    let listener: (e: { matches: boolean }) => void = vi.fn();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: (_: string, l: typeof listener) => (listener = l), removeEventListener: vi.fn() }));
    const { result } = renderHook(() => useMediaQuery('(min-width: 840px)', true));
    expect(result.current).toBe(false);
    act(() => listener({ matches: true }));
    expect(result.current).toBe(true);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
`view-switch.tsx`:
```tsx
import { createElement } from 'react';

export interface ViewOption {
  value: string;
  label: string;
  icon: string;
}

/** Icon-button group for switching result views (list / grid / map). */
export function ViewSwitch({ label, options, value, onChange }: { label: string; options: ViewOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <div role="group" aria-label={label}>
      {options.map((option) =>
        createElement(
          'md-icon-button',
          {
            key: option.value,
            'aria-label': option.label,
            'aria-pressed': option.value === value ? 'true' : 'false',
            toggle: true,
            selected: option.value === value,
            onClick: () => onChange(option.value),
          },
          createElement('md-icon', { 'aria-hidden': 'true' }, option.icon),
        ),
      )}
    </div>
  );
}
```
`use-media-query.ts`:
```ts
import { useEffect, useState } from 'react';

/** `matchMedia` as state. Starts at `fallback` (server render and first client render agree),
 *  then follows the real query after mount. */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (e: { matches: boolean }) => setMatches(e.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
```
(If `md-icon-button` with `toggle`/`selected` shows an unwanted filled state, drop `toggle`/`selected` and keep `aria-pressed`; report it.)
- [ ] **Step 4:** Tests → PASS; eslint clean.
- [ ] **Step 5: Commit** — `feat(msd): ViewSwitch and useMediaQuery`.

---

### Task 7: Category: remove search and All cities, new sorts, view switch, visitor location

**Files:** Modify `apps/msd/src/content.json`, `apps/msd/src/app/pages/category/category.tsx`, `category.test.tsx`.

- [ ] **Step 1: Content** (`category` object):
  - `sortOptions` → `[{ "value": "relevance", "label": "Relevance" }, { "value": "price_asc", "label": "Price: Low to High" }, { "value": "price_desc", "label": "Price: High to Low" }, { "value": "distance", "label": "Distance: Nearest" }]`.
  - Add `"view": { "label": "Results view", "list": "List view", "grid": "Grid view", "map": "Map view" }`.
  - Remove `toolbar.showMap`, `toolbar.showGrid`, `toolbar.location`, `toolbar.allCities`, and the top-level `category.search` object, after confirming with grep that only `category.tsx` reads them.
- [ ] **Step 2: Tests first** (`category.test.tsx`):
  - Replace the location mock: the page now uses `useVisitorLocation`. Replace `vi.mock('../../../hooks/useCurrentLocation', …)` with
```tsx
const visitor = vi.hoisted(() => ({ value: { status: 'none', source: 'none', city: null as string | null, state: null as string | null, coords: null as { latitude: number; longitude: number } | null } }));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({ ...visitor.value, setCity: vi.fn(), requestBrowser: vi.fn() }),
}));
```
    and reset `visitor.value` in `beforeEach` to the `none` state.
  - Delete the tests for the location chip ("switches city from the location chip", "hides the location chip for product categories"), for toolbar search ("puts search in the listing toolbar", "searches on sky-submit…"), and the "toggles a map…" test (replaced below).
  - Add:
```tsx
  it('has no search field and no city chip in the toolbar', async () => {
    renderAt('/category/massage');
    const toolbar = await screen.findByRole('group', { name: content.category.toolbar.label });
    expect(toolbar.querySelector('sky-action-field')).toBeNull();
    expect(screen.queryByText('All cities')).toBeNull();
  });

  it('sorts by price and sends the API sort', async () => {
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const trigger = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes('Sort:')) as HTMLElement;
    fireEvent.click(trigger);
    expect(screen.queryByText('Distance: Nearest')).toBeNull(); // no coordinates yet
    fireEvent.click(screen.getByText('Price: Low to High'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sort=price_asc'));
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.sort).toBe('price_asc'));
  });

  it('offers distance sort once the visitor has coordinates and sends them', async () => {
    visitor.value = { ...visitor.value, status: 'ready', city: 'Gorakhpur', coords: { latitude: 26.76, longitude: 83.37 } };
    renderAt('/category/massage');
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ latitude: 26.76, longitude: 83.37 })));
    const trigger = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes('Sort:')) as HTMLElement;
    fireEvent.click(trigger);
    expect(screen.getByText('Distance: Nearest')).toBeTruthy();
  });

  it('switches between list, grid and map views', async () => {
    listCatalogDealsMock.mockResolvedValue({
      data: [deal('d1', { branch: { id: 'b1', name: 'Main', city: 'Pune', address: null, latitude: '18.52', longitude: '73.85' } }), deal('d2')],
      meta: { total: 2 },
    });
    renderAt('/category/massage');
    const group = await screen.findByRole('group', { name: content.category.view.label });
    const [list, , map] = Array.from(group.querySelectorAll('md-icon-button')) as HTMLElement[];
    fireEvent.click(list);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?view=list'));
    expect(document.querySelector('.card-grid__list--list')).toBeTruthy();
    fireEvent.click(map);
    expect((await screen.findByTestId('deal-map')).textContent).toBe('1');
    expect(screen.getByText(content.category.map.missingOne)).toBeTruthy();
  });
```
  (The `deal` helper and the DealMap mock already exist in the file.) Run → FAIL.
- [ ] **Step 3: Implement** in `category.tsx`:
  - Replace `import { useCurrentLocation } …` with `import { useVisitorLocation } from '../../../location/location-context';` and `const { coords } = useCurrentLocation();` with `const { coords } = useVisitorLocation();`.
  - Delete `SearchField` (and its `useCustomEvent` import if now unused), the `search` state and every `search` use (`common.search`, `listKey`, `isDefaultView`), the `locationMenu` const, and the map `view` state + `showMapToggle`/`showingMap` TextButton.
  - Sort: `const SORTS = ['relevance', 'price_asc', 'price_desc', 'distance'] as const;` at module level; `const sort = (SORTS as readonly string[]).includes(sortParam ?? '') && sortParam !== 'relevance' ? (sortParam as CatalogDealSort) : undefined;` `const hasCoords = coords?.latitude != null && coords?.longitude != null;` sort menu options `t.sortOptions.filter((o) => o.value !== 'distance' || hasCoords)`; `sortOption` falls back to `relevance`. Products: pass `sort` only when it is not `distance` (products have no distance). Import `type CatalogDealSort` from the API client.
  - View: `const viewParam = searchParams.get('view'); const view = viewParam === 'list' || viewParam === 'map' ? viewParam : 'grid';` `const viewOptions = [{ value: 'list', label: t.view.list, icon: 'view_list' }, { value: 'grid', label: t.view.grid, icon: 'grid_view' }, ...(showMap ? [{ value: 'map', label: t.view.map, icon: 'map' }] : [])];` where `showMap = !!category && isDealCategory(category) && mapPoints.length > 0`; `const showingMap = view === 'map' && showMap;`. `ViewSwitch` `onChange={(v) => setParam('view', v === 'grid' ? undefined : v)}`.
  - Toolbar `end`: `<ViewSwitch …/>` then the sort `ChoiceMenu` (not for therapy). `start`: the Filters chip stays for now (Task 11 replaces it).
  - Results: `showingMap ? <DealMap …/> + missing note : <CardGrid layout={view === 'list' ? 'list' : 'grid'} …>` and pass `layout={view === 'list' ? 'horizontal' : undefined}` to every `DealCard` / `SkyProductCardWC` in `cards`.
- [ ] **Step 4:** `npx vitest run --root apps/msd src/app/pages/category src/app/components src/hooks src/hydration.test.tsx src/entry-server.test.tsx` → PASS; run the category file 3 times → all pass. tsc grep `pages/category` → nothing. eslint → only the pre-existing `onFavorite={() => {}}` error.
- [ ] **Step 5: Commit** — `content.json`, `category.tsx`, `category.test.tsx`; `feat(msd): category view switch and price/distance sorts; drop toolbar search and city chip`.

---

### Task 8: `CityPickerDialog` (extract from `CityChip`)

**Files:** Create `apps/msd/src/app/components/city-picker-dialog/city-picker-dialog.tsx`, `city-picker-dialog.css`, `city-picker-dialog.test.tsx`; modify `apps/msd/src/app/components/site-header/city-chip.tsx` (and its CSS only if the dialog classes move).

- [ ] **Step 1:** Read `city-chip.tsx` and its test. Write `city-picker-dialog.test.tsx`: renders the dialog headline from `content.header.city.dialogTitle`, lists every location from a mocked `useCatalogShell`, clicking a city calls the mocked `useVisitorLocation().setCity` with that location and then `onClose`; clicking "use current location" calls `requestBrowser` then `onClose`. Run → FAIL.
- [ ] **Step 2: Implement** `CityPickerDialog({ onClose }: { onClose: () => void })`: move the `<Dialog open onClose={close}>…</Dialog>` block (headline, use-current button, city list, actions) out of `CityChip` verbatim, calling `onClose` where `CityChip` called `close`. Move the `.city-dialog*` CSS rules into `city-picker-dialog.css` (they are component styles, not page styles). `CityChip` renders `{open && <CityPickerDialog onClose={close} />}` and keeps its own focus-return `close`.
- [ ] **Step 3:** `npx vitest run --root apps/msd src/app/components` → PASS (the existing CityChip test must pass unchanged).
- [ ] **Step 4: Commit** — `refactor(msd): extract CityPickerDialog from CityChip`.

---

### Task 9: `SidebarLayout`, `PriceRangeField`, `CheckboxFacet`

**Files:** Create `apps/msd/src/app/components/sidebar-layout/{sidebar-layout.tsx,sidebar-layout.css,sidebar-layout.test.tsx}`, `components/price-range-field/{price-range-field.tsx,price-range-field.css,price-range-field.test.tsx}`, `components/checkbox-facet/{checkbox-facet.tsx,checkbox-facet.css,checkbox-facet.test.tsx}`. One commit per component.

**9a SidebarLayout**
- Test (stub `matchMedia` via `vi.stubGlobal` like Task 6):
  - desktop (`matches: true`) + `open` → `aside` with `aria-label`, no `role="dialog"`, main content rendered; `open={false}` → no aside.
  - phone (`matches: false`) + `open` → `aside` has `role="dialog"` and `aria-modal="true"`, a close button (`md-icon-button` with the close label) calls `onClose`, `Escape` keydown on document calls `onClose`, clicking the scrim calls `onClose`.
- Implement:
```tsx
import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { useMediaQuery } from '../../../hooks/use-media-query';
import './sidebar-layout.css';

export interface SidebarLayoutProps {
  open: boolean;
  onClose: () => void;
  sidebar: ReactNode;
  sidebarLabel: string;
  closeLabel: string;
  children: ReactNode;
}

/** Results with a filter sidebar: a column from 840px, a left side sheet on phones. */
export function SidebarLayout({ open, onClose, sidebar, sidebarLabel, closeLabel, children }: SidebarLayoutProps) {
  const desktop = useMediaQuery('(min-width: 840px)', true);
  const sheet = !desktop;
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!sheet || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [sheet, open]);

  return (
    <div className={`sidebar-layout${open ? ' sidebar-layout--open' : ''}${sheet ? ' sidebar-layout--sheet' : ''}`}>
      {open && sheet && <div className="sidebar-layout__scrim" aria-hidden="true" onClick={onClose} />}
      {open && (
        <aside
          ref={panelRef}
          tabIndex={-1}
          className="sidebar-layout__aside"
          aria-label={sidebarLabel}
          {...(sheet ? { role: 'dialog', 'aria-modal': 'true' } : {})}
        >
          {sheet &&
            createElement(
              'md-icon-button',
              { class: 'sidebar-layout__close', 'aria-label': closeLabel, onClick: onClose },
              createElement('md-icon', { 'aria-hidden': 'true' }, 'close'),
            )}
          {sidebar}
        </aside>
      )}
      <div className="sidebar-layout__main" inert={sheet && open ? true : undefined}>
        {children}
      </div>
    </div>
  );
}
```
```css
/* Filter sidebar layout. 840px = M3 expanded: column; below: side sheet. */
.sidebar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}
.sidebar-layout__main {
  min-inline-size: 0;
}
.sidebar-layout__aside {
  box-sizing: border-box;
  padding: 16px;
  border-radius: var(--md-sys-shape-corner-large);
  background-color: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
}
.sidebar-layout__aside:focus {
  outline: none;
}
@media (min-width: 840px) {
  .sidebar-layout--open:not(.sidebar-layout--sheet) {
    grid-template-columns: 272px minmax(0, 1fr);
    align-items: start;
  }
}
/* Before hydration a phone renders the column markup; keep it hidden there. */
@media (max-width: 839px) {
  .sidebar-layout:not(.sidebar-layout--sheet) .sidebar-layout__aside {
    display: none;
  }
}
.sidebar-layout--sheet .sidebar-layout__aside {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 20;
  inline-size: min(320px, calc(100% - 48px));
  overflow-y: auto;
  border-radius: 0 var(--md-sys-shape-corner-large) var(--md-sys-shape-corner-large) 0;
  box-shadow: var(--sky-elevation-3);
}
.sidebar-layout__close {
  float: inline-end;
}
.sidebar-layout__scrim {
  position: fixed;
  inset: 0;
  z-index: 19;
  background-color: color-mix(in srgb, var(--md-sys-color-scrim) 32%, transparent);
}
```
(If TypeScript rejects `inert` on a div in this React version, use `{...(sheet && open ? { inert: '' } : {})}` and report it.)

**9b PriceRangeField**
- Test: renders "Min"/"Max" fields (find `md-outlined-text-field` by `label` attribute via raw elements) and an `md-slider`; setting the slider's `valueStart/valueEnd` and dispatching `change` calls `onChange({ min: 500, max: 2000 })`; values at the bounds are sent as `undefined`; dispatching `change` on the Min field with its `value` set to `"700"` calls `onChange({ min: 700, max: <current max or undefined> })`; a Min above Max is clamped to Max.
- Implement with **raw** elements (`createElement('md-slider', …)`, `createElement('md-outlined-text-field', …)`) so tests can drive them: slider props `range, labeled, min, max, step, 'value-start', 'value-end', 'aria-label-start', 'aria-label-end'`; text fields `type: 'number', label, value, min, max, inputmode: 'numeric'`; React `onChange` on each raw element reads `e.currentTarget` (`valueStart`/`valueEnd` for the slider, `value` for fields). Props:
```ts
export interface PriceRange { min?: number; max?: number }
export interface PriceRangeFieldProps {
  bounds: { min: number; max: number; step: number };
  value: PriceRange;
  onChange: (range: PriceRange) => void;
  copy: { min: string; max: string; minLabel: string; maxLabel: string };
}
```
  Normalise before `onChange`: clamp into bounds, swap if min > max, send `undefined` for a value equal to its bound. CSS: `.price-range { display: grid; gap: 12px; } .price-range__inputs { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; } .price-range md-slider { inline-size: 100%; }` (the `–` between inputs is `aria-hidden`).

**9c CheckboxFacet**
- Test: with 7 options and `limit` 5 → 5 rows + a "Show more" `md-text-button`; clicking it shows 7 and "Show less"; a zero-count unselected option renders its `md-checkbox` with the `disabled` property/attribute; selecting (set `checked = true` on the raw `md-checkbox`, dispatch `change`) calls `onChange([...selected, value])`; unchecking removes it; typing in the search field (raw `md-outlined-text-field`, set `value`, dispatch `input`) filters rows by label (case-insensitive); the row text includes the count ("Glow Beauty Studio 3").
- Implement:
```ts
export interface FacetOption { value: string; label: string; count: number }
export interface CheckboxFacetProps {
  options: FacetOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchLabel: string;
  showMore: string;
  showLess: string;
  limit?: number; // default 5
}
```
  Search field only when `options.length > limit`. Rows: `<ul className="checkbox-facet__list">` → `<li><label className="checkbox-facet__row">{md-checkbox raw: checked, disabled: count === 0 && !isSelected, 'aria-describedby' none}<span className="checkbox-facet__label body-medium">{label}</span><span className="checkbox-facet__count label-small">{count}</span></label></li>`. CSS: rows `display: flex; align-items: center; gap: 12px; min-block-size: 40px;`, label `flex: 1; min-inline-size: 0;`, count `color: var(--md-sys-color-on-surface-variant);`, disabled row label `color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent)`.

- [ ] Steps for each of 9a/9b/9c: failing test → implement → pass → eslint → commit (`feat(msd): SidebarLayout`, `feat(msd): PriceRangeField`, `feat(msd): CheckboxFacet`).

---

### Task 10: `FilterPanel`

**Files:** Create `apps/msd/src/app/components/filter-panel/{filter-panel.tsx,filter-panel.css,filter-panel.test.tsx}`; modify `apps/msd/src/content.json`.

- [ ] **Step 1: Content** — add to `category`:
```json
    "filterPanel": {
      "title": "Filters",
      "close": "Close filters",
      "clearAll": "Clear all",
      "showMore": "Show more",
      "showLess": "Show less",
      "location": { "title": "Your location", "notSet": "Not set", "change": "Change location" },
      "distance": { "title": "Distance", "any": "Any distance", "within": "Within {km} km", "needsLocation": "Set your location to filter by distance." },
      "price": { "title": "Price", "min": "Min", "max": "Max", "minLabel": "Minimum price", "maxLabel": "Maximum price" },
      "business": { "title": "Business", "search": "Search businesses" },
      "branches": { "title": "Branches", "search": "Search branches" }
    },
```
  and to `toolbar`: `"showFilters": "Show filters", "hideFilters": "Hide filters"` (keep `filters`, `filtersActive`).
- [ ] **Step 2: Failing test** `filter-panel.test.tsx`: given facets with 2 vendors, 2 branches, 6 distance buckets and price `{min: 299, max: 3499}`, `kind="deals"`, location `{ city: 'Gorakhpur', hasCoords: true }`:
  - renders a `sky-accordion` with 5 `sky-accordion-item`s whose `header` (property or attribute) are Your location, Distance, Price, Business, Branches;
  - Your location shows "Gorakhpur" and a "Change location" `md-text-button`; clicking it calls `onChangeLocation`;
  - Distance renders 7 raw `md-radio`s (Any + 6), the "Within 5 km" row shows its count; selecting the 5 km radio (set `checked`, dispatch `change`) calls `onRadius(5)`; "Any" calls `onRadius(undefined)`;
  - without coordinates the radios are disabled and the needs-location text shows;
  - `kind="products"` renders only the Price item;
  - "Clear all" (`md-text-button`) calls `onClearAll`.
  Run → FAIL.
- [ ] **Step 3: Implement** `FilterPanel` props:
```ts
export interface FilterPanelProps {
  kind: 'deals' | 'products';
  facets: CatalogDealFacets | null;
  location: { city: string | null; hasCoords: boolean };
  onChangeLocation: () => void;
  radiusKm?: number;
  onRadius: (km: number | undefined) => void;
  price: PriceRange;
  priceBounds: { min: number; max: number; step: number };
  onPrice: (range: PriceRange) => void;
  vendorIds: string[];
  onVendors: (ids: string[]) => void;
  branchIds: string[];
  onBranches: (ids: string[]) => void;
  onClearAll: () => void;
  copy: (typeof content)['category']['filterPanel'];
}
```
  Markup: `<div className="filter-panel">` → `<h2 className="filter-panel__title title-medium">{copy.title}</h2>` → `<sky-accordion>` with `<sky-accordion-item header=… open>` per section → footer `TextButton` Clear all (use raw `md-text-button` so tests can click it). Distance rows: `<label className="filter-panel__radio">{raw md-radio name="radius" value checked disabled onChange}<span>{label}</span><span className="filter-panel__count label-small">{count}</span></label>`. Business: `CheckboxFacet` with options `facets.vendors.map((v) => ({ value: v.id, label: v.name, count: v.count }))`. Branches: labels `${b.name}, ${b.city}` (omit city when null). Price: `PriceRangeField` with `copy.price`. Deal-only sections are skipped when `kind === 'products'`. CSS: title margin 0 0 8px; radios like CheckboxFacet rows; hint text `body-small` on-surface-variant.
- [ ] **Step 4:** Test → PASS; eslint clean.
- [ ] **Step 5: Commit** — `content.json` + filter-panel folder; `feat(msd): FilterPanel`.

---

### Task 11: Wire the panel into the category page

**Files:** Modify `category.tsx`, `category.test.tsx`, `content.json`; delete `apps/msd/src/app/components/price-filter-dialog/`.

- [ ] **Step 1: Tests first.** Add `getCatalogDealFacets: (...args) => getCatalogDealFacetsMock(...args)` to the catalog API mock (hoisted `getCatalogDealFacetsMock` resolving `{ data: { vendors: [{ id: VENDOR_A, name: 'Glow', count: 2 }], branches: [{ id: BRANCH_A, name: 'Main', city: 'Pune', vendorName: 'Glow', count: 2 }], distance: [], price: { min: 299, max: 3499 } } }` with valid UUID constants). Replace the old "applies a price filter from the Filters dialog" test with:
  - desktop (stub `matchMedia` → matches true): the panel (`aside` named `content.category.filterPanel.title`) is visible by default; the Filters toolbar button reads "Hide filters" and hides it on click ("Show filters" brings it back);
  - ticking the Glow checkbox → URL `?vendor=<VENDOR_A>` and the last deals call has `vendorIds: [VENDOR_A]`; the last facets call has `vendorIds: [VENDOR_A]` too;
  - branch checkbox → `?branch=` and `branchIds`;
  - with visitor coordinates, picking "Within 5 km" → `?radius=5` and `radiusKm: 5`;
  - price slider change → `?min=500&max=2000` and `minPrice`/`maxPrice`;
  - Clear all removes all five params;
  - phone (`matches: false`): panel closed by default; the Filters button opens it as `role="dialog"`;
  - product category: facets are not requested; the panel shows only Price.
  Run → FAIL.
- [ ] **Step 2: Implement.**
  - Imports: `SidebarLayout`, `FilterPanel`, `CityPickerDialog`, `useMediaQuery`, `getCatalogDealFacets`, `type CatalogDealFacets`, `type PriceRange` (from price-range-field). Remove `PriceFilterDialog` and `createElement` if unused.
  - URL params: `radius` (`toPrice` → positive number), `vendor` / `branch` (`split(',').filter(Boolean)` of UUID-looking strings), `min` / `max` (existing). A `setListParams(patch: Record<string, string | undefined>)` helper (generalise `applyPrice`'s loop) writes several keys at once with `{ replace: true }`.
  - Add them to `listKey`, `isDefaultView`, and the deals call (`vendorIds`, `branchIds`, `radiusKm: hasCoords ? radius : undefined`). Products get only price.
  - Facets: `const [facets, setFacets] = useState<CatalogDealFacets | null>(null);` and an effect keyed on `[category?.id, activeSubcategory?.id, cityLocation?.city, lat, lng, radius, vendorIds.join(), branchIds.join(), minPrice, maxPrice]` that, for deal categories only (and not while `cityPending`/`cityMissing`), calls `getCatalogDealFacets({ categoryId, subcategoryId, city, state, latitude, longitude, radiusKm, vendorIds, branchIds, minPrice, maxPrice })` and stores `data` (ignore stale responses with a cancelled flag; on error keep the previous facets).
  - Panel state: `const desktop = useMediaQuery('(min-width: 840px)', true); const [panelOpen, setPanelOpen] = useState<boolean | null>(null); const filtersOpen = panelOpen ?? desktop;` (all hooks before the early returns). Remove the old `filtersOpen` dialog state and `PriceFilterDialog` render.
  - Toolbar `start`: raw `md-text-button` with a `tune` icon, label `desktop ? (filtersOpen ? t.toolbar.hideFilters : t.toolbar.showFilters) : activeFilters ? t.toolbar.filtersActive.replace('{count}', …) : t.toolbar.filters`, `aria-expanded`, `onClick={() => setPanelOpen(!filtersOpen)}`. Not for therapy categories. `activeFilters` = number of set groups among radius, price, vendor, branch.
  - Results band: wrap the existing results (messages, grid/map, LoadMore) in `<SidebarLayout open={filtersOpen && !isTherapyCategory} onClose={() => setPanelOpen(false)} sidebarLabel={t.filterPanel.title} closeLabel={t.filterPanel.close} sidebar={<FilterPanel … />}>`. Keep `ListingToolbar` above the layout.
  - `FilterPanel` props: `kind={isProductCategory ? 'products' : 'deals'}`, `location={{ city: visitorCity, hasCoords }}` (take `city` from `useVisitorLocation()` too), `onChangeLocation={() => setCityPickerOpen(true)}`, `priceBounds={{ min: facets?.price?.min ?? t.filters.min, max: facets?.price?.max ?? t.filters.max, step: t.filters.step }}` (floor/ceil to the step), handlers call `setListParams`, `onClearAll` clears radius/min/max/vendor/branch.
  - `{cityPickerOpen && <CityPickerDialog onClose={() => setCityPickerOpen(false)} />}` (state declared with the other hooks).
- [ ] **Step 3: Clean up.** `git rm -r apps/msd/src/app/components/price-filter-dialog` after `grep -rn "price-filter-dialog" apps/msd/src` shows only category.tsx (already removed). Remove the unused `filters.title/price/priceValue/minLabel/maxLabel/reset/cancel/apply` keys from `content.json` (keep `filters.min/max/step`) after grep confirms no reader.
- [ ] **Step 4:** Full msd check: `npx vitest run --root apps/msd src/app src/hooks src/prerender-data src/hydration.test.tsx src/entry-server.test.tsx` → PASS; category file 3 runs → all pass; tsc grep `pages/category|filter-panel|sidebar-layout|price-range-field|checkbox-facet|city-picker-dialog` → nothing; eslint → only the pre-existing error.
- [ ] **Step 5: Commit** — `feat(msd): category filter side panel with location, distance, price, business and branches`.

---

### Task 12: Verify and document

- [ ] **Step 1:** `npx nx run msd:test --skip-nx-cache` (only the 3 known `app.spec`/`otp.test` failures allowed), `npx nx run msd-api:test --skip-nx-cache`, `npx nx build msd`, `npx nx build msd-api`, `npx nx build shared-ui`, `npx nx run mera-driver:test` (shared-ui card change must not break mera-driver).
- [ ] **Step 2: Visual** (restart `nx serve msd` and `nx serve msd-api` after these changes; if the servers were started by someone else, ask before restarting): `/category/massage` at 1440×900 and 390×844, light and dark:
  - desktop: panel column left (Your location, Distance, Price, Business, Branches, Clear all), Hide/Show filters works, results reflow;
  - phone: Filters opens the left sheet with scrim; Escape / close / scrim close it; focus returns to the Filters button;
  - List view shows horizontal cards (stacking under 600px card width), Grid unchanged, Map works;
  - Sort menu: Relevance / Price low-high / high-low (+ Distance with a location);
  - Change location opens the city dialog and updates Your location and distances;
  - `/category/product`: Price-only panel; therapy category: no panel/sort.
  - No horizontal scroll.
- [ ] **Step 3:** Impeccable detector on the changed msd component folders and the category page → fix real findings.
- [ ] **Step 4:** `TASK.md` (under `### msd shell — follow-ups`):
```markdown
- [ ] msd: reviews system (customers rate completed orders) so the category page can add rating sort, rating filter and card ratings
- [ ] msd: explore page adopts FilterPanel/SidebarLayout and the horizontal card list view
- [ ] msd: product vendor facet for the product category filter panel
```
  Commit `docs(msd): category filter follow-ups`.
