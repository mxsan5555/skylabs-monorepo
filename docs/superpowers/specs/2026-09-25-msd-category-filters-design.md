# msd category page: filter side panel, sorts and list view

Date: 2026-09-25
Apps: `apps/msd-api` (catalog API), `apps/msd` (category page), `packages/shared-ui` (one card option)
Builds on: `2026-09-25-msd-category-toolbar-design.md` (Tasks 1-14 shipped: pills, toolbar, paging, price dialog, DealMap)
Reference: Groupon category filter column (Your location, Distance, Locations, Price, Brand). Observation only.

## User decisions (2026-09-25)

1. Remove the "All cities" toolbar chip.
2. Sort options: Relevance, Price: Low to High, Price: High to Low, Distance: Nearest. **No rating** (no review data exists; not shown, not disabled).
3. Filters live in a side panel, not a popup: Your location (city + Change location), Distance, Price, Business (checkbox list), Branches (checkbox list).
4. Remove the toolbar search.
5. Add a List / Grid / Map view switch.

## Constraints

- Pages compose components only; new layout pieces are msd components with token-only CSS.
- `packages/shared-ui` stays app-neutral: the only change there is a generic `layout="horizontal"` option on `sky-product-card` (mera-driver unaffected unless it opts in).
- Copy in `content.json`. No fabricated data: counts come from the API.
- API: Zod + zod-to-openapi, public catalog routes stay unauthenticated, same envelope `{ data, error, meta }`.

## 1. API (`apps/msd-api`)

### `GET /catalog/deals` (schema in `src/schemas/*catalog*`, service `listPublicDeals` in `src/services/catalog.service.ts`)

- `sort`: `relevance | price_asc | price_desc | distance | newest | discount`, default `relevance`.
  - `relevance`: nearest first when `latitude`+`longitude` are sent, otherwise `createdAt desc` (today's behaviour).
  - `price_asc` / `price_desc`: `salePrice` asc/desc, ties by `createdAt desc`.
  - `distance`: nearest first; without coordinates behaves as `relevance`.
  - `newest`, `discount`: unchanged (kept for existing callers: home, explore).
- New filters:
  - `vendorIds`: comma-separated UUIDs (max 50) → `vendorId in [...]`. Existing single `vendorId` stays.
  - `branchIds`: comma-separated UUIDs (max 50) → `branchId in [...]`.
  - `radiusKm`: number > 0 and ≤ 500; applied only with coordinates (ignored otherwise), in memory after the Haversine distance is attached.
- Execution: when coordinates are present, or `radiusKm` is set, the matching set is fetched once, distance attached, radius-filtered, sorted in memory by the requested sort (distance for `relevance`/`distance`, price for price sorts, `createdAt` for `newest`, discount for `discount`), then paginated; `total` = count after the radius filter. Without coordinates the existing SQL `orderBy` + `skip/take` path is used with the new price orders.

### `GET /catalog/deals/facets` (new, public)

Query: the same filters as `/catalog/deals` (category, subcategory, city/state, search, price, vendorIds, branchIds, radiusKm, coordinates); no paging/sort.

Response `data`:
```json
{
  "vendors":  [{ "id": "…", "name": "Glow Beauty Studio", "count": 3 }],
  "branches": [{ "id": "…", "name": "Taramandal Branch", "city": "Gorakhpur", "vendorName": "Glow Beauty Studio", "count": 2 }],
  "distance": [{ "km": 1, "count": 0 }, { "km": 5, "count": 1 }, …],
  "price":    { "min": 299, "max": 3499 }
}
```
- Each facet's counts apply every filter **except its own** (vendors ignore `vendorIds`, branches ignore `branchIds`, distance ignores `radiusKm`, price ignores `minPrice/maxPrice`).
- `distance` is `[]` without coordinates; buckets are fixed at 1, 5, 10, 20, 50, 100 km and count deals within that radius.
- Vendors sorted by count desc (ties keep first-seen order); branches likewise. `price` is `null` when nothing matches.
- Implementation: one `findMany` of the base-filtered deals selecting only `id, vendorId, branchId, salePrice, vendor.businessName, branch.name/city/latitude/longitude`, counted in memory.
- Registered in the OpenAPI registry; route tests cover counts-exclude-own-filter, distance buckets, empty result.

### `GET /catalog/products`

- `sort` adds `price_asc | price_desc | relevance` (`relevance` = `newest`).
- Products get no vendor/branch/distance facets in this round.

## 2. msd API client (`apps/msd/src/api/catalog.ts`)

- `listCatalogDeals` opts: `sort` type widened to the new union; add `vendorIds?: string[]`, `branchIds?: string[]`, `radiusKm?: number` (arrays serialised comma-joined).
- `listCatalogProducts` sort widened.
- New `getCatalogDealFacets(opts)` → `CatalogDealFacets` type (shape above).

## 3. Toolbar changes (category page)

- Remove the `SearchField` and the location `ChoiceMenu` ("All cities"). City URLs (`/category/:slug/:city`) stay (prerender, sitemap, SEO) with no toolbar entry.
- Start: **Filters** button (`TextButton`, icon `tune`, label "Hide filters" / "Show filters" on desktop, "Filters" + active count on phones), toggling the panel.
- End: **view switch** (new msd `ViewSwitch`: three `IconButton`s, `list`/`grid`/`map` icons, `role="group"`, `aria-pressed`, labels from content; `map` only for deal categories with mappable deals) + **Sort** `ChoiceMenu` with `relevance, price_asc, price_desc, distance` (`distance` listed only when the visitor has coordinates; otherwise hidden). Stored in `?view=` (default grid) and `?sort=` (default relevance, omitted).
- Therapist categories: no filters/sort (unchanged API), view switch list/grid only.

## 4. Filter panel (new msd component `FilterPanel`, `components/filter-panel/`)

Layout: new msd component `SidebarLayout` (`components/sidebar-layout/`): `aside` + `main` grid inside the results band.
- ≥ 840px: 272px aside column + fluid main; the aside is hidden when the panel is closed (default open).
- < 840px: the aside is a left side sheet over the page (fixed, full height, max 320px wide, scrim behind, `role="dialog"` `aria-modal="true"`, close `IconButton`, Escape closes, focus moves into it on open and back to the Filters button on close). Default closed.
- Surface tokens: `surface-container-low`, `--md-sys-shape-corner-large` (desktop), `--sky-elevation-3` (sheet).

Sections, each a shared-ui `sky-accordion-item` (open by default) inside one `sky-accordion`:
1. **Your location**: `useVisitorLocation()` city ("Gorakhpur") or "Not set", plus a "Change location" `TextButton` opening **`CityPickerDialog`** (extracted from `site-header/city-chip.tsx` into `components/city-picker-dialog/`; `CityChip` then uses it too; behaviour unchanged).
2. **Distance**: radio list (`md-radio` + label + count chip-style text) for 1, 5, 10, 20, 50, 100 km plus "Any distance"; disabled with a one-line hint "Set your location to filter by distance" when there are no coordinates. `?radius=`.
3. **Price**: new msd **`PriceRangeField`** (range `Slider` + two `OutlinedTextField type=number` inputs "Min" / "Max", kept in sync; applies on slider `change` and on input blur/Enter). Bounds from facets `price` (fallback 0 to 10,000). `?min=&max=`. Replaces `PriceFilterDialog` (deleted).
4. **Business**: new msd **`CheckboxFacet`** (search `OutlinedTextField`, `md-checkbox` + label + count rows, first 5 then "Show more"/"Show less", zero-count options shown disabled unless selected). `?vendor=id,id`.
5. **Branches**: `CheckboxFacet` with "Branch name, City" labels. `?branch=id,id`.
- Footer: "Clear all" `TextButton` (removes radius, min, max, vendor, branch).
- Every change applies immediately (URL update → list restarts at page 1). Facets refetch after every filter change; the API applies the "ignore your own selection" rule, so the client sends all current filters every time.
- Product categories show the Price section only (no product vendor facet in this round); Your location, Distance, Business and Branches are deal-only.

Location source: the category page switches from `useCurrentLocation` to `useVisitorLocation` for coordinates (resolves the existing TASK.md follow-up for category).

## 5. List view

- `packages/shared-ui/src/components/sky-product-card/sky-product-card.ts`: new `layout` property (`vertical` default | `horizontal`), reflected attribute. Horizontal: media 40% width (min 160px) left, body right, same slots/props; stacks to vertical when the card itself is narrower than 600px (container query on the host). React wrapper and `apps/msd/src/types/sky-elements.d.ts` updated. Unit test in the card's existing test file.
- `DealCard` / `SkyProductCardWC` accept `layout` and pass it through.
- `CardGrid` gains `layout?: 'grid' | 'list'` (`list` = one column, 16px gap).

## 6. Content (`content.json` → `category`)

`sortOptions` → `relevance "Relevance"`, `price_asc "Price: Low to High"`, `price_desc "Price: High to Low"`, `distance "Distance: Nearest"`. New: `view.{label,list,grid,map}`, `toolbar.{showFilters,hideFilters,filtersActive}`, `filterPanel.{title,close,clearAll,location.{title,notSet,change},distance.{title,any,within,needsLocation},price.{title,min,max},business.{title,search},branches.{title,search},showMore,showLess}`. Remove now-unused `toolbar.allCities`, `toolbar.location`, `search.*`, `filters.*` dialog copy once nothing reads them.

## 7. Accessibility

Panel sections are headed buttons (accordion); checkbox/radio rows are real labelled controls; counts are part of the label text ("Glow Beauty Studio, 3 deals"). Side sheet traps focus while open and restores it. View switch uses `aria-pressed`. Live region announces the result count (existing).

## 8. Testing

- API: `catalog.routes.test.ts` for each sort, vendorIds/branchIds, radiusKm with and without coordinates, facets exclusion rules, distance buckets, validation (bad UUID, radius range).
- msd: tests for `ViewSwitch`, `SidebarLayout` (desktop column vs sheet state via a `mode` prop computed from `matchMedia`, focus return), `PriceRangeField`, `CheckboxFacet` (search, show more, zero-count disabled), `FilterPanel` (sections render from facets, Clear all), `CityPickerDialog` (extracted, CityChip test still green), `sky-product-card` horizontal layout, `CardGrid` list layout, category page (sort values sent to API, `?vendor=`/`?branch=`/`?radius=` sent as `vendorIds`/`branchIds`/`radiusKm`, view switch, search/All cities gone).
- Visual: `/category/massage` at 1440 and 390, light/dark, panel open/closed, list/grid/map; Impeccable detector.

## Out of scope

Ratings (sort, filter, display) until a review system exists; product vendor facets; therapist filters; migrating the explore page to the new panel.
