# msd testing

How to test msd and what "works" means per module. Rules being tested: `PLANNING.md`; endpoints:
`API.md`.

## 1. Run the tests

```bash
npx nx run msd:test                 # Vitest + Testing Library (jsdom)
npx nx run msd-api:test             # Vitest + Supertest, Prisma mocked, no Postgres
npx nx run shared-ui:test           # also run mera-driver tests when shared-ui changes
npx nx run-many -t lint test build --projects=msd,msd-api,shared-ui,shared-types,shared-permissions,shared-menu,shared-auth,shared-utils
npx vitest run <path> --config apps/msd/vite.config.mts     # one folder or file (msd)
npx vitest run <path> --config apps/msd-api/vite.config.ts  # one folder or file (msd-api)
```

Needs Postgres (local, never Neon production): `prisma migrate dev`, seed twice, the role × resource
× action × own/other matrix test, IDOR tests, migration row-count rehearsal.

## 2. Testing rules and gotchas

- `@lit/react` resolves to its SSR build under Vitest, so shared-ui React wrappers (`Menu`,
  `Slider`, `TextButton`, ...) do not set element properties in tests. Components that tests must
  drive render raw `createElement('md-...')` elements; assert behaviour, attributes, URLs and API
  calls, not shadow DOM.
- M3 buttons keep their native `<button>` in shadow DOM; find them by tag and text. A button with
  an icon also contains the icon ligature text, so match on "contains", not equality.
- Prerendered pages must hydrate cleanly: never pass `prop={undefined}` to a custom element; gate
  client-only state behind effects or `useHydrated`. `src/hydration.test.tsx` guards this.
- `sky-*` options whose LIT attribute is kebab-case go in JSX in that form (`price-first`,
  `image-alt`, also as `{...spread}` keys): server rendering writes `priceFirst` as `pricefirst` and
  hydration never sets the property. `src/sky-element-props.test.ts` fails on the camelCase form and
  on unknown attributes.
- ESLint rejects empty functions, including in tests: use `vi.fn()`.
- Tests that assert snackbar copy render `<SnackbarHost />` next to the page.
- API route tests: 401 without a token, 403 without the permission, 200 with it; 422 for invalid
  input; 404 for a foreign record under own scope.
- Prove a test catches the bug: break the code on purpose, watch the test fail, restore (done for
  the review flag on 2026-10-17).

## 3. Baseline and known failures

Known failures at 2026-10-18 (msd recounted 2026-10-27: `india-locations` moved to `shared-utils` and fixed); they must not grow. Anything else failing is a regression.

| Project | Failing | Where |
|---|---|---|
| msd | 19 tests in 11 files | `permission-matrix` 9, `contact-us` 2, and 1 each in `app.spec`, `widget-registry`, `deal-card`, `media-uploader`, `site-footer`, `wishlist`, `roles`, `settings`; `entry-server.test.tsx` fails to load (`sky-product-card-wc` fixed 2026-10-24). Regressions since commit e756759 (NewOfferCard), not yet fixed: `home` 4 (FAQ section no longer rendered, deal favourite), `category` 1 (product wishlist heart) |
| msd-api | 5 | `rbac.routes` 4, `orders.routes` image 1 (confirmed 2026-10-17; recounted 2026-10-28: 1,260 pass) |
| shared-menu | 5 | `index.test.ts` |

Type check: `npx nx run msd:typecheck` runs `tsconfig.app.json` and `tsconfig.prerender.json` (ST-14,
`prerender/` has 0 errors; both report the same known `src/` errors until P10-46).

Lint and type drift: 30 msd lint errors (`import/first` and `no-empty-function` in older tests), an ESLint ignore error in the shared packages, and
`apps/msd-api/src/routes/members.routes.test.ts` type errors in its setup code (P10-46). ESLint
ignores every file under `apps/msd-api/src` today. Flaky under load: `deals-list-page.test.tsx`
"toggle-status flips a non-ACTIVE deal" and `popular-tags.test.tsx` "mapping a category calls
mapPopularTag" (both pass alone); also `branches-list-page.test.tsx` and
`products-list-page.test.tsx` "delete asks for confirmation" (seen 2026-10-28, pass alone).

## 4. Acceptance per module

### 4.1 Admin and staff

- Matrix snapshot test: 7 roles × 14 resources × actions × scope equals `PLANNING.md` §1.2 (P1-08).
- Every route has `requirePermission` or is on a documented public allowlist (P4-12).
- Preview token refused on payout, delete, status, refund, staff and role-grant routes; a Super
  Admin cannot be impersonated.
- Super Admin protection (P1-11): without the Super Admin role, nobody edits, blocks, deletes or
  re-roles a Super Admin account, gives or removes the Super Admin role, or edits a role they hold
  (403); the last active Super Admin cannot lose the role, be blocked or be deleted (409).
- Permission revoked while a token is active: the API refuses on the next request after the cache
  clears.
- Fixed roles (R1, P2-15; `rbac.routes.test.ts` "Role create, clone and delete are locked",
  `roles.test.tsx` "roles are fixed"): with the permission, create, clone and delete return 403
  `ROLE_MANAGEMENT_LOCKED` and write nothing (no role row, no audit row); without it, 403
  `FORBIDDEN`; the Role Management page shows no New role, Clone or Delete for any viewer and says
  roles are fixed.
- Session hygiene (P10-38; `packages/shared-auth/src/react/auth-context.test.tsx`,
  `apps/msd/src/auth/role-routing.test.ts`): sign-out calls `POST /auth/logout` with the refresh
  token and clears the access token, refresh token, any preview and the bootstrap, even when the
  call fails; a "Login As" preview token is kept in `sessionStorage` only (localStorage keeps the
  real token), so a new tab or a closed tab never carries it; Return to Super Admin restores the
  real token (renewing it if it lapsed); an expired or refused preview falls back to the real
  session instead of signing out; a preview left in localStorage by an older build is cleared on
  load. The sign-in return path accepts only same-site paths: `//host`, `/\host`, tab or newline
  tricks, encoded `%2F%2F` / `%5C` and absolute URLs are refused.

### 4.2 Members

- Status machine: every allowed transition, every refused one returns 409; reason 10 to 500.
- Suspend: refresh sessions revoked; login and OTP request return 403 `MEMBER_SUSPENDED` with
  reason and steps, no OTP row; storefront hides everything; reactivation restores it and sends
  the notice.
- Inactive: any non-GET returns 403 `MEMBER_INACTIVE_READ_ONLY` (logout and refresh excepted);
  GET orders, customers and catalog return 200; banner on every console screen.
- Delete: only from Suspended and only for Super Admin; zero orders deletes, otherwise archives;
  every media file removed after commit: the member's documents, images and video plus the
  images and videos of its deals, products and therapists (P3-25); archive keeps every file.
- Documents: Support sees type and status only (no file key); masked numbers only; duplicate
  number 409; approve, reject with reason; deleting an Approved document 409. Uploader (P5-15;
  `member-document.service.test.ts`, `member-documents-tab.test.tsx`): an on-behalf upload names the
  staff member ("Uploaded by Priya for the member"), a missing account reads "staff", the member's
  own upload has no name, and the list makes one name lookup (none without on-behalf rows).
  Upload safety (P10-37; `member-documents-tab.test.tsx`, `shared-utils` `document-upload.test.ts`):
  the file input accepts PDF, JPEG and PNG only; a file over 5 MB is refused before upload with a
  message (the server limit is the same shared constant); a file name renders as text, never
  markup; "View <document> file" opens the signed URL in a new tab with `rel="noopener noreferrer"`
  and says so to screen readers; viewers without a file URL get no link.
- Counts (P10-49; `vendors.routes.test.ts` "customer and order counts", `member-detail-page.test.tsx`,
  `vendor-customers.test.tsx`, `orders.test.tsx`): the detail response counts distinct orders and
  distinct customers (two lines of one order count once; two orders of one customer, one
  customer); a member with no orders shows 0; "N customers" links to the Customers tab with
  `customers:view`, "N orders" to `/account/orders?vendorId=` with `orders:view`, plain text
  otherwise; the Customers tab is hidden without `customers:view` and its URL falls back to
  Profile; the tab uses the staff route with contact details; the Orders page sends `vendorId`,
  says "Showing one member's orders." and links back to every order.
- Activity (P3-24; `member-activity.service.test.ts`, `member-activity-tab.test.tsx`): status items
  carry from, to and the actor; document items the type, the event and `byStaff`; reminder items
  the sequence (null when manual), the delivered channels and the sender; the console writes
  "Status changed from Active to Suspended by Priya" and "Aadhaar card uploaded by staff for the
  member" from those fields and falls back to `summary` for unknown values or rows without fields.
- Reminders (all covered by unit tests): nothing before day 14; reminder 1 on the due date; 7-day
  spacing; after missed runs only the next reminder; final reminder carries the suspension
  sentence; documents asked for = missing + rejected; a second run sends nothing; a run that loses
  the claim sends nothing; a failed channel is retried alone, up to 5 attempts; flag on day 35 and
  not before; bell to `members:status_change` holders; flag never changes status; flag cleared on
  completion; one member's error does not stop the pass; batching by 200.
- Job route: 401 without or with a wrong `x-cron-secret`, 503 while `CRON_SECRET` is unset, 200
  summary; not in `/docs`.
- Remind now: 403 without `members:status_change`; 201 with per-channel result and audit row; 429
  within 24 hours; 409 for suspended, complete, or no contact; button hidden in those cases.
- Member customers (D19, P4-16; `vendor.service.test.ts` "listMyCustomers", `vendors.routes.test.ts`,
  `vendor-customers.test.tsx`): a member sees only customers with an order item from them; phone
  and email are `null` unless the customer has a `CONFIRMED` order with this member
  (`PENDING_PAYMENT`, `COMPLETED`, `CANCELLED` keep them hidden); city is the shipping city of the
  latest order that has one; order count counts distinct orders; the staff route always returns
  contact details; the console shows City and "Hidden until an order is open".
- Breadcrumbs (P10-47; `member-crumbs.test.ts`, `branch-form-page.test.tsx`): every member page starts
  with Members > All members (linked to the list), then the member ("Member" until the name loads);
  the sidebar title reads "All members".
- Members list: the Filter menu sends exactly one filter per option; status and documents columns
  use their tonal colours.
- Own scope (after P4): member A reading member B's branch, deal, therapist or product gets 404.
- Deals (PLANNING §2.7; `deal.service.test.ts`, `vendors.routes.test.ts` "Deal routes" and "Branch state and city", `cart.routes.test.ts`, `deal-form-page.test.tsx`, `deals-list-page.test.tsx`, `branch-form-page.test.tsx`):
  - Branch: missing `state` or `city`, or a pair not in the India list, returns 422; the form
    lists cities only after a state is picked.
  - Deal create: a branch of another member returns 404; with no branch the console shows "Add a
    branch first" and no form; `salePrice`, `discountPercent`, `notes`, `policy`, `status` or any
    unknown key returns 422; an empty slug is generated as `{title}-{member}-{city}` with `-2`
    on conflict; the member can't change the slug once the deal was Active (422), staff can,
    and the old slug still opens the deal.
  - Derived prices: after any package change the deal's from price, original and discount equal
    the cheapest active package; discount is rounded down.
  - Packages: create with 0 or 11 packages returns 422; a duplicate duration + people returns 409;
    deleting a package in a cart or order returns 409; deleting or deactivating the last active
    one returns 409 `LAST_PACKAGE`; reorder keeps the given order.
  - Therapists: a therapist from another branch returns 422; an inline-created therapist has the
    deal's branch and member whatever the client sends.
  - Status: Active without an image or an active package returns 422 `DEAL_NOT_READY` listing
    both; a member's new deal is Draft and goes Active with no approval; approve and reject
    routes return 404.
  - Roles: Sales and Admin create and edit any member's deal; Marketing and Support get 403 on
    write; only Super Admin deletes (Admin with `vendors.deals:delete` still 403); a member gets
    404 on another member's deal, package, image or FAQ.
  - Copy to branch: copy is Draft at the target branch with the same packages and FAQs, no
    media, no therapists; a target branch of another member returns 404.
- Categories open to every member (D10, P4-15; `vendors.routes.test.ts` "Category grant routes are
  retired", `category.service.test.ts`, `categories.routes.test.ts`, `branch-form-page.test.tsx`,
  `vendor-branches.test.tsx`, `therapist-form-page.test.tsx`):
  - Each of the seven `.../category-access` routes returns 404 and writes nothing, even with every
    permission.
  - `GET /vendors/categories` returns the same list for every member, ignores `vendorId`, and
    reads no grant; the branch list has no `categoryTypes`.
  - Deleting a category no deal or product uses succeeds even when old grant rows point at it.
  - Branch forms (page and dialog) have no category section and save the branch fields only.
  - The therapist form offers every branch of the member and every active top-level Therapy
    category.
- Branch location columns (DL-02, S22): `npm run msd-api:prisma:report-branch-locations` lists
  branches whose state or city isn't in the India list and exits 1 when any exist; the
  `20261027100000_branch_location_required` migration stops with a clear message when a branch
  has no state or city, and otherwise sets both `NOT NULL`.

### 4.3 Customers and orders

- A customer never reads or changes another customer's cart, wishlist or order by changing an id.
- A member never changes an order's status (403), for a deal or a product order (D27).
- A member with no business record gets empty Orders and Customers lists and 404 on any order;
  a `branchId` filter never widens a member past their own orders (P4-17).
- Payment state changes only through provider verification (Razorpay signature, webhook HMAC).
- Refunds (after P7): Support can raise, cannot approve; a double click refunds once; amount
  capped at paid minus refunded.

### 4.4 Storefront

- Offer card (`sky-product-card price-first`): default cards render unchanged; order is price row,
  title + description (two lines, ellipsis, space kept), member on the right, place + distance,
  actions; the old price is `<s>`; one star with the score, review count in the accessible name;
  `badge-color` / `badge-tone` draw a theme-role `sky-badge`; card click opens the detail page,
  Add to cart and the heart do not; signed-out cart or heart goes to sign in and back
  (`useRequireSignIn`); checked at 1440 and 390 px in grid and list view. Each `color` role keeps
  every text and the slotted buttons at AA (lowest 4.98:1, price on primary); no `color` = default look.
- `divided` (services): heading alone, then a `.place` block with the member and a one-line place
  (full text in `title`) and distance; no description (`sky-product-card.test.ts`, `offer-card.test.tsx`).
- `slider`: off by default (first image only); with 2+ images every slide renders, the buttons are
  named "Previous / Next image of {title}" and never change the page; one image keeps the plain
  image (`offer-card.test.tsx`). List cards keep one height whatever the photo ratio.
- Header search (ST-38, `site-header.test.tsx`, `use-search-suggestions.test.ts`,
  `city-picker.test.tsx`, `sky-action-field.test.ts`): focus opens the panel with "Near {city}" and
  Change, or the set-location prompt without a location; an empty query lists categories without
  any API call; a query shows categories, Deals, Therapists and Products rows (image, title,
  price, distance) with deals sent the city, state and coordinates; a location change re-runs the
  search; a city with no matching deal shows other cities' deals under the note and Show all
  without a count; Change shows the city filter, a pick calls `setCity` and returns to results; a refused
  browser location shows the error alert; Show all opens `/explore?q=` with the total; arrows,
  Enter and Escape work (Escape leaves the location step first) and the field's `activeOption` is the
  active row (ARIA element reflection on the inner combobox input);
  `sky-action-field clearable` clears and refocuses, default rendering unchanged. Checked at 1366
  and 390 px.
- Deal page (PLANNING §2.7; `deal-detail.test.tsx`, `catalog.routes.test.ts` "GET /api/v1/catalog/deals/:id"):
  - `/deal/{uuid}` and an old slug replace the URL with the current slug; the canonical carries
    it; a Draft or hidden deal shows the not-found page with `noindex`.
  - Sections render in the §2.7 order; one h1; highlights, eligibility and FAQs hidden when empty.
  - Picking a package changes the price, original price, % off and total; "For 2 people" and the
    inclusions show on its card.
  - Sold out replaces Add to cart; quantity stops at the per-customer limit; a cart call beyond
    it shows the 409 message; "{n} bought" absent under 10; "Ends in" only within 7 days.
  - Gallery: thumbnails on desktop, swipe and dots at 390 px, full-screen view opens on click with
    arrows, Escape (focus returns to the image) and "3 of 7"; every image has non-empty alt.
  - JSON-LD: `Service` + `AggregateOffer` (low and high price, availability from stock,
    `validThrough`), BreadcrumbList, FAQPage only with FAQs, no rating; passes the Rich Results
    test.
  - Search: a query with the member name returns that member's deals; title matches rank first.
  - Branch map (ST-26, `deal-detail.test.tsx`, `deal-map.test.tsx`, `marker-html.test.ts`): the
    Location panel shows a compact map labelled "Map of {branch}" with one marker (the branch
    name, not a link) when the branch has coordinates; no map without coordinates; the prerendered
    HTML has no map (it appears after hydration); the therapist page has no map.
  - Prerendered deal page hydrates without warnings; `sitemap.xml` lists Active deal slugs only.
- Therapist detail (`therapist-detail.test.tsx`): type as h1, person and experience, Details and
  the location aside, the rail leaves out the current therapist; the price follows the chosen
  package; signed-out Add to cart goes to sign in; a 404 shows the not-found state.
- Meta descriptions (ST-08; `seo/private-page-meta.test.ts`, `otp.test.tsx`): cart, sign in, OTP,
  orders, invoice and choose experience each have a 50 to 160 character description and stay
  noindex (sign in, OTP and choose experience also nofollow); the invoice not-found view is noindex.
- Branch address line (`utils/format.test.ts` "formatStreetAddress", `deal-detail.test.tsx`): the deal
  and member pages print the city once when the stored address already ends with it, and keep a
  state that only shares its last word ("Vasant Kunj, New Delhi, Delhi").
- Member page branch (ST-20, `vendor.test.tsx`): the page shows the branch nearest the visitor's
  location from `useVisitorLocation()`, the first branch without a location or mapped branches,
  and nothing for a member with no branches; `useCurrentLocation` no longer exists.
- Content width (ST-19, `content-width.test.ts`): `--sky-content-max` (1280px) and
  `--sky-content-gutter` (16px) are defined once on `:root`; no stylesheet repeats 1280px; header,
  footer and sections resolve to 1280px with 16px gutters and no sideways scroll at phone width.
- Footer (ST-07, `site-footer.test.tsx`): every footer link has a page; Help & Info lists Help Center
  (`/help-center`) and Wishlist, and no Gifting link until a gift-card feature exists.
- One `<main>` per page (ST-04, `one-main-landmark.test.ts`): only the layouts render `<main>`; no
  file under `app/pages` does, so the skip link keeps a single target.
- Popular searches in the prerender (ST-18, `hydration.test.tsx`): the server-rendered home page
  lists every "{Category} in {City}" footer link in catalog order; with a saved city the client
  moves that city first after hydration, with no hydration error.
- Facet selections and price bounds (ST-25, `checkbox-facet.test.tsx`, `price-range-field.test.tsx`):
  a checked option past the limit shows while collapsed after the first rows, and Show more
  hides when only checked options are left past the limit; checked options stay during a
  search that does not match them; a checked option the facet stops listing stays with its last
  label, a 0 count and an enabled checkbox that clears it; URL prices outside the bounds show
  clamped in both fields and the slider, with min never above max.
- Use my current location (ST-05, `city-picker.test.tsx`, `location-context.test.tsx`): located
  near a partner city closes the picker; a refused or failed lookup and a location more than
  75 km from every partner city each keep it open with their own alert (the button points at it
  with `aria-describedby`); a far location still keeps the coordinates for distance sorting.
- Theme colours only (ST-16, `theme-colours.test.ts`): no CSS file outside `assets/theme` holds a
  hex, `rgb()`/`hsl()` or `white`/`black` value (no light fallback inside `var()` either), and no
  TypeScript file holds a hex colour string, so the dark and contrast themes reach every screen.
- Sign-in landing and account links (ST-06, `role-routing.test.ts`, `shell-labels.test.tsx`):
  staff (super admin, admin, sales, marketing, support) and members land on `/account/dashboard`;
  a customer who is also a member lands on `/choose-experience`; a customer on `/`. The account
  link goes to `/my-dashboard` for customers (with or without the member role) and to
  `/account/dashboard` for members and staff; signed out it goes to `/sign-in`.
- One `<h1>` per page; prerendered `/` contains the hero `<h1>`, category links and JSON-LD; no
  hydration warnings; `sitemap.xml`, `robots.txt`, `llms.txt` written when `VITE_SITE_URL` is set.
- Category page (`category.test.tsx`): pills set `?sub=`; sort and filters send the right API
  params; the count shows `meta.total` at the end of the chip row; page 2 requested on scroll;
  map hidden for products and therapists; a prerendered 404 renders not found on the first
  render; not-found keeps one h1; filter counts reload when the city resolves; a therapy category
  under a city URL does not filter by city; empty copy names the kind.
- Card tags (ST-40, `offer-tag.test.ts`, `catalog.routes.test.ts`): a deal ending in 7 days or
  less is Expire soon even when it is also hot, new or 30% off; ended deals get no Expire soon;
  Hot needs the top 10% of paid lines in 30 days and at least 5 (4 lines → not hot; pending and
  cancelled orders ignored); New is created within 14 days; Deal is 30% off or more (29% → none);
  products never get Expire soon; `tags=hot,new` returns only items whose shown tag is one of
  them; tag facet counts equal the filtered list totals; `tags=foo` → 422.
- Catalog API for listings (ST-40, `catalog.routes.test.ts`): no new params → same items and
  order as before plus `tag`; `products?categoryIds=` narrows; products facets return category,
  tag and price counts, each ignoring its own selection; therapists `sort=price_asc` orders by
  the lowest active package across pages (page 2 continues page 1); `distance` without
  coordinates behaves like `relevance`; `radiusKm`, `city`, `vendorIds`, `branchIds`,
  `minPrice` / `maxPrice` narrow and `meta.total` matches; therapist facets match the list.
- Listing shell (ST-41, `filter-panel.test.tsx`, `chip-nav.test.tsx`, `category.test.tsx`): deals show Your location,
  Distance, Price, Tags, Business, Branches; products show Category (on `/products`), Price and
  Tags with no location or distance; therapists show Your location, Distance, Price, Business,
  Branches; Clear all empties every filter param; a tag checkbox writes `?tag=` and the card
  image shows the API tag with its theme role; no Reviews section.
- Listing pages (ST-42, `listing-page.test.tsx`, `prerender/routes.test.ts`): `/deals`, `/deals/:city`, `/products`,
  `/therapists` and `/therapists/:city` render one h1, breadcrumb, category chips as links to
  `/category/:slug`, the count on the chip row and 12 cards then page 2 on scroll; unknown city
  → not found and `noindex`; prerendered HTML holds the cards, ItemList and BreadcrumbList
  JSON-LD and hydrates without warnings; `sitemap.xml` lists the new routes and only cities
  with results. Checked at 1366 and 390 px, light and dark, no horizontal scroll at 320 px.
- Explore (ST-43, `search.test.tsx`): kind chips All, Deals, Products, Therapists with counts set
  `?kind=`; the filter panel follows the kind; list and grid render offer and therapist cards;
  signed-out Add to cart goes to sign in with the query kept; one (visually hidden) h1;
  `noindex, follow` and canonical `/explore`; `?category=` narrows to that category's kind.
- axe (WCAG 2.2 AA) clean on `/` in light, dark and high-contrast; no horizontal scroll at 320,
  390, 768 and 1280 px; full keyboard path (skip link, header, panels, tab bar, footer); Lighthouse
  SEO and Accessibility 100 and LCP under 2.5 s on mobile for `/`.
- Home slider console (D28): the overview lists Global first with each slider's status and progress;
  a row opens its builder; New state slider offers only states without one; the builder lists the
  state's visible items without typing, Add turns into Added, reorder saves the whole order and
  reverts on failure, remove offers Undo, a hidden item says why.
- Home slider: nothing can be added before a state is chosen; the search lists only that state's
  deals and products (a product through any active branch of its member); an item outside the
  state is 422 and a duplicate 409; a state with 5 eligible slides serves them, otherwise Global;
  the hero shows deal and product offer cards (`color="surface-high"`, `variant="plain"`), two at a time,
  with a "Service" / "Product" tag; each card links to its detail page and its actions group is
  named after the item; Add to cart and the heart work for a signed-in visitor and send others to
  sign in; every slide has the same height (checked at 1440 and 390 px); dots on the left and
  Previous / Next on the right move the slider (each dot a labelled button with a 24px target).
- CTA banners: a banner saves state, colour roles, image (one only) and slots; each slot shows the
  visitor's state's active in-date banners, else Global, else nothing; contrast holds for every
  colour role (axe); `<BannerSlot>` hydrates without warnings.
- JSON-LD is written only by `<JsonLd>`: a name containing `</script>` stays inside the script
  tag (ST-29, `seo/json-ld-usage.test.ts`).
- Suspended member's deals, branches and therapists absent; their deal URL returns the not-found
  page; prerender and sitemap exclude them (P10-33).
- Header account menu "Profile" and the tab bar "Account" use `useAccountLinks`: staff and
  members without the customer role go to `/account/dashboard`, customers to `/my-dashboard`. Staff who open a
  customer account URL directly (`/my-dashboard`, `/my-account/*`, `/orders`) land on
  `/account/dashboard`; customer + member users keep the customer layout.

### 4.5 Static content to 4.11 Social media

- Content routes enforce `content:<action>` (after P8-07); Admin sees no delete (P10-31).
- Rich text: an XSS payload is stripped on write and on render (P10-36).
- CTA banners, home slider, masters, social links: CRUD screens covered by their component tests;
  public catalog endpoints return active rows only.
- Static page header: `SectionHead media` renders in its right-column wrapper (`section-head.test`);
  hidden under 600px (checked in the browser at 390, 700 and 1366px, no horizontal scroll).
- Contact (`contact.test`): default address and email show when the CMS row is empty, the map
  embeds the address; CMS values and map embed win when set; an empty submit shows the required
  message. Become a member (`become-vendor.test`): h1 + partner team column; the notice is plain text
  before the form (no live region); an empty submit shows the business-name error.
- Analytics (after AN-02): no analytics cookie or GA request before consent; events carry ids only.

### 4.12 Platform

IDOR suite across all 14 resources, mass-assignment suite (extra keys → 422), upload abuse
(polyglot, wrong magic bytes, oversize, path traversal), PII scan of logs and responses for full
Aadhaar or PAN, concurrency (double refund, double payout, parallel status changes), migration and
rollback rehearsal (P11).

## 5. Security checklist (before each release)

- [ ] Public vs signed-in access matches `API.md` for every route.
- [ ] Ownership tested with another user's id (member, customer, order, branch): IDOR / BOLA.
- [ ] A normal user calling an admin endpoint directly gets 403.
- [ ] `/rbac/impersonate` restricted, short-lived, audited.
- [ ] OTP request and verify rate-limited, per IP + identifier and per identifier alone.
- [ ] Security headers present (`helmet`), `X-Powered-By` absent, body over 100 kb gets 413,
      `/docs` returns 404 in production, a token signed with another algorithm gets 401.
- [ ] Every name a member can set renders as text: no raw `dangerouslySetInnerHTML` with user data.
- [ ] No client can mark an order paid without provider verification.
- [ ] Uploads: type, size, content and ownership checked.
- [ ] No OTP, secret, token or unneeded private field in any response.
- [ ] Public catalog: only intended records and fields; maximum page size enforced; validated input.
- [ ] Errors expose no stack traces or database details.
- [ ] Sensitive admin actions are audited.

API docs prove that a route is registered, not that its runtime checks are right; this checklist
is the runtime check.

## 6. UAT by role

Log in as each console role (Super Admin, Admin, Marketing, Sales, Member, Support) and call one
route per resource. The result must match `PLANNING.md` §1.2: 200 where the role has the action,
403 where it does not, 404 for another member's record under own scope. Then repeat the main
journeys: Sales creates a member; the member completes profile, branch, therapist, deal, product;
Admin reviews documents; reminders arrive; Admin suspends and reactivates; a customer buys a deal.
Sign-off sheet: task P12-08.

## 7. Test data: 10 deals and 5 products

Status: draft, pending TL approval; do not insert until the blockers below are fixed.

Mapping to the API: category and subcategory resolve by name through `GET /vendors/categories`
(never hardcode ids); long text becomes sanitized HTML; packages map to
`{durationMinutes, sellingPrice, originalPrice}`; therapist type and name map to `therapistType`,
`personName` ("Not listed" becomes a neutral name such as "Team therapist"); discount is computed
on the server.

Blockers:
1. **Currency:** the content is USD; the app is INR and has no currency column. Convert first.
2. **Category type:** deals need a `SERVICE` category; deals 1 and 10 use "Therapy" (a `THERAPY`
   type). Move them or change the category.
3. **Same-duration packages:** deal 2 has two 60-minute options (body, foot); split into two deals
   (D13).
4. **Provenance:** copied from Groupon listings; rewrite as original copy and remove marketplace
   wording before any production insert.
5. **Ownership:** every therapist on a deal must belong to the deal's branch. Seed order: member,
   branch, therapists, deals (packages, therapist links), products, in a transaction per deal.

#### Index

| # | Deal | Category | Sub Category |
|---|------|----------|--------------|
| 1 | Consultation, Adjustments and Choice of Hydro Massage or Laser Therapy | Therapy | Physical Therapy |
| 2 | 60-Minute Deep Tissue Body or Foot Massage with Hot Stones and Essential Cream | Massage | Body Massage |
| 3 | 60-Minute Prenatal Massage with Aromatherapy | Massage | Prenatal Massage |
| 4 | 60-Minute Foot Reflexology Massage | Massage | Foot Massage |
| 5 | Full Body Steam, Exfoliating Scrub, Infrared Wrap and Shower | Spa & Wellness | Steam & Sauna |
| 6 | Keratin Smoothing Treatment | Hair | Hair Treatments |
| 7 | 60-Minute Hydrating Facial with Peel or Microdermabrasion | Skin & Beauty | Facial |
| 8 | Six Laser Hair Removal Sessions on a Choice of Area | Skin & Beauty | Hair Removal |
| 9 | Classic, Hybrid or Volume Full Set Eyelash Extensions | Nails & Lashes | Eyelash Services |
| 10 | 60-Minute Counseling Sessions for One or Two People | Therapy | Mental Wellness |

---

### PART 1: DEALS

---

#### Deal 1

**Category:** Therapy > Physical Therapy

**Source (reference only):** https://www.groupon.com/deals/delaware-injury-care-1 (Wilmington, DE)

**Title:** Consultation, Adjustments and Choice of Hydro Massage or Laser Therapy

**Slug:** consultation-adjustments-choice-of-hydro-massage-or-laser-therapy

**Short Description:** Patient needs are assessed in a preliminary consultation, followed by adjustments and therapy sessions for personalized care.

**Description:**
Struggling with chronic pain or a recent injury? This deal covers everything from an initial consultation to multiple adjustments and your choice of hydro massage or laser therapy sessions. Whether you are dealing with neck pain or back issues, these treatments are designed to help you feel better quickly.

The deal includes an initial consultation to assess patient needs, followed by either two or four adjustments. Patients can choose between hydro massage or laser therapy for additional relief. The clinic is staffed by board-certified chiropractors and treats back pain (including herniated discs, spinal misalignment and strained muscles), neck pain and shoulder pain. Dry hydrotherapy massage mimics the therapeutic effects of a hot tub lined with high-powered jets, and Class IV laser therapy is used for pain control. The clinic also offers specialized care for auto accident and work-related injuries.

**Notes:**
- Appointment required, subject to availability.
- Most insurances are also accepted as full payment.
- Redeemable at three locations: Wilmington, Milford and Dover (Delaware).

**Policy:**
Appointment required. Merchant's standard cancellation policy applies (any fees not to exceed the Groupon price).

**Terms and Conditions:**
- Consultation required before service. If you are ineligible, a refund will be provided.
- Valid only for option purchased.
- May be repurchased every 365 days.
- Limit 1 per visit.
- Limit 1 per person.
- All goods or services must be used by the same person.
- Promotional value expires 120 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| 1 Consultation, 2 Adjustments, Choice of 2 Hydro Massage or Laser Therapy Sessions | 5 visits (1 consultation + 2 adjustments + 2 therapy sessions) | $42.50 | $350.00 |
| 1 Consultation, 4 Adjustments, Choice of 4 Hydro Massage or Laser Therapy Sessions | 9 visits (1 consultation + 4 adjustments + 4 therapy sessions) | $65.00 | $550.00 |

**Therapist:**

| Type | Name |
|------|------|
| Board-Certified Chiropractor | Not listed on Groupon |

---

#### Deal 2

**Category:** Massage > Body Massage

**Source (reference only):** https://www.groupon.com/deals/777-massage (Austell, GA)

**Title:** 60-Minute Deep Tissue Body or Foot Massage with Hot Stones and Essential Cream

**Slug:** 60-minute-deep-tissue-body-or-foot-massage-hot-stones-essential-cream

**Short Description:** A 60-minute deep tissue massage on the full body or the feet, with hot stones and essential cream.

**Description:**
Looking for some well-deserved relaxation? This deal offers a soothing deep tissue massage experience that can help melt away the stress of everyday life. Choose a 60-minute deep tissue body massage or a 60-minute deep tissue foot massage. Each session uses firm pressure on the areas you ask for, combined with hot stones and essential cream. The body massage focuses on deep tissue work across the full body, while the foot massage targets deep tissue work on the feet. The service works well as a gift, giving the recipient a full, unhurried experience.

**Notes:**
- Phone appointment is required. Provide your voucher code when booking.
- You must tell the spa you are using a coupon when booking. If not disclosed, regular price will be charged.
- Please arrive on time. Late arrivals still end at the originally scheduled time.
- Coupons are not accepted on Fridays and Saturdays.
- Redeemable at two locations: Austell and Powder Springs (Georgia).

**Policy:**
No-shows will result in automatic redemption of your code. Only one coupon may be used per appointment, regardless of the number of guests. Consultation required; non-candidates and other refund requests will be honored before service is provided.

**Terms and Conditions:**
- Must sign waiver.
- Not valid with insurance.
- Not valid toward taxes or gratuity.
- May be repurchased every 60 days.
- Limit 1 per person.
- All goods or services must be used by the same person.
- Not valid with other offers or promotions.
- Promotional value expires 180 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| 60-Minute Deep Tissue Body Massage with Hot Stones and Essential Cream | 60 minutes | $89.60 | $128.00 |
| 60-Minute Deep Tissue Foot Massage with Hot Stones and Essential Cream | 60 minutes | $66.50 | $95.00 |

**Therapist:**

| Type | Name |
|------|------|
| Licensed Massage Therapist | Not listed on Groupon |

---

#### Deal 3

**Category:** Massage > Prenatal Massage

**Source (reference only):** https://www.groupon.com/deals/massage-therapy-by-mary-5-1 (Houston, TX)

**Title:** 60-Minute Prenatal Massage with Aromatherapy

**Slug:** 60-minute-prenatal-massage-with-aromatherapy

**Short Description:** A customized 60-minute prenatal massage with soothing aromatherapy for expecting moms.

**Description:**
Prenatal massage can help ease discomfort, reduce stress and prepare you for childbirth. Each session is customized to suit your personal preferences and health conditions, so comfort and care are the top priority during this special time. Soothing aromatherapy is included with every session. Choose a single session or a multi-session package for specialized care designed for pregnant women. The studio is located in a clinic inside a medical building in Houston.

**Notes:**
- Appointment required. Merchant contact information is available after purchase in your voucher.
- Same-day appointments are not allowed on Saturdays.
- The last available appointment is at 5:00 PM.
- The business is closed on Sundays.
- Location: 6301 Richmond Avenue, Suite 240, Houston, TX 77057.

**Policy:**
48-hour cancellation notice required.

**Terms and Conditions:**
- Limit 1 per person, may buy 1 additional as a gift.
- Not valid with other offers or promotions.
- Promotional value expires 180 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| One 60-Minute Prenatal Massage and Aromatherapy | 60 minutes | $64.00 | $125.00 |
| Two 60-Minute Prenatal Massages and Aromatherapy | 2 x 60 minutes | $134.00 | $250.00 |

**Therapist:**

| Type | Name |
|------|------|
| Licensed Massage Therapist | Not listed on Groupon |

---

#### Deal 4

**Category:** Massage > Foot Massage

**Source (reference only):** https://www.groupon.com/deals/brown-blissful-balance-llc-2 (Minneapolis, MN)

**Title:** 60-Minute Foot Reflexology Massage

**Slug:** 60-minute-foot-reflexology-massage

**Short Description:** Stress relief for tired feet. Reflexology targets pressure points to help you relax, with an optional upper body massage.

**Description:**
Looking for a way to unwind? Reflexology targets foot imbalances, enhancing well-being and promoting relaxation. Skilled reflexologists apply just the right amount of pressure on your feet, which can help ease stress and anxiety, manage pain and lift your mood. Choose a 60-minute foot reflexology massage, or the 60-minute Massage Special that combines reflexology with an upper body massage. Sessions are led by licensed massage therapists and begin with a brief intake to discuss pressure preferences, areas of focus and any contraindications.

**Notes:**
- All appointments must be scheduled online.
- Appointment time includes intake and dressing, so hands-on massage typically runs 50 minutes for a 60-minute booking.
- Reflexology is available for both male and female clients. Massage services are available for female clients only.
- The studio is on the 3rd floor of the building. Parking is plentiful.

**Policy:**
Appointment required. Merchant contact information is available after purchase in My Stuff. Must sign waiver.

**Terms and Conditions:**
- Not valid with other offers or promotions.
- May be repurchased every 30 days.
- Limit 1 per booking.
- Limit 1 per visit.
- Limit 1 per person.
- Promotional value expires 180 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| One 60-Minute Foot Reflexology Massage | 60 minutes | $50.40 | $80.00 |
| 60-Minute Massage Special: Reflexology and Upper Body Massage | 60 minutes | $64.80 | $120.00 |

**Therapist:**

| Type | Name |
|------|------|
| Licensed Massage Therapist / Reflexologist | Not listed on Groupon |

---

#### Deal 5

**Category:** Spa & Wellness > Steam & Sauna

**Source (reference only):** https://www.groupon.com/deals/avalon-day-spa-21 (Las Vegas, NV)

**Title:** Full Body Steam, Exfoliating Scrub, Infrared Wrap and Post-Treatment Shower

**Slug:** full-body-steam-exfoliating-scrub-infrared-wrap-post-treatment-shower

**Short Description:** A multi-step revitalizing package to detoxify your body, exfoliate your skin and soothe your senses.

**Description:**
Feeling stressed, tired or just not quite yourself lately? Reclaim your sense of well-being with a relaxing spa experience that goes beyond the ordinary. This multi-step Revitalizing Package includes a full body steam, an exfoliating scrub, an infrared wrap and a post-treatment shower, all in a tranquil, eco-conscious setting. The infrared sauna dome offers something different from a traditional spa. It is all about detoxification and deep relaxation.

**Notes:**
- Appointment required. Merchant contact information is available after purchase in your voucher.
- For 1 person.
- Package includes: full body steam, exfoliating scrub, infrared wrap and post-treatment shower.

**Policy:**
Fully refundable within 3 days after purchase. After that, the merchant's standard cancellation policy applies (any fees not to exceed the Groupon price).

**Terms and Conditions:**
- Valid only for option purchased.
- Not valid with other offers or promotions.
- Limit 1 per person.
- All goods or services must be used by the same person.
- Promotional value expires 90 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| Revitalizing Package: Full Body Steam, Exfoliating Scrub, Infrared Wrap and Post-Treatment Shower | Multi-step session (total time not listed on Groupon) | $159.00 | $200.00 |

**Therapist:**

| Type | Name |
|------|------|
| Spa Therapist | Not listed on Groupon |

---

#### Deal 6

**Category:** Hair > Hair Treatments

**Source (reference only):** https://www.groupon.com/deals/ariana-beauty-station-2 (Omaha, NE)

**Title:** Keratin Smoothing Treatment

**Slug:** keratin-smoothing-treatment

**Short Description:** Smooth, shiny, frizz-reduced hair with a keratin smoothing treatment, available as one or two sessions.

**Description:**
Ever wished for smooth, shiny hair without the frizz? A keratin smoothing treatment temporarily seals keratin into your hair. This helps reduce curls, repair damage and block humidity while making your hair soft and easy to manage. The salon uses award-winning products such as Keratin Complex, which reduce frizz and add shine without completely straightening the hair. A personalized consultation makes sure each client gets the right solution for their hair type. The stylist also offers keratin combined with color processing and a Cool Mint Scalp Treatment.

**Notes:**
- Appointment required. Contact the stylist by email to book.
- Treatment is done in a private salon suite.
- The stylist has 10 years of experience, with favorite services in coloring, straightening and keratin.

**Policy:**
Appointment required. May be repurchased every 30 days.

**Terms and Conditions:**
- Limit 3 per person, may buy 1 additional as a gift.
- May be repurchased every 30 days.
- Promotional value expires 180 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| One Keratin Smoothing Treatment | 1 session (length not listed on Groupon) | $175.00 | $350.00 |
| Two Keratin Smoothing Treatments | 2 sessions (length not listed on Groupon) | $270.00 | $600.00 |

**Therapist:**

| Type | Name |
|------|------|
| Hairstylist (10 years of experience) | Ariana |

---

#### Deal 7

**Category:** Skin & Beauty > Facial

**Source (reference only):** https://www.groupon.com/deals/skin-care-by-susan-7 (San Rafael, CA)

**Title:** 60-Minute Hydrating Facial with Peel or Microdermabrasion

**Slug:** 60-minute-hydrating-facial-with-peel-or-microdermabrasion

**Short Description:** A 60-minute hydrating facial with your choice of peel or microdermabrasion, plus an aromatic pressure point massage.

**Description:**
Looking to boost your skin's glow? Hydrating facials deeply moisturize and help prevent water loss, leaving your skin fresh. With the option of diamond microdermabrasion or a peel, dull skin cells are broken up to reveal a brighter, softer complexion, smoother makeup application and potential long-term benefits such as reduced sunspots. The signature Aqua Peel treatment revitalizes without discomfort, combining vacuum extraction and hydration. The service also includes an aromatic pressure point massage with essential oils.

**Notes:**
- Appointment required.
- Includes: hydrating facial, peel or microdermabrasion, Aqua Peel treatment and aromatic pressure point massage with essential oils.
- The esthetician explains each step and recommends products for at-home care.

**Policy:**
Fully refundable within 3 days after purchase. Merchant's standard cancellation policy applies (any fees not to exceed the Groupon price).

**Terms and Conditions:**
- Limit 1 per person, may buy 1 additional as a gift.
- Consultation required before service. If you are ineligible, a refund will be provided.
- Valid only for option purchased.
- May be repurchased every 365 days.
- All goods or services must be used by the same person.
- Promotional value expires 120 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| One 60-Minute Hydrating Facial with Peel or Microdermabrasion | 60 minutes | $110.20 | $190.00 |

**Therapist:**

| Type | Name |
|------|------|
| Licensed Esthetician | Susan |

---

#### Deal 8

**Category:** Skin & Beauty > Hair Removal

**Source (reference only):** https://www.groupon.com/deals/skinlicious-laser-aesthetics-1 (San Bruno, CA)

**Title:** Six Laser Hair Removal Sessions on a Choice of Area

**Slug:** six-laser-hair-removal-sessions-choice-of-area

**Short Description:** Say goodbye to razors. Six laser hair removal sessions performed by registered nurses on the area of your choice.

**Description:**
Enjoy six laser hair removal sessions and experience long-lasting smoothness without the hassle. Treatments are performed by skilled Registered Nurses using the Cynosure Elite iQ laser system, with a Skintel melanin reader for safety, and are suitable for all skin types. Choose one area when you book: underarms, bikini line, full face, chest, abdomen, Brazilian, Manzilian or buttocks. Hair reduces by roughly 10 to 15% per session, and treatment helps prevent razor bumps and ingrown hair.

**Notes:**
- Before your session: shave the area 24 to 48 hours prior. Avoid makeup, sunscreen, lotion or deodorant on the day.
- Aftercare: apply aloe vera, sunscreen or hydrocortisone within 24 hours. Avoid hot showers, exercise and high heat for 24 hours.
- Hair shedding occurs about 2 weeks after treatment. Shaving is allowed between sessions. Avoid plucking, tweezing, threading or waxing.
- Limit sun exposure 2 weeks before and after treatment.
- Not recommended if pregnant or breastfeeding. Avoid treatment on inflamed areas. Tell the clinic about recent acne or skincare medications, facial treatments or chemical peels.
- Possible reactions: temporary redness, mild rubber-band sensation, temporary follicle swelling.

**Policy:**
All sales final, no refunds. Appointment required: call the clinic and provide your coupon code. Consultation is required before service. If you are ineligible, a refund will be provided.

**Terms and Conditions:**
- Limit 1 voucher per person.
- Must use all treatments on the same area. Cannot be substituted for other body parts.
- Must be used within one year from activation date of the voucher.
- Must sign waiver.
- Promotional value expires 180 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| Six Sessions on Underarms or Bikini Line | 6 sessions (length not listed on Groupon) | $162.00 | $300.00 |
| Six Sessions on Full Face | 6 sessions (length not listed on Groupon) | $207.00 | $300.00 |
| Six Sessions on Chest, Abdomen, Brazilian, Manzilian or Buttocks | 6 sessions (length not listed on Groupon) | $243.00 | $300.00 |

**Therapist:**

| Type | Name |
|------|------|
| Registered Nurse (RN) | Not listed on Groupon |

---

#### Deal 9

**Category:** Nails & Lashes > Eyelash Services

**Source (reference only):** https://www.groupon.com/deals/lash-house-by-cam-3 (Napa, CA)

**Title:** Classic, Hybrid or Volume Full Set Eyelash Extensions

**Slug:** classic-hybrid-volume-full-set-eyelash-extensions

**Short Description:** A full set of silk eyelash extensions in a classic, hybrid or volume style for a natural, comfortable everyday look.

**Description:**
Enhance your look with a full set of eyelash extensions, choosing from classic, hybrid or volume styles. Each application is performed carefully for comfortable everyday wear, with results lasting about one month without a fill. A classic set applies one extension to each natural lash for added length and subtle volume. A hybrid set blends classic and volume techniques for a textured look with more fullness than classic but lighter than full volume. A volume set applies multiple lightweight extensions to each natural lash for a dramatic, dense look. The service is provided by a licensed esthetician based in Napa Valley.

**Notes:**
- Booking required: you must book directly through Groupon. Choose "Book Now" at purchase, or "Buy Now, Book Later" and book in My Stuff.
- Changes to bookings can generally be made up to 24 hours before the appointment in My Stuff.
- Silk eyelash extensions are used.

**Policy:**
24-hour notice required for cancellation or rescheduling. If the customer arrives late, the appointment may be forfeited with no refund. No-shows may not be entitled to a refund. Refunds are not possible once a booking has been made.

**Terms and Conditions:**
- Consultation required; non-candidates and other refund requests will be honored before service is provided.
- Not valid with other offers or promotions.
- May be repurchased every 90 days.
- Limit 1 per person.
- Promotional value expires 180 days after purchase.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| Classic Full Set | Full set (length not listed on Groupon) | $82.50 | $150.00 |
| Hybrid Full Set | Full set (length not listed on Groupon) | $90.00 | $150.00 |
| Volume Full Set | Full set (length not listed on Groupon) | $97.50 | $150.00 |

**Therapist:**

| Type | Name |
|------|------|
| Licensed Esthetician / Lash Artist | Cam (Camille) |

---

#### Deal 10

**Category:** Therapy > Mental Wellness

**Source (reference only):** https://www.groupon.com/deals/u-psych-llc (Miami, FL, telehealth)

**Title:** 60-Minute Counseling Sessions for One or Two People

**Slug:** 60-minute-counseling-sessions-for-one-or-two-people

**Short Description:** A 60-minute telehealth counseling session with a licensed mental health professional, for individuals or couples.

**Description:**
Whether you are feeling overwhelmed, facing relationship challenges, managing stress or anxiety, or simply looking for a safe place to talk, this 60-minute counseling session offers compassionate, professional support tailored to your needs. During your session, a licensed mental health professional listens carefully, helps you understand your concerns and works with you to identify practical next steps based on your goals. Choose an individual session or a couples session. Sessions are available in English and Spanish, and referrals or recommendations for ongoing care are given when appropriate. The clinic specializes in trauma, cognitive behavioral techniques, emotional regulation and systemic approaches for anxiety, social phobia, PTSD, depression, ADHD and family and couples counseling.

**Notes:**
- This is a confidential 60-minute phone (telehealth) session.
- Online redemption only. Appointment required. Merchant contact information is available after purchase in My Stuff.
- Available in English and Spanish.
- The clinic provides telehealth services to individuals in Florida.

**Policy:**
Merchant's standard cancellation policy applies (any fees not to exceed the Groupon price).

**Terms and Conditions:**
- May be repurchased every 30 days.
- Limit 5 per person.
- Promotional value expires 180 days after purchase. Amount paid never expires.

**Packages:**

| Package | Duration | Selling Price | Original Price |
|---------|----------|---------------|----------------|
| One or Two 60-Minute Intensive Counseling Sessions (1 person) | 60 minutes per session | $101.25 | $225.00 |
| One or Two 60-Minute Counseling Sessions for Two People | 60 minutes per session | $126.00 | $280.00 |
| Service Through Your Health Insurance (individual session) | 60 minutes | $11.00 | $25.00 |

**Therapist:**

| Type | Name |
|------|------|
| Licensed Mental Health Professional | Not listed on Groupon |

---

### PART 2: PRODUCTS

(Unchanged from the previous draft, as approved.)

---

#### Product 1

**Name:** Lavender and Sweet Almond Massage Oil, 100 ml

**Slug:** lavender-sweet-almond-massage-oil-100ml

**Brand:** Aurelle Botanicals

**Price:** $18.99

**Original Price:** $24.99

**Discount:** 24%

**Badge:** Best Seller

**Summary:** A silky, lightly scented massage oil that glides smoothly and leaves skin soft.

**Description:**
This massage oil blends nourishing sweet almond oil with calming lavender essential oil. It absorbs well without feeling greasy, so it works for full-body massage at home or for dry skin after a shower. The scent is soft and relaxing, suited to evening use. Pump bottle for easy, mess-free use. Suitable for most skin types. Patch test before first use.

**Ingredients:**
Prunus Amygdalus Dulcis (Sweet Almond) Oil, Helianthus Annuus (Sunflower) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Lavandula Angustifolia (Lavender) Oil, Tocopherol (Vitamin E). Contains nut oil.

**Return Policy:**
Unopened and unused items can be returned within 30 days of delivery for a full refund. Opened items cannot be returned for hygiene reasons unless damaged or defective. Please contact support within 7 days with photos if the item arrives damaged.

---

#### Product 2

**Name:** Argan and Rosemary Scalp and Hair Oil, 100 ml

**Slug:** argan-rosemary-scalp-hair-oil-100ml

**Brand:** Verdana Hair Lab

**Price:** $16.50

**Original Price:** $22.00

**Discount:** 25%

**Badge:** New Arrival

**Summary:** A lightweight oil that nourishes the scalp, tames frizz and adds shine.

**Description:**
Made for dry, frizzy or rough hair. Argan oil softens the hair while rosemary oil leaves the scalp feeling fresh. Massage a few drops into the scalp as a pre-wash treatment, or smooth a small amount through the lengths and ends for shine. The formula is light and does not weigh hair down. Use 2 to 3 times a week.

**Ingredients:**
Argania Spinosa (Argan) Kernel Oil, Ricinus Communis (Castor) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Rosmarinus Officinalis (Rosemary) Leaf Oil, Tocopherol, Parfum.

**Return Policy:**
Unopened items can be returned within 30 days of delivery for a full refund. Opened items cannot be returned unless damaged or defective. Refunds are issued to the original payment method within 5 to 7 business days of receiving the return.

---

#### Product 3

**Name:** Vitamin C and Hyaluronic Acid Brightening Face Serum, 30 ml

**Slug:** vitamin-c-hyaluronic-acid-brightening-face-serum-30ml

**Brand:** Lumiere Skin Co.

**Price:** $24.00

**Original Price:** $32.00

**Discount:** 25%

**Badge:** Top Rated

**Summary:** A daily serum that brightens dull skin and keeps it hydrated.

**Description:**
This lightweight serum pairs stable vitamin C with hyaluronic acid to help even out skin tone and boost hydration. It absorbs quickly and layers well under moisturizer and sunscreen. Apply 3 to 4 drops to a clean face every morning. Always follow with sunscreen. Suitable for normal, dry and combination skin. Not recommended for very sensitive skin without a patch test.

**Ingredients:**
Aqua, Ascorbyl Glucoside (Vitamin C), Sodium Hyaluronate, Glycerin, Niacinamide, Panthenol, Ferulic Acid, Propanediol, Phenoxyethanol.

**Return Policy:**
Unopened and sealed products can be returned within 30 days for a full refund. Opened products can be returned within 14 days only if you had an adverse skin reaction. Please share a photo of the product and a short description of the reaction with our support team.

---

#### Product 4

**Name:** Cuticle Oil and Nail Strengthener Duo

**Slug:** cuticle-oil-nail-strengthener-duo

**Brand:** Petal and Pearl

**Price:** $12.99

**Original Price:** $17.99

**Discount:** 28%

**Badge:** Staff Pick

**Summary:** A two-piece set to soften cuticles and help weak nails grow stronger.

**Description:**
This set includes a 10 ml cuticle oil pen and a 10 ml strengthening nail serum. Apply the cuticle oil once or twice daily to soften dry cuticles and reduce peeling. Use the nail serum under or over polish to help prevent splitting and breaking. Works well between manicure and nail extension appointments.

**Ingredients:**
Cuticle Oil: Simmondsia Chinensis (Jojoba) Seed Oil, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Tocopherol, Citrus Aurantium Dulcis (Orange) Peel Oil.
Nail Serum: Aqua, Hydrolyzed Keratin, Panthenol, Biotin, Glycerin, Phenoxyethanol.

**Return Policy:**
Unopened sets can be returned within 30 days of delivery for a full refund. Opened sets cannot be returned unless defective. Contact support within 7 days of delivery if an item is missing or damaged.

---

#### Product 5

**Name:** Peppermint and Eucalyptus Foot Cream, 150 ml

**Slug:** peppermint-eucalyptus-foot-cream-150ml

**Brand:** Solewell Care

**Price:** $11.49

**Original Price:** $14.99

**Discount:** 23%

**Badge:** Limited Offer

**Summary:** A cooling, rich cream that softens rough heels and refreshes tired feet.

**Description:**
This foot cream combines shea butter and urea to soften dry, cracked heels and rough skin. Peppermint and eucalyptus give a cooling feel that is welcome after a long day on your feet. Massage into clean, dry feet at night and put on cotton socks for best results. Avoid broken skin and do not use between toes if irritated.

**Ingredients:**
Aqua, Butyrospermum Parkii (Shea) Butter, Urea, Glycerin, Cetearyl Alcohol, Mentha Piperita (Peppermint) Leaf Oil, Eucalyptus Globulus Leaf Oil, Dimethicone, Tocopherol, Phenoxyethanol.

**Return Policy:**
Unopened items can be returned within 30 days of delivery for a full refund. Opened items cannot be returned unless damaged or defective. Return shipping is free for damaged or incorrect items.

---

### Summary

| Item | Count |
|------|-------|
| Deals (all from Groupon) | 10 |
| Products | 5 |
| Categories covered | Massage (3), Spa & Wellness (1), Hair (1), Skin & Beauty (2), Nails & Lashes (1), Therapy (2) |

**Next step:** Waiting for TL approval. After approval, the data will be added to the database.
