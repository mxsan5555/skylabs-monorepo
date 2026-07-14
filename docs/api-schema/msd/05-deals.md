# 05 — Deals, Menus, Packages, Pricing Plans, Fine Print

The central listing entity. Design goals, taken from the reference sites:

- **Groupon**: one deal → multiple buy options ("options" = our **PricingPlans**), fine
  print, redemption instructions, expiry.
- **Urban Company**: service menu with line items and add-on packages.
- **Yelp**: business amenities/features, photos, ratings.

A deal belongs to one company, is redeemable at one or more of its locations, appears in
one or more category/subcategory pairs, and **always has at least one PricingPlan** —
the frontend's current single `price`/`duration` fields become the plan at index 0.

## Entities

### Deal

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `slug` | string | ✔ | | Unique, immutable after publish | `"serenity-spa-summer-glow"` |
| `companyId` | uuid | ✔ | | FK → Company (must be `verified`) | |
| `locationIds` | uuid[] | ✔ | | Redeemable branches (≥1, all owned by company) | |
| `title` | string | ✔ | | ≤120 chars | `"Summer Glow Package"` |
| `shortDescription` | string | ✔ | | Card/listing text, ≤200 chars | |
| `description` | text | ✔ | | Full detail-page description, ≤5000 | |
| `heroMediaId` | uuid | ✔ | | Main image | |
| `gallery` | MediaAsset[] | ✔ | | ≥1 incl. hero, ordered | |
| `badge` | string | | null | Card ribbon (auto or manual) | `"30% OFF"`, `"Hot"` |
| `features` | string[] | ✔ | `[]` | From the shared **feature vocabulary** (below) | `["Couples","Private Room"]` |
| `included` | string[] | ✔ | | "What's included" bullet list | |
| `notIncluded` | string[] | ✔ | `[]` | "Not included" bullet list — **new vs frontend** | |
| `howToUse` | string[] | ✔ | | Ordered redemption steps | |
| `finePrint` | text | ✔ | | Legal terms (Groupon-style) | `"Valid Mon–Fri only. 1 voucher per person…"` |
| `cancellationPolicyId` | uuid | ✔ | | FK → CancellationPolicy | |
| `validFrom` | timestamp | | publishAt | Deal visibility window | |
| `validUntil` | timestamp | | null | null = evergreen | |
| `redeemByDaysAfterPurchase` | int | | null | Voucher expiry after purchase (Groupon model) | `90` |
| `maxPerCustomer` | int | | null | Purchase cap per user | `2` |
| `totalInventory` | int | | null | null = unlimited; 0 remaining → `sold_out` | |
| `soldCount` | int | ✔ | 0 | Denormalised counter | |
| `isFeatured` | bool | ✔ | false | Curated by marketing (home "Featured Deals") | |
| `isHot` | bool | computed | | Trending: sales velocity threshold (home "Hot Right Now") | |
| `status` | enum | ✔ | `draft` | Lifecycle below | |
| `rejectionReason` | text | | null | | |
| `ratingAvg` | decimal(2,1) | ✔ | 0 | Computed from reviews | `4.8` |
| `ratingCount` | int | ✔ | 0 | | `214` |
| `priceLevel` | enum | computed | | `$ \| $$ \| $$$` derived from cheapest plan (thresholds in 06-search) | |
| `metaTitle` / `metaDescription` | string | | null | SEO overrides | |
| `publishedAt` | timestamp | | null | | |
| `createdAt` / `updatedAt` | timestamp | ✔ | | | |

### PricingPlan (1..n per deal) — the amount plans

Each plan is a purchasable variant, usually by duration (60/90/120 min) but general
enough for person-count or tier variants.

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `dealId` | uuid | ✔ | | | |
| `name` | string | ✔ | | Display label | `"90 min session"` |
| `description` | string | | null | One line under the label | `"Extended full-body + scalp"` |
| `durationMinutes` | int | | null | Service length; null for non-time plans | `90` |
| `personCount` | int | ✔ | 1 | 2 = couples plan | |
| `price` | Money | ✔ | | Selling price (paise + currency) | `{ "amount": 249900, "currency": "INR" }` |
| `originalPrice` | Money | | null | Strike-through price; must be > `price` | |
| `discountPct` | int | computed | | Derived — never stored/submitted | `29` |
| `inventory` | int | | null | Per-plan cap (overrides deal-level) | |
| `sortOrder` | int | ✔ | 0 | | |
| `isActive` | bool | ✔ | true | Retired plans keep order history | |

> Frontend migration: `Deal.price`, `originalPrice`, `discount`, `duration`,
> `durationUnit` in `types/index.ts` collapse into `pricingPlans[]`. Cards show the
> cheapest active plan ("From ₹999"); the detail page renders a plan selector.
> `CartItem` gains a required `pricingPlanId` (see 07-cart-checkout).

### MenuItem (0..n per deal) — service menu

What the treatment consists of, as displayable line items (Urban Company style).

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `dealId` | uuid | ✔ | | |
| `group` | string | | Optional section header | `"Massages"` |
| `name` | string | ✔ | | `"Swedish full-body massage"` |
| `description` | string | | | `"Medium pressure, aromatherapy oils"` |
| `durationMinutes` | int | | | `60` |
| `sortOrder` | int | ✔ | | |

### Package (0..n per deal) — bundled combos

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `dealId` | uuid | ✔ | | |
| `name` | string | ✔ | | `"Couples Retreat Combo"` |
| `description` | string | | | |
| `items` | PackageItem[] | ✔ | ≥2 entries `{ name, durationMinutes?, note? }` | |
| `pricingPlanId` | uuid | ✔ | The plan that prices this package | |
| `sortOrder` | int | ✔ | | |

### DealCategory (join: multi category/subcategory)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dealId` | uuid | ✔ | |
| `categoryId` | uuid | ✔ | |
| `subcategoryId` | uuid | | null = category-level only |
| `isPrimary` | bool | ✔ | Exactly one primary — used for breadcrumb + canonical URL |

### CancellationPolicy (shared lookup, admin-managed)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `name` | string | ✔ | | `"Flexible 24h"` |
| `description` | text | ✔ | Consumer-facing text | `"Cancel up to 24 hours before…"` |
| `freeCancelHoursBefore` | int | ✔ | Full refund window | `24` |
| `partialRefundPct` | int | ✔ | Refund % inside the window | `0` |

Enforced by the cancellation flow in 08-orders-payments.

## Feature vocabulary (shared)

Admin-managed flat list used by deal `features`, company/location `amenities`, and the
search Features filter — one source so filters always match data. Seed values (from the
current frontend `content.json`): `Couples`, `Group`, `Mobile Therapist`,
`Organic Products`, `Private Room`, `Pool Access`, `Outdoor`, `Steam Room`, `Sauna`.
Endpoint: `GET /features` (public), `POST/PATCH /admin/features`.

## Deal status lifecycle

```
draft → pending_review → live ⇄ paused
              ↓             ↓
           rejected      sold_out (auto, inventory 0) → live (restock)
                            ↓
                        expired (auto, validUntil passed)
                            ↓
                        archived (terminal, partner/admin)
```

- Consumers see only `live` and `sold_out` (sold_out renders non-purchasable).
- Edits to a `live` deal's **pricing, fine print, or included/notIncluded** re-enter
  `pending_review`; copy-only tweaks (typos) do not — flagged per-field in the update schema.

## Endpoints

### Consumer (public)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/deals` | Browse/list — full filter set lives in 06-search; this is the same handler |
| GET | `/deals/:slug` | Detail: everything public + plans, menu, packages, policy text, company summary, location summaries with computed `isOpenNow` and distance (if `lat/lng` supplied) |
| GET | `/deals/:slug/related` | Same primary category, excludes self, ranked by rating (`limit` ≤ 10) |

Detail response also includes `jsonLd` hints the frontend already renders
(LocalBusiness + Offer schema.org data).

### Partner (scoped to own companies)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/partner/deals?companyId=&status=` | My deals (offset paginated) |
| POST | `/partner/deals` | Create draft (full nested payload: plans, menu, packages, categories) |
| GET | `/partner/deals/:id` | Full detail any status |
| PATCH | `/partner/deals/:id` | Update (see re-review rules above) |
| POST | `/partner/deals/:id/submit` | `draft → pending_review` (validates ≥1 active plan, ≥1 image, ≥1 category, fine print present) |
| POST | `/partner/deals/:id/pause` / `/resume` | `live ⇄ paused` |
| POST | `/partner/deals/:id/archive` | Terminal |
| CRUD | `/partner/deals/:id/plans`, `/menu-items`, `/packages` | Nested resource management |

### Admin / marketing

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/deals?status=pending_review` | Review queue |
| POST | `/admin/deals/:id/review` | `{ action: "approve" \| "reject", reason? }` |
| PATCH | `/admin/deals/:id/flags` | `isFeatured`, badge override (marketing) |

## Card vs detail response shapes

Two response schemas so lists stay light:

- **`DealCardResponseSchema`** (search/list/wishlist/related): id, slug, title,
  shortDescription, hero image, badge, company `{ id, slug, displayName }`, primary
  category, cheapest plan `{ name, durationMinutes, price, originalPrice, discountPct }`,
  priceLevel, ratingAvg, ratingCount, distanceKm (when geo given), isOpenNow, features.
  Maps 1:1 onto the frontend's `DealCard`/`SkyProductCardReact` props.
- **`DealDetailResponseSchema`**: everything above + full description, gallery, all
  plans, menu, packages, included/notIncluded, howToUse, finePrint, cancellation policy,
  locations, validity, maxPerCustomer.

## Zod schemas

`DealCreateSchema`, `DealUpdateSchema`, `DealSubmitSchema`, `DealReviewActionSchema`,
`PricingPlanSchema`, `MenuItemSchema`, `PackageSchema`, `DealCategorySchema`,
`DealCardResponseSchema`, `DealDetailResponseSchema`, `CancellationPolicySchema`,
`MoneySchema`.

## Open questions

- [ ] `isHot` threshold definition (e.g. top decile of 7-day sales) — product to define.
- [ ] Should partners pick a CancellationPolicy from the shared list only, or also define custom ones (review burden)?
- [ ] Time-slot capacity per plan (bookings per hour) — here or kept entirely in 07 availability? Currently: 07.
- [ ] Multi-currency ever needed? Schema supports it; product says INR-only for launch.
