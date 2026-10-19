# msd category page: header, toolbar, lazy loading and map

Date: 2026-09-25
App: `apps/msd` (React 19 + Vite), also touches `apps/msd/src/app/pages/search` (explore map)
Builds on: `2026-09-24-msd-category-page-design.md` (PageSection, CardGrid, SectionHead already shipped)
Reference: Groupon `/local/massage` header pattern (breadcrumb → headline + count → description → subcategory pills → filters / location / map / sort). Observation only; copy and data stay ours.

## Goals

1. Header: h1 + total count, clamped description, subcategory pills.
2. Toolbar: Filters, Location, Search, Show on map, Sort.
3. Lazy loading with a true total and even card spacing.
4. A free map (Leaflet + OpenStreetMap) for the category map view, also fixing the broken explore map; Google stays available behind an env switch.

Build order (user-set): pills + count + description → sort → lazy loading → location → filters → map.

## Constraints

- Composition only in pages: shared-ui components (`ChipSet`, `FilterChip`, `AssistChip`, `Menu`, `MenuItem`, `Dialog`, `Slider`, `TextButton`, `OutlinedButton`, `CircularProgress`, `sky-action-field`) plus msd components. No page CSS file.
- `packages/shared-ui` is not changed (it is shared with mera-driver).
- New msd components carry their own token-only CSS (M3 roles, shape and elevation tokens; layout lengths 8/12/16/20/24/32/48px).
- Copy lives in `content.json` → `category`.
- Keep `VITE_GOOGLE_MAPS_API_KEY` and `@react-google-maps/api`.

## Data facts (verified)

| API | page/pageSize | `meta.total` | sort | min/maxPrice | lat/lng |
|---|---|---|---|---|---|
| `listCatalogDeals` | yes | yes | `newest`, `discount` | yes | yes (nearest-first + `distanceKm`) |
| `listCatalogProducts` | yes | yes | `newest`, `discount` | yes | no |
| `listCatalogTherapists` | yes | yes | no | no | yes |

Deals carry `branch.latitude/longitude` (Decimal strings, may be null). `leaflet@1.9.4` and `@types/leaflet` are already root dependencies (used by mera-driver).

## 1. Header (PageSection `stack`, surface)

- `Breadcrumb` (unchanged).
- `SectionHead as="h1" titleClassName="headline-large"`: heading = display name; `actions` = total count (`aria-live="polite"`), e.g. "24 deals". The count shows `meta.total` (all matches), not the loaded card count. Search moves out of the header into the toolbar.
- Description: new msd component **`ClampText`** (`components/clamp-text/`): renders a `<p class="body-large">` clamped to 2 lines with a "More" / "Less" `TextButton` shown only when the text overflows (measured once after mount and on resize). `aria-expanded` on the button. Omitted when the category has no description.
- Subcategory pills: new msd component **`ChipNav`** (`components/chip-nav/`): `ChipSet` of `FilterChip`s, single-select ("All" + each subcategory, `selected` on the active one), horizontally scrollable on phones (overflow-x auto, no wrap from 600px down; wraps above). Each chip click calls `onSelect(slug | undefined)`; the page writes `?sub=` exactly as the tabs did. `FilterChip` cannot hold a link, so subcategory views are not crawlable links. This matches today (tabs were not links either): `?sub=` views are query variants of the canonical category page and are not in the sitemap, so SEO is unaffected.
- The `md-secondary-tab` row and the `tabpanel` wrapper are removed. The grid is labelled by the results section instead.

## 2. Toolbar (new msd component `ListingToolbar`, first child of the results band)

`components/listing-toolbar/`: a flex row, wraps on phones; `start` and `end` slots (ReactNode) so each page supplies its own controls. Pure layout: gap 8px, items centered, `end` pushed right. The category page fills it:

Start:
- **Filters** (`AssistChip`, icon `tune`, label "Filters" or "Filters (1)" when a price filter is active) → opens the Filters dialog. Deals and products only.
- **Location** (`AssistChip`, icon `location_on`, label = active city or "All cities") → `Menu` anchored to the chip listing "All cities" + every partner city from `useCatalogShell().locations` (the API cannot tell up front which cities have deals in this category; a city with none shows the existing empty state, and empty city pages are already skipped by prerender). Selecting navigates to `cityHref(slug, city)` or `categoryHref(slug)` (existing city pages; canonical/noindex rules unchanged). Deals only.

End:
- **Search** (`sky-action-field`, the existing controlled `SearchField`, `dense`).
- **Show on map / Show grid** (`TextButton` with icon `map` / `grid_view`). Deals only; hidden when no loaded deal has coordinates.
- **Sort** (`TextButton` "Sort: {label}" with icon `swap_vert` + `Menu`). Options (content-driven):
  - `recommended`: no `sort` param (API default; nearest-first when visitor coords exist),
  - `discount`: "Biggest discount",
  - `newest`: "Newest".
  Stored in `?sort=` (absent = recommended). Deals and products only.

Therapist categories show Search only (their API has no sort/price/city).

## 3. Lazy loading (new hook `usePagedList`, `hooks/use-paged-list.ts`)

```ts
usePagedList<T>(fetchPage: (page: number) => Promise<{ data: T[]; meta?: { total?: number } }>, deps: unknown[], initial?: { items: T[]; total: number })
  → { items, total, status: 'loading' | 'ready' | 'error', error, hasMore, loadingMore, loadMore(), retry() }
```

- Page size `CATEGORY_PAGE_SIZE = 12` (exported from `prerender-data/loaders.ts`, replacing the current 60, used by page and loader).
- Any dep change (category, sub, sort, price, search, city, coords) resets to page 1 and discards in-flight responses (request id guard).
- `hasMore = items.length < total`.
- New msd component **`LoadMore`** (`components/load-more/`): an `IntersectionObserver` sentinel (rootMargin 400px) that calls `loadMore` when visible, plus a visible `OutlinedButton` "Show more" (keyboard / fallback) and `CircularProgress` while `loadingMore`; on a page error shows the error text and a "Try again" button. Renders nothing when `!hasMore`. `aria-live="polite"` status "Showing 12 of 24".
- The existing effect-based fetching in `category.tsx` for the three listing types moves into `usePagedList` calls; the category fetch, city resolution and prerender background refresh stay as they are.
- Prerender: `loadCategoryData` requests `pageSize: CATEGORY_PAGE_SIZE` and adds `total` to `CategoryData` (`meta.total ?? deals.length`). The page seeds `usePagedList` with `{ items: initial.deals, total: initial.total }` so the first page hydrates without a fetch mismatch; the background refresh keeps working for page 1.
- CardGrid spacing unchanged (24px under the toolbar, 16/20px between cards).

## 4. Filters (second-last)

- `Dialog` "Filters" with a range `Slider` (`range`, `labeled`, step 100) from `content.category.filters.price.{min,max}` (₹0 to ₹10,000), plus "Reset" and "Apply".
- Applied values go to `?min=&max=` and the API's `minPrice`/`maxPrice`; defaults are omitted from the URL.
- The Filters chip label shows the active filter count.

## 5. Map (last)

New msd component **`DealMap`** (`components/deal-map/`), replacing `components/map`:

```ts
interface DealMapPoint { id: string; lat: number; lng: number; label: string; href: string }
<DealMap points={DealMapPoint[]} ariaLabel={string} />
```

- Engine chosen by `import.meta.env.VITE_MAP_PROVIDER` (`leaflet` default, `google`):
  - `leaflet-map.tsx`: plain `leaflet` (no react-leaflet). Tiles from `VITE_MAP_TILE_URL` (default `https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with attribution from `VITE_MAP_TILE_ATTRIBUTION` (default `© OpenStreetMap contributors`), always visible. Markers are `L.divIcon` price pills (`<a href>` so they are real links, keyboard focusable) styled in `deal-map.css` with `--md-sys-color-primary` / `--md-sys-color-on-primary`, `--md-sys-shape-corner-full`, `--sky-elevation-2`; click navigates through React Router. `fitBounds` over all points with 48px padding; a single point uses zoom 14.
  - `google-map.tsx`: the current `@react-google-maps/api` implementation moved in, using `VITE_GOOGLE_MAPS_API_KEY`, markers restyled with the same tokens.
- Loaded with `React.lazy` + `Suspense` (`CircularProgress` fallback) only when the map view opens, so neither engine ships in the base bundle or runs during prerender. `leaflet/dist/leaflet.css` is imported inside `leaflet-map.tsx`.
- Map height: 480px on phones, 600px from 840px; full container width, `--md-sys-shape-corner-large`.
- Category map view plots loaded deals with coordinates; a `body-medium` note says "{n} deals have no map location" when some are missing. Loading more pages adds markers.
- Explore (`pages/search/search.tsx`) switches from `components/map` to `DealMap`; `components/map` is deleted after the switch (its Google code lives on in `google-map.tsx`).
- `.env.example` gains `VITE_MAP_PROVIDER=leaflet`, `VITE_MAP_TILE_URL=`, `VITE_MAP_TILE_ATTRIBUTION=`; `VITE_GOOGLE_MAPS_API_KEY` stays. Vercel env: same keys (documented in `DEPLOYMENT.md`).
- Deal page single-location map: out of scope, recorded in `TASK.md`.

## Content (`content.json` → `category`)

`count` reuses `dealCount` / `resultCount`; new: `description.{more,less}`, `pills.label` (chip set aria-label), `toolbar.{filters,filtersActive,location,allCities,showMap,showGrid,sort,sortLabel}`, `sortOptions` replaced with `[{value:'recommended',label:'Recommended'},{value:'discount',label:'Biggest discount'},{value:'newest',label:'Newest'}]` (the old list with popular/rating/price/distance has no reader in `apps/msd/src`; verified 2026-09-25), `loadMore.{button,loading,retry,status}` (status template "Showing {shown} of {total}"), `filters.{title,price,reset,apply,min,max}` with `price.{min:0,max:10000,step:100}`, `map.{label,missing}`.

## Accessibility

- One h1. Chip set has `aria-label`; the selected FilterChip exposes `selected`.
- Menus: anchor buttons have `aria-haspopup="menu"` and `aria-expanded`; Escape closes and returns focus (md-menu default).
- Count and load-more status are polite live regions.
- Map: container `role="region"` + `aria-label`; each marker is a link named "{title}, {price}". The grid view remains the accessible default.
- Touch targets ≥ 48px (M3 chips and buttons satisfy this).

## Testing

- `clamp-text.test.tsx`: shows "More" only when content overflows (mock scrollHeight/clientHeight), toggles `aria-expanded`.
- `chip-nav.test.tsx`: renders All + items, marks the active one selected, calls `onSelect`.
- `listing-toolbar.test.tsx`: renders start/end slots in order.
- `use-paged-list.test.ts`: first page, `loadMore` appends, `hasMore` from total, dep change resets and ignores stale responses, error + retry, seeded initial page does not refetch page 1 on mount.
- `load-more.test.tsx`: button calls `loadMore`, hidden when `!hasMore`, observer triggers `loadMore` (mock `IntersectionObserver`).
- `deal-map.test.tsx`: picks the engine from the env value (engines mocked), renders the missing-location note.
- `category.test.tsx`: pills set `?sub=`; sort menu sets `?sort=` and calls the API with `sort`; count shows `meta.total`; second page requested with `page: 2`; city menu navigates to the city URL; price filter sends `minPrice`/`maxPrice`; map toggle hidden for products/therapists.
- `hydration.test.tsx` and `entry-server.test.tsx` stay green (prerender payload with `total`).
- Visual: `/category/massage`, `/category/massage/gorakhpur`, `/category/product`, `/explore?q=spa` map view at 1440px and 390px, light and dark; Impeccable detector on changed files.

## Out of scope

- Deal page map, rating/price sorts (no API support), therapist sort/price/city filters, a "Categories" dropdown chip (the header's category nav already covers it).
