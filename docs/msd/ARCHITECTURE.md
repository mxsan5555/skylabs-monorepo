# msd architecture

How msd works in code. Shared mechanics (monorepo layout, shared packages, dynamic RBAC recipes)
are in `docs/ARCHITECTURE.md`; component usage and storefront conventions are in `CLAUDE.md`.

## 0. Structure

```
apps/msd/src/
  main.tsx, entry-server.tsx   bootstrap (hydrates prerendered pages), server render for prerender
  api/                          fetch client per resource (catalog.ts = public storefront API, rbac/* = console)
  auth/, catalog/, location/    role routing, catalog shell context, visitor location
  prerender-data/, hooks/       build-time loaders + hydration payload; usePagedList, useMediaQuery, useCustomEvent, useHydrated
  content.json                  all storefront copy
  types/                        domain models + JSX typings for sky-*, md-*, swiper elements
  app/
    routes.tsx, layouts/        route table; public layout and admin console layout
    admin/                      sidebar, breadcrumb, admin page shell
    components/                 shell (site-header, site-footer, mobile-tab-bar) and storefront building blocks
    pages/                      one folder per page; console pages under pages/account/
apps/msd/prerender/             build-time prerender, crawler files
apps/msd-api/src/               routes, services, middleware, schemas, lib, openapi (see docs/ARCHITECTURE.md §2.2)
```

## 1. Admin and staff

- **Authorization (built):** `authenticate` verifies the JWT; `requirePermission(menuKey, action)`
  resolves `UserRole → RolePermission → Permission` with a short cache and is the only gate
  (boolean check only — it does not itself read scope). Super Admin resolves to every key
  derived from the live menu tree.
- **Scope resolution (built, 2026-10-23, P1-04/P1-09/P8-08):**
  `permission-resolver.service.ts#resolveGrantedPermissions` returns `{ keys, scopes }` —
  `scopes` is `Record<permissionKey, 'ALL'|'OWN'>`, highest-scope-wins across every role the
  caller holds (`resolveGrantedPermissionKeys` is a thin wrapper over this for callers that only
  need the boolean keys). `GET /rbac/bootstrap` returns this as `scopes`; `shared-permissions`
  exposes `scopeFor(scopes, menuKey, action)` for the frontend. **Scope is only a real security
  boundary where a route actually reads it** — `role.service.ts#SCOPE_ENFORCED_PERMISSION_KEYS`
  is the single allowlist of keys with real enforcement code, and `setRolePermissions` rejects
  `scope: 'OWN'` for anything outside it (422) so the Role Permission Matrix can never silently
  promise a restriction that isn't real. Today that allowlist holds exactly one key —
  `rbac.audit-logs:view` (`GET /rbac/audit-logs` filters to `actorUserId` when the caller's scope
  is `OWN`; Super Admin keeps `ALL` via its existing blanket bypass).
- **Permission-change propagation to already-signed-in sessions (built, 2026-10-26):** the
  resolver's cache is keyed by sorted role-key set, cleared by `invalidatePermissionCache()` on
  every mutation that can change what a role-key combination resolves to — role delete, role
  status change, and `PUT /rbac/roles/:id/permissions` (the Role Permission Matrix save; this one
  was missing until 2026-10-26 — found by tracing Matrix save → resolver cache → bootstrap end to
  end, see TASKS.md P2-05). On the frontend, `AuthProvider`'s existing proactive access-token
  refresh (fires ~60s before each 15-minute token expires) now also calls
  `loadBootstrap(token, { silent: true })` on every renewal, so an already-open tab's sidebar and
  every `can()` check pick up a saved Matrix change within one token lifetime instead of staying
  frozen at last-sign-in state for the rest of the session. `silent` skips the `loading` state
  flip so this background refresh never triggers `RequireAuth`'s full-page loading placeholder
  (which replaces `children` for as long as `loading` is true — correct for the initial session
  restore, wrong for a refresh the user shouldn't notice). This is a bounded-delay mechanism
  (≤ ~15 minutes), not an instant push — the smallest change compatible with the existing
  short-TTL-cache + token-refresh architecture, not a new real-time channel.
- **Authorization (planned, tasks P2-01, P2-02, P1-10):** extend real `OWN`-scope enforcement
  (adding each resource's key to `SCOPE_ENFORCED_PERMISSION_KEYS` alongside its route change) via
  `lib/scope.ts` `scopedWhere(req, resource)` building every ownership filter (`vendorId` for
  branches, deals, therapists, products; `OrderItem.vendorId` for orders and payments;
  `ownerUserId` for members; `userId` for logs and profile) — most of Member's own-scope today is
  achieved by routing through the separate `vendor-portal.*` namespace instead, see F4. Roles are
  re-read from the DB (30 s cache) instead of trusted from the token.
- **Console screens:** `pages/account/{roles,users,audit-logs,settings,profile}`; sidebar
  `app/admin/sidebar.tsx` renders `bootstrap.menu` (group rows are one disclosure button).
- **Role Permission Matrix UI vs. real enforcement — two key spaces, reconciled 2026-10-27
  (P10-08):** `requirePermission()` and `filterMenuByPermissions` (and therefore the sidebar)
  read permission keys from `shared-menu`'s nested tree (`vendors.branches`, `vendors.deals`,
  `rbac.users`, `system-settings`, `rbac.audit-logs`, `settings`, `cms.*`, …) — the exact keys
  `permission-matrix.ts`/`seed.ts` already govern for the 5 non-SuperAdmin roles. The Role
  Permission Matrix *screen* used to be driven by a separate, flat 14-key catalog
  (`members`, `branches`, `deals`, ... `my_profile`) built only for `GET /permissions/catalog`/
  `PUT /roles/:id/permissions`, with only `members`/`orders`/`customers`/`reports` spelled
  identically in both — every other row (Branches, Deals, Therapists, Products, Content, Staff
  Users, System Settings, Logs, My Profile) edited a `RolePermission` row no route or the
  sidebar ever read (confirmed by grepping every `requirePermission(` call site). Fixed by
  rewiring `RBAC_RESOURCE_CATALOG` (`msd-api/src/modules/rbac/permission-catalog.ts`) onto the
  real tree: each resource now declares `menuKeys: string[]` (the real governing key(s), not a
  UI-only label) instead of a single synthetic `key`; `getPermissionCatalog()` upserts/returns a
  `Permission` row per real `(menuKey, action)` pair and reports `permissionIds: string[]` per
  UI action (was a singular nullable `permissionId`). `content` is the one resource with several
  real keys — it aggregates the ~10 real `cms.*` leaves `permission-matrix.ts`'s `CONTENT_GROUP`
  already grants together (minus `create`/`delete` for the 3 singleton CMS pages, via
  `unsupportedFor`); the frontend's `allGranted()` only shows a resource's checkbox as checked
  once every one of its real keys is granted, and toggling it calls `onPermissionToggle` once
  per real id so the whole group always moves atomically — never a partial grant. `setRolePermissions`
  needed no change (it already validated a flat `{permissionId, scope}[]`). This is an
  API-contract change to `GET /permissions/catalog`/`PUT /roles/:id/permissions`'s response/
  request shape — done with explicit sign-off per CLAUDE.md's stop-before-API-change rule. See
  TASKS.md P10-08 and `role.service.test.ts` for the regression coverage.
- **Notifications:** `Notification` rows per recipient user; `notifyPermissionHolders()` targets
  everyone whose roles grant a given permission (never a role name).

## 2. Members

### 2.1 Status machine (`services/member-status-machine.ts`, `member-status.service.ts`)

Any transition not listed returns 409.

| From | To | Who | Side effects |
|---|---|---|---|
| ACTIVE | INACTIVE | `members:status_change` | hidden from storefront, writes blocked, login and reads allowed |
| ACTIVE, INACTIVE | SUSPENDED | `members:status_change` | refresh sessions revoked, login refused, hidden, email and SMS |
| INACTIVE, SUSPENDED | ACTIVE | `members:status_change` | restored, "active again" email and SMS, review flag cleared |
| SUSPENDED | ARCHIVED | system, on delete when orders exist | hidden everywhere, rows kept |
| SUSPENDED | hard delete | `members:delete` | only with zero `OrderItem` rows; from ACTIVE or INACTIVE returns 409 `MEMBER_NOT_SUSPENDED` |

The status update, history row, audit row and session revocation commit in one transaction;
notices go out after commit and never undo the change.

### 2.2 Enforcement

- `authenticate` loads the member status for member-role users: SUSPENDED or ARCHIVED → 403
  `MEMBER_SUSPENDED` (with reason and steps); INACTIVE sets `req.readOnly`.
- `blockWhenReadOnly` rejects every non-GET for an inactive member with 403
  `MEMBER_INACTIVE_READ_ONLY`, except logout and token refresh.
- OTP request and login for a suspended member return the same 403 and send no OTP.
- Storefront visibility: `publicVisibleWhere()` in `services/catalog-visibility.ts` (member
  ACTIVE, branch active, deal ACTIVE and in its date window; therapist and product active) is used
  by every `/catalog` query. The deal approval check is still read until P3-15.
- **Console-side action gating (`pages/account/members/member-detail-page.tsx`):** each catalog
  tab computes its own `canEdit`/`canDelete` from that resource's own matrix key —
  `vendors.branches`, `vendors.deals`, `vendors.therapists`, `vendors.products` — never the
  Profile/Documents tabs' `members:edit`/`members:delete`. Bug fixed 2026-10-26 (P4-19): the page
  used to pass the blanket `members:edit`/`members:delete` booleans to every tab, which only
  produced the right buttons by coincidence (the 5 fixed roles always grant the `members:*` and
  matching `vendors.*` actions together) — a future per-resource grant edit via the Role
  Permission Matrix would otherwise have no visible effect. The backend routes were never
  affected; `vendors.branches.routes.ts` et al. already gate on the correct per-resource key.

### 2.3 Notices and reminders

- `services/member-notice.service.ts`: `sendMemberNotice()` (welcome, suspended, reactivated) and
  `sendOnChannel()` (one channel, one inline retry, never throws). Texts in `lib/member-messages.ts`
  (support contact from `SUPPORT_EMAIL` / `SUPPORT_PHONE`).
- **Reminder job** (`services/member-reminder.service.ts`, timeline in
  `services/member-reminder-policy.ts`): `POST /api/v1/internal/jobs/document-reminders` guarded by
  `x-cron-secret` (timing-safe, 503 while `CRON_SECRET` is unset) runs one pass:
  1. Pages through Active and Inactive members whose documents are due (batches of 200).
  2. Documents complete: send nothing; clear `reviewFlaggedAt` if set.
  3. Otherwise retry a reminder that still has an undelivered channel (up to 5 attempts), or create
     the next scheduled reminder when `nextWarning()` allows it.
  4. A reminder is sent only after a **claim** (conditional update on `attempts`); a parallel run
     that creates the same reminder hits the unique `(memberId, sequence)` index and skips it, so a
     double run never sends twice.
  5. Sets `reviewFlaggedAt` one week after the final reminder went out and notifies
     `members:status_change` holders. Status never changes.
  6. One member's failure never stops the pass; the response is `{ checked, sent, failed, flagged, cleared }`.
- **Remind now:** `sendManualReminder()` (24-hour cooldown → 429; not remindable, complete, or no
  contact → 409), audit `member.reminder.sent`. The button is in `member-header-actions.tsx`.
- The automatic flag has no audit row (`AuditLog.actorUserId` must be a real user); it shows in
  Activity and the bell.

### 2.4 Screens

`pages/account/members/`: `members.tsx` + `member-list.tsx` (All members, grouped Filter menu,
tonal status badges), `member-new-page.tsx` (short form), `member-detail-page.tsx` (header actions,
tabs), `member-documents-tab.tsx`, `member-activity-tab.tsx`, branch, deal, therapist and product
list and form pages. Status labels, tones and the review flag copy live once in `member-status.ts`.

### 2.5 Catalog flow gaps (C-items)

| # | Gap | Fix | Status |
|---|---|---|---|
| C-01 | Member can delete own product | Remove `DELETE /vendors/me/products/:id` | open |
| C-02 | Deal approval gate | Create deals `approvalStatus=APPROVED`, member publishes with status ACTIVE, stop `DEAL_PENDING_APPROVAL`, remove approval from visibility, home hero and promotions; migrate PENDING rows | done 2026-10-27 (P3-15); column dropped in the contract step |
| C-03 | Branch `state` optional free text | `state` and `city` required on create, from one India location list moved from `apps/msd/src/data/india-locations.ts` to `packages/shared-utils` (`india-locations`) so the form and the API allowlist can't drift | done 2026-10-27 (DL-02: report script, columns `NOT NULL`) |
| C-04 | `slug` required from the client | Optional; generate `{title}-{member}-{city}` with a numeric suffix on conflict; fixed once Active, old slugs kept (PLANNING §2.7) | done 2026-10-27 (DL-03) |
| C-05 | Discount accepted from the client | Compute from the cheapest active package; prices, discount and duration refused as input | done 2026-10-27 (DL-03) |
| C-06 | `vendors:custom` and `vendors.*` keys | `<resource>:<action>` plus scope | open (P1-05, P4) |
| C-07 | Product category grant check | Only active `PRODUCT` type and parent check | done 2026-10-16 (P4-14) |
| C-08 | No branch delete | `DELETE /branches/:id`, Super Admin only, 409 on FK conflict | open |
| C-09 | Flat catalog routes | `/branches`, `/deals`, `/therapists`, `/products` over the existing services; nested routes become aliases | open |
| C-11 | Member self-registration and `/me/submit` | Removed; members are created Active with `documentsDueAt` | done (P3-21) |
| C-12 | Category grants for deals and therapists | Stop the vendor and branch grant checks, retire `PUT .../category-access` | done 2026-10-27 (P4-15): no grant checks anywhere, the seven `category-access` routes return 404, branch and therapist forms have no grant step; grant tables dropped in the contract step |
| C-13 | Member edits while inactive | `blockWhenReadOnly` | done (P2-04) |
| C-14 | Branch phone format | Reuse the member phone rule | open |
| C-15 | Rich text storage | Sanitize HTML on write (`lib/sanitize-html.ts` allowlist), plain-text copy for search, meta and JSON-LD, length measured on plain text | open |
| C-16 | Member customers view | `GET /customers` own scope | open (P4-16) |
| C-17 | Two deal editors (`DealFormPage` without media, `DealDialog` in `vendor-branches.tsx` without therapists) | One `DealFormPage` for staff and member self-service, sections in PLANNING §2.7 order; `DealDialog` deleted | done 2026-10-27 (DL-10) |
| C-18 | Seed gives Admin, Sales, Marketing, Support no `vendors.deals` grants; Deals tab gated by `members:edit` | Seed per PLANNING §2.7 matrix; console checks `vendors.deals:<action>` (staff) and `members:custom` (member) | done 2026-10-27 (DL-03) |
| C-19 | Deal detail page reads `deal.discountPercent` before the selected package, hours from a second vendor call | Price and discount from the selected package; one detail response (API §4) | done 2026-10-27 (DL-12) |

Inline therapist creation inside a deal request is not planned: the deal form's "Add a new
therapist" calls the branch's therapist create route (the server sets branch and member), then
ticks the new id in `therapistIds`. Packages on the edit screen use their own routes (API §2.2);
on the create screen they travel with `DealCreate`.

## 3. Customers and orders

- Orders: `routes/orders.routes.ts`. Staff list and detail use `requireOrdersOrVendorSelf()`
  (staff with `orders:view`, or a member seeing their own items); customer routes are
  `/orders/me*`; checkout and pay-batch create orders from the cart.
- Payments: Razorpay (test mode) with a webhook that needs the raw body (`express.json` keeps
  `req.rawBody`), plus COD.
- Planned (P7): cancel with reason, refund requests and decisions, idempotency keys, webhook event
  replay table.

## 4. Storefront

- **Building blocks** (`app/components/`): `PageSection`, `SectionHead`, `CardRail`, `CardGrid`,
  `ChipNav`, `ClampText`, `ListingToolbar`, `ChoiceMenu`, `ViewSwitch`, `LoadMore`,
  `SidebarLayout`, `FilterPanel`, `CheckboxFacet`, `PriceRangeField`, `CityPickerDialog`, `DealMap`.
  Usage table and colour rules: `CLAUDE.md` "msd storefront".
- **Cards and detail pages:** `offer-card/` (deals and products, `popularTag`), `therapist-card/`
  (`TherapistCard`, `lowestPackagePrice`, `formatDistance`), `product-card-gallery.tsx` (the card
  image slider; Swiper options set as properties before `initialize()`, `nested` inside rails),
  `detail-page/` (`DetailGallery`, `DetailPrice`, `DetailPurchase`, `BranchPanels`,
  `DetailNotFound`, shared `detail-page.css`) and `duration-package-selector.tsx` (one picker for
  deal and therapist packages). Deal and therapist detail pages compose these; no page CSS.
- **Listing shell** (ST-41 to ST-43), `components/listing/`: `listing-params.ts`
  (`useListingParams` reads and writes `sort`, `view`, `min`, `max`, `radius`, `vendor`, `branch`,
  `tag`, `cat` with defensive parsing; `pickSort`, `sortOptionsFor` per kind, `countText`),
  `listing-body.tsx` (`ListingBody`: toolbar with Filters / List-Grid-Map / Sort, `SidebarLayout`
  + `FilterPanel`, `CardGrid` or `DealMap`, `LoadMore`, city picker), `listing-cards.tsx`
  (`listingCards`, `listingNoun`, `listingCopy` and `listingLoadError` per kind, `dealMapPoints`),
  `kindOfCategoryType` in `listing-params.ts`, and `use-listing-facets.ts` (`LISTING_FACETS`).
  City pages filter by city for deal categories only. Pages own their data, heading,
  chip row (`ChipNav` with the count as `end`) and SEO: `pages/category/` (subcategory pills),
  `pages/listing/listing-page.tsx` (one `ListingPage kind` for `/deals`, `/products`,
  `/therapists` and the city routes; chips are links to `/category/:slug`) and `pages/search/`
  (explore: kind chips with one-row count requests; "All" pages deals, products and therapists
  together, a full page of each, relevance only, location / distance / price filters with merged
  facets). `FilterPanel kind="deals|products|therapists|all"` picks its sections; Category and
  Tags are `CheckboxFacet`s. `ChipNav` items with `href` render as a `<nav>` of real links. Card
  tags come from the API's `tag` through `offerTagFor()` in `offer-card/` (label from
  `content.offerCard.tags`, theme role in code); an explicit `tag` prop still overrides it (home
  hero). The old `pages/products/` and `pages/therapists/` pages were removed. `Seo noindex="follow"`
  writes `noindex, follow` (explore).
- **Prerender:** `nx run msd:prerender` renders `/`, every `/category/:slug` and
  `/category/:slug/:city` (deal categories × partner cities), `/deals`, `/deals/:city`,
  `/products`, `/therapists` and `/therapists/:city` (partner cities with results;
  `loadListingData` + `listingDataKey`, seeding `ListingPage`'s default view) with `react-dom/server`, embeds the
  page data as `#__MSD_DATA__`, and writes `sitemap.xml`, `robots.txt`, `llms.txt` (needs
  `VITE_SITE_URL`). `main.tsx` hydrates when `#root[data-prerendered]` exists. Vercel rewrites
  every non-API path to `/spa.html` (the untouched client shell). If the API is unreachable at
  build time, preview and local builds skip prerendering and ship the SPA; a Vercel production
  build fails instead, unless `PRERENDER_ALLOW_EMPTY=1`.
- **Location:** `LocationProvider` / `useVisitorLocation()` resolves saved → granted browser →
  `/api/geo` (Vercel IP) → none.
- **Building a public page:** compose shared-ui and the blocks above (no page CSS); copy in
  `content.json`; view state in query params with defensive parsing; `usePagedList` + `LoadMore`
  for lists; `useVisitorLocation()` for location; tests drive raw `md-*` elements; check at
  1440×900 and 390×844, light and dark.
- **Extending the catalog API:** add the query param to the Zod schema in
  `schemas/catalog.schema.ts` (invalid input → 422); extend `buildDealWhere` and the `orderBy` map
  in `services/catalog.service.ts` (keep `id` as the last tiebreak); distance work stays in the
  pure `services/deal-ranking.ts`; register static paths (`/deals/facets`) before `/deals/:id`;
  add the OpenAPI entry; widen `apps/msd/src/api/catalog.ts`; deploy the API before the frontend.
- **Card tags (API):** `services/offer-tag.ts` (pure) holds the D30 thresholds, `offerTag(item,
  hotIds, now)`, `hotIdsFrom(lines)` and `tagWhere` / `tagsWhere` (a Prisma `where` per tag with
  the higher-priority tags excluded, so filter, count and card always agree; `offer-tag.test.ts`
  checks the two against each other). `getHotIds(kind)` in `catalog.service.ts` groups paid
  `OrderItem` lines of the last 30 days by `dealId` / `productId`, cached in memory for 10 minutes
  (`clearHotCache()` for tests). Product facets: `services/product-facets.ts`.
- **Therapist listing (API):** Prisma narrows by category, city/state, member and branch;
  `services/therapist-ranking.ts` (pure, like `deal-ranking.ts`) adds the lowest package price
  and distance, then filters by price and radius, sorts and pages in memory. Before ST-40 the
  category page sorted therapists in the browser one page at a time, so page 2 broke the order.

## 5. Static content

Console pages `pages/account/cms/*` (blog with block editor, FAQs, legal pages, about, contact, how
it works, careers, social links) call the content routes; public pages read
`/catalog/{about-us,blog-posts,blog-categories,faqs,pages,how-it-works,careers,contact-us}`.
Rich text: planned sanitize step on write (C-15) and DOMPurify on render (P10-36); today the
storefront renders deal and product text as plain text.

## 6. CTA banners

`Promotion` + `PromotionImage` + `PromotionPlacement`; service `promotion.service.ts`; console
`pages/account/masters/promotions.tsx` (State picker, then the banner form with a live
`sky-cta-banner` preview and the shared `StateItemPicker` for deal and product destinations).
Storefront: `app/components/banner-slot/banner-slot.tsx` (`<BannerSlot slot="..." />`) reads
`GET /catalog/banners` for the visitor's state (`useVisitorLocation`) and renders `sky-cta-banner`
with `color` from `backgroundRole`, `cta-color` from `buttonRole` and the banner `image` (options
added to shared-ui `sky-feature-card`, which `sky-cta-banner` extends). Slots live in `home.tsx` (after deals, after products), the
category page, explore, deal detail and product detail.

## 7. Home slider

`HomeHeroSlide` (deal or product); service `home-hero.service.ts`; console
`pages/account/masters/home-hero.tsx`; public `GET /catalog/home-hero`.

- **State search** (`services/state-catalog.service.ts`, `searchStateItems`): shared by the home
  hero and CTA banner consoles. Deals match on `branch.state`; products on any active branch of
  their member in the state. Eligibility reuses `VISIBLE_DEAL_WHERE` / `VISIBLE_PRODUCT_WHERE`.
- **Console (D28):** `pages/account/masters/home-hero.tsx` is the overview table (`GET
  /home-hero/overview`, New state slider menu); `home-hero-builder.tsx` at
  `/account/masters/home-hero/:state` (`global` = Global / Default) is the builder: ordered slide
  cards (drag or move buttons, saved with `PUT /home-hero/slides/order`; on/off switch; remove with
  Undo in the snackbar) beside `StateItemPicker` (`state-item-picker.tsx`: browses the state at once,
  All / Deals / Products, search, "Only visible to customers", Show more, Add then Added). Panes sit
  side by side from 1024px, tabs below. The CTA banner form uses the same picker.
- **Publish rule:** a state's slider is served once it has 5 eligible slides
  (`MIN_ELIGIBLE_SLIDES`), else the Global/Default slider, else the single-deal spotlight fallback.
- **Storefront** (`pages/home/home-hero.tsx`): h1 and search left; right side a Swiper carousel of
  `HeroItemCard` (deal or product) for the visitor's state.

### 7.1 Home tag sections (built 2026-10-28, PLANNING.md §7.1)

`HomeTagSection` (state x tag, `isEnabled`) + `HomeTagSectionItem` (ordered deals, manually picked
by the admin — never computed); service `home-tag-section.service.ts`; console
`pages/account/masters/home-tag-sections{,-state,-builder}.tsx`; public
`GET /catalog/home-tag-sections`.

- **Three admin screens**, deliberately one level deeper than the hero's two: overview (states +
  Global, `GET /home-tag-sections/overview`) → state page (always all 4 fixed tag rows — New,
  Deal, Hot Deal, Expire soon — each an Enabled switch upserting `PUT /home-tag-sections/sections`
  on toggle) → one tag's builder (`home-tag-sections-builder.tsx`, the Home Hero builder's exact
  ordered-list-plus-`StateItemPicker` layout and CSS, `dealsOnly` so the picker hides the
  All/Deals/Products filter and shows each candidate's status/discount/`endDate` instead — the tag
  is the admin's own judgement call, the picker never computes it). Opening a tag that was never
  enabled lazily creates its (disabled) `HomeTagSection` row so deals can be curated before
  switching it on.
- **Eligibility** (`ineligibleReason`) mirrors the hero's deal checks exactly (member active,
  branch active, deal `ACTIVE`, `approvalStatus APPROVED`), plus one Expire-soon-only rule: the
  deal needs a future `endDate` — no end date at all is ineligible there too (2026-10-28 decision,
  no arbitrary day-window). `MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION = 1`, not the hero's 5 — each tag
  rail is useful with a single deal, and the admin's manual curation is already the quality gate.
- **Public resolution is per-tag, not per-state** (the hero's one all-or-nothing swap does not
  apply here): each of the 4 tags is decided on its own — the visitor's state's own row for that
  tag if one is configured at all (enabled or not, eligible or not — a configured state row never
  falls back to Global for that tag); otherwise Global/Default's row for the same tag. A tag with
  nothing eligible anywhere is simply absent.
- **Storefront** (`pages/home/home-tag-sections.tsx`, placed right after Deals Near You): up to 4
  independent `PageSection` + `CardRail` rails of `OfferCard`s (no hero-style carousel, every item
  is a deal), in a fixed order — New, Hot Deal, Deal, Expire soon — deliberately different from the
  admin screen's row order (New, Deal, Hot Deal, Expire soon).
- **Shared, additive-only changes**: `state-catalog.service.ts`'s `StateItem`/`searchStateItems`
  gained optional `status`/`discountPercent`/`endDate` on deal results (Home Hero and Promotions
  ignore the extra fields, unchanged); `state-item-picker.tsx` gained the `dealsOnly` prop (unset
  for Home Hero/Promotions, so their rendering is byte-for-byte unchanged).

## 8. Masters

Categories (`Category`, `CategoryImage`, types `SERVICE | PRODUCT | THERAPY`), popular tags and
popular treatments; console `pages/account/masters/{categories,popular-tags,popular-treatments}.tsx`.
Some masters routes check only `view`/`edit` by design (see `EXTRA_ACTIONS_BY_MENU_KEY` in
`prisma/seed.ts`).

## 9. Payments, payouts and reports

Reports today: `/reports/{summary,vendor-wise,branch-wise,month-wise,service-vs-product,top-vendors,top-products,top-services,payment-method}`
(`reports:view`). Planned: the six business reports with own scope, CSV export with formula
injection protection, `Payout` and `RefundRequest` tables, release with idempotency and step-up OTP
(P7).

## 10. Analytics

No code yet (no GA4, GTM or `dataLayer` in `apps/msd`).

## 11. Social media

`SocialMediaLink`; console `pages/account/cms/social-media-list.tsx`; public
`GET /catalog/social-links` (footer, JSON-LD `sameAs`).

## 12. Platform, security and release

### 12.1 Verified baseline (2026-10-14, status updated 2026-10-17)

| # | Fact | Status |
|---|---|---|
| F1 | `PermissionScope {ALL, OWN}` and `RolePermission.scope` exist | done |
| F2 | Nothing enforces scope (`requirePermission`, resolver, bootstrap have no scope code) | partly (2026-10-23, P1-04/P1-09/P8-08): resolver returns `{key, scope}` (highest-scope-wins), bootstrap returns `scopes`, and `role.service.ts#setRolePermissions` rejects `OWN` for any key without real enforcement code (422) rather than accepting it silently inert. Exactly one key is actually enforced so far — `rbac.audit-logs:view` (`GET /rbac/audit-logs` filters to `actorUserId` when scope is `OWN`). Found 2026-10-26: that enforcement had no effect in practice — nobody but Super Admin had ever been granted `rbac.audit-logs:view` at all, so Admin/Marketing/Sales/Support couldn't reach the Logs screen regardless of scope. Fixed: `seed.ts#LOGS_OWN_SCOPE_ROLES` + `grantOwnScope` now grant it to all four with `scope: 'OWN'` (needs a reseed, see DATABASE.md §1). `requirePermission` itself still does a plain boolean check; per-route `scopedWhere` for the rest of the matrix stays open (P2-01, P2-02, P1-10) |
| F3 | Seed had 6 roles, no `support`, `'vendor'` hardcoded | done: 7 roles, `lib/role-keys.ts`; `'customer'` literals remain (P1-03). Found 2026-10-23: a stray duplicate entry in seed.ts's `ROLES` array was recreating an empty `Role{key:'vendor'}` on every seed run while `vendor.service.ts#createMember` assigns new Members to `Role{key:'member'}` — meaning every real `member`-keyed grant (`vendor-portal.*`, `vendors:custom`, dashboard widget) was being applied to the wrong, unused role, so a newly created Member had zero permissions. Fixed: duplicate entry removed, `permission-matrix.ts`/`grantStarterPermissions` retargeted to `member`, `user.service.ts`'s staff-exclusion filter and the frontend's `create-user-dialog.tsx#eligibleStaffRoles` / `auth/role-routing.ts#isVendorUser` now check `MEMBER_ROLE_KEYS` (`['member','vendor']`) instead of a bare `'vendor'` literal, and migration `20261023100000_consolidate_member_role` merges any already-created stray `vendor` row's links back onto `member` |
| F4 | Menu has 36 keys incl. `vendors.*` and `vendor-portal.*` | partly: `vendors` → `members` only (P1-05) |
| F6 | Member can delete own product | open (C-01) |
| F7 | Member deals need Super Admin approval | open (C-02, P3-15) |
| F9 | `UserStatus` already has `blocked` | no enum change needed for customer block |
| F10 | Status modelled three ways (`isActive` on branch, therapist, product; `DealStatus`; `MemberStatus`) | kept as is |
| F11 | Hard delete is guarded by FKs (409 "Deactivate it instead"); `deletedAt` only on `User` | reused instead of soft-delete columns |
| F12 | No `helmet`, `trust proxy`, body limit or global rate limiter; `/docs` always mounted | open (P2-07, P2-08, P9-07) |
| F13 | OpenAPI coverage gap | 347 routes, 255 documented, 92 undocumented on 2026-10-17 (`API.md` §0) |
| F14 | `SupportRequest` (customer contact message) is unrelated to the `support` role | never reuse it for refunds |
| F15 | Prisma generate, OpenAPI build and unit tests need no Postgres | true |
| F16 | Admin's matrix cell drifted from PLANNING.md §1.2 on four points; Admin's and Marketing's Masters grants drifted past their `VCE`/`V` cells | fixed 2026-10-26 (`permission-matrix.ts`, `seed.ts` — see DATABASE.md §1 for the reseed step); open findings reported, not fixed: `vendors.deals:approve`/`reject` are vestigial grants from the removed deal-approval gate (D6), tracked separately as P3-15; the refund workflow (`disputes.routes.ts` + `refunds.routes.ts`) doesn't implement PLANNING.md §3's "Support raises a refund request; Admin/Super Admin approves or rejects" two-actor flow at all — see TASKS.md's new row for the exact mismatch |

### 12.2 Hardening plan

`helmet`, `trust proxy` 1 (Railway), `express.json({ limit: '100kb' })` keeping the raw-body hook;
global rate limit plus limiters for upload, status change, payout, refund, export, download;
production boot fails on a short `JWT_SECRET`, `*` in CORS, or missing `R2_PRIVATE_BUCKET`,
`DOC_HASH_PEPPER`, `FIELD_ENCRYPTION_KEY`, `CRON_SECRET`; request logger with request id and PII
redaction; idempotency keys for money; transactional audit; private R2 bucket with 5-minute signed
downloads for documents; malware scan decision; gitleaks and `npm audit` in CI.

### 12.3 File storage (decided 2026-10-17)

Two Cloudflare R2 buckets per environment, one folder per owner. Layout in
`apps/msd-api/src/lib/storage-layout.ts` (`storageFolder`); file names are random UUIDs.

| Bucket | Access | Folder | Holds |
|---|---|---|---|
| `msd-media` | public (`VITE_MEDIA_BASE_URL`) | `members/<memberId>/profile/` | member logo, gallery, video |
| | | `members/<memberId>/deals/<dealId>/` | deal images and video |
| | | `members/<memberId>/therapists/<therapistId>/` | therapist images and video |
| | | `members/<memberId>/products/<productId>/` | product images and video |
| | | `customers/<customerId>/profile/` | customer avatar (reserved, D15) |
| | | `home-slider/<state-slug or global>/<slideId>/` | reserved: slides use deal images today |
| | | `cta-banners/<promotionId>/` | CTA banner (Promotion) images |
| | | `static-content/{blog,about-us,pages}/<id>/` | blog, About us and page images |
| | | `masters/categories/<categoryId>/` | category images |
| `msd-private` | private, no public URL | `members/<memberId>/documents/` | Aadhaar, PAN, GST files |

- **Private files** are never returned as keys. Document responses carry `fileUrl`, a signed GET
  link that expires after 5 minutes (`signedFileUrl`, `SIGNED_URL_TTL_SECONDS`). Without
  `R2_PRIVATE_BUCKET` a document upload fails with 503; it never falls back to the public bucket.
- **Bucket per key:** `bucketForKey` sends `members/<id>/documents/...` to the private bucket and
  everything else to the public one, for reads, replaces and member deletion.
- **Existing files** keep their old flat keys (`deals/<id>/...`, `vendors/<id>/...`,
  `vendor-documents/<id>/...`); the DB stores the full key, so they keep working. Old documents stay
  in the public bucket until the P5-04 script moves them; old media can move later with the same
  script (copy, update `storageKey`, delete).
- **Local development** uses its own two R2 buckets (`msd-media-dev`, `msd-private-dev`) with the
  same layout, not the local disk: the same code path runs everywhere, and the free tier (10 GB)
  covers it. Never point local development at the production buckets.
