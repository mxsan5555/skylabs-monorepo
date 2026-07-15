# 06 — Search & Filters (incl. Map-Based)

One endpoint powers the Explore page's list, grid, and map views. Filters mirror the
shipped frontend (`apps/msd/src/app/pages/search/search.tsx` + `SearchFilter` type):
**Price, Suggested, Category, Features, Distance** — plus map-based geo filtering.

## Endpoint

```
GET /deals
```

Public, cursor-paginated, cache-friendly (short TTL). Returns `DealCardResponseSchema[]`.

## Query parameters

### Text + taxonomy

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `q` | string | Full-text over title, shortDescription, company displayName (Postgres FTS + trigram for typos) | `q=deep tissue` |
| `category` | slug | Single category | `category=massage` |
| `subcategory` | slug | Requires `category` | `subcategory=deep-tissue` |
| `company` | slug | Deals of one company | |

### Price

| Param | Type | Description |
|-------|------|-------------|
| `priceMin` / `priceMax` | int (paise) | Applied to each deal's **cheapest active plan** |
| `priceLevel` | csv enum | `$,$$` — bands defined below |

Price-level bands (single source of truth — served to the frontend via
11-content-navigation so the filter dialog labels never drift):

| Level | Range (INR) |
|-------|-------------|
| `$` | ₹499 – ₹1,499 |
| `$$` | ₹1,500 – ₹4,999 |
| `$$$` | ₹5,000+ |

### Features

| Param | Type | Description |
|-------|------|-------------|
| `features` | csv | From the shared feature vocabulary (05-deals). **AND** semantics — deal must have all (matches current frontend behaviour) |

### Geo & distance

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `lat`, `lng` | decimal | User position or map center. Enables `distanceKm` in results + distance sort | `lat=19.06&lng=72.83` |
| `radiusKm` | number | Max distance (frontend Distance slider, 1–50) | `radiusKm=5` |
| `bbox` | `minLng,minLat,maxLng,maxLat` | Map viewport search — **alternative to radius** (used when panning the map) | |
| `view` | enum | `list` (default) or `map` — map returns pins (below) | |

Distance is computed to the **nearest redeemable location** of each deal
(PostGIS or earthdistance — build decision).

### Sort & flags

| Param | Type | Description |
|-------|------|-------------|
| `sort` | enum | `suggested \| popular \| rating \| price-asc \| price-desc \| distance \| newest`. `distance` requires `lat/lng`. Default `suggested` |
| `featured` | bool | Only `isFeatured` (home "Featured Deals" rail) |
| `hot` | bool | Only `isHot` (home "Hot Right Now" rail) |
| `openNow` | bool | Computed from location hours |
| `limit`, `cursor` | | Cursor pagination (00-conventions) |

**Suggested** ranking (the frontend's Suggested chip): a blended score —
`rating × log(ratingCount) × recency boost × distance decay (when geo present)`.
Exact weights are a backend implementation detail; the contract is only the enum value.

## List/grid response

```json
{
  "items": [ /* DealCardResponse, incl. distanceKm + isOpenNow when geo given */ ],
  "nextCursor": "eyJ...",
  "hasMore": true,
  "total": 143,
  "facets": {
    "categories": [ { "slug": "massage", "name": "Massage", "count": 42 } ],
    "features":   [ { "value": "Couples", "count": 18 } ],
    "priceLevels":[ { "value": "$", "count": 51 } ]
  },
  "appliedFilters": { "q": "spa", "priceLevel": ["$$"], "radiusKm": 5 }
}
```

- `facets` are counts **within the current result set** — powers "Features (3)" style
  chip labels and lets the UI grey out empty options.
- `total` is approximate beyond 1000 (`"1000+"` display).

## Map view response (`view=map`)

Same filters; the shape changes to pins + clusters so the map stays light:

```json
{
  "pins": [
    {
      "dealId": "018f...",
      "slug": "serenity-spa-summer-glow",
      "title": "Summer Glow Package",
      "lat": 19.0596,
      "lng": 72.8295,
      "priceFrom": { "amount": 249900, "currency": "INR" },
      "ratingAvg": 4.8
    }
  ],
  "clusters": [
    { "lat": 19.1, "lng": 72.85, "count": 12, "bbox": [72.83, 19.08, 72.87, 19.12] }
  ],
  "total": 143
}
```

- Server clusters when > 50 pins in viewport (grid-based). Clicking a cluster → client
  re-queries with the cluster's `bbox`.
- Pin popup card fetches `GET /deals/:slug` (or a `?include=card` light variant) on demand.
- A deal redeemable at multiple locations inside the viewport emits one pin **per location**.

## Autocomplete

```
GET /search/suggest?q=swe&lat=&lng=
```

Public, aggressive cache. Returns top 8 mixed suggestions for the header/hero search box:

```json
{
  "suggestions": [
    { "type": "deal",     "label": "Swedish Bliss",   "slug": "urban-massage-swedish-bliss" },
    { "type": "category", "label": "Swedish Massage", "categorySlug": "massage", "subcategorySlug": "swedish" },
    { "type": "company",  "label": "Serenity Spa & Wellness", "slug": "serenity-spa-wellness" }
  ]
}
```

## Zod schemas

`DealListQuerySchema` (all params above, cross-field rules: `subcategory`⇒`category`,
`sort=distance`⇒`lat/lng`, `bbox` XOR `radiusKm`), `DealListResponseSchema`,
`MapPinsResponseSchema`, `SearchSuggestQuerySchema`, `SearchSuggestResponseSchema`,
`FacetSchema`.

## Open questions

- [ ] PostGIS vs `earthdistance` extension — PostGIS wins if map usage is heavy; heavier ops otherwise.
- [ ] Store recent searches per user (`GET /me/recent-searches`) for the search UX? Not in v1 unless product wants it.
- [ ] City-level browse pages (`/city/mumbai`) for SEO — needs a City entity; deferred.
