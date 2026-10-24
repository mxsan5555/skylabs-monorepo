# msd planning: scope, roles and business rules

Business source of truth for msd (MySpaDeal, massage and wellness deals). When this file and
another doc disagree on who can do what, this file wins. Technical design: `ARCHITECTURE.md`;
data: `DATABASE.md`; endpoints: `API.md`; work: `TASKS.md`.

## 0. Scope

- **Product:** a marketplace where members (spas, salons, therapists) list deals, therapists and
  products by branch, and customers find, buy and book them. One admin console under
  `/account/*` serves every staff persona; what each sees comes from their permissions.
- **Stack:** React 19 + Vite storefront and console (`apps/msd`, green M3 theme), Express +
  Prisma + PostgreSQL API (`apps/msd-api`), shared M3 components (`packages/shared-ui`).
- **Principles:** WCAG 2.2 AA and SEO are baseline, not extras; no fabricated data (no ratings
  until reviews exist); copy lives in `apps/msd/src/content.json`; M3 colour roles only
  (60 surface / 30 container / 10 primary for actions); free tiers before paid services.
- **Module order** (same in every msd doc): 1 Admin and staff, 2 Members, 3 Customers and orders,
  4 Storefront, 5 Static content, 6 CTA banners, 7 Home slider, 8 Masters, 9 Payments, payouts and
  reports, 10 Analytics, 11 Social media, 12 Platform, security and release.

## 1. Admin and staff

### 1.1 Roles

Seven fixed system roles; none can be deleted. Custom roles are not needed now, so role create,
clone and delete are locked (R1).

| Key | Role | What they do |
|---|---|---|
| `super_admin` | Super Admin | Full access: create, edit, delete, everything (`isSuperAdmin`) |
| `admin` | Admin | Same as Super Admin, but cannot delete anything |
| `marketing` | Marketing | View members, branches, deals, therapists, products; manages website content |
| `sales` | Sales | Creates members and their branches, deals, therapists and products |
| `member` (was `vendor`) | Member | The deal company: logs in, updates own profile, uploads documents, creates own branches, deals, therapists and products |
| `support` | Support | Contacts customers or members about issues; view only; can raise a refund request, never issue it |
| `customer` | Customer | Storefront buyer; not part of the console matrix |

### 1.2 Permission matrix

V view, C create, E edit, D delete; scope A = all records, O = own records only (a member sees only
their own). The 14 permission keys replace the old ~40 overlapping rows.

| Resource (key) | Super Admin | Admin | Marketing | Sales | Member | Support |
|---|---|---|---|---|---|---|
| Members (`members`) | VCED A | VCE A | V A | VCE A | VE O | V A |
| Branches (`branches`) | VCED A | VCE A | V A | VCE A | VCE O | V A |
| Deals (`deals`) | VCED A | VCE A | V A | VCE A | VCE O | V A |
| Therapists (`therapists`) | VCED A | VCE A | V A | VCE A | VCE O | V A |
| Products (`products`) | VCED A | VCE A | V A | VCE A | VCE O | V A |
| Orders (`orders`) | V A | V A | - | V A | V O | V A |
| Customers (`customers`) | V A | V A | - | V A | V O (customers who ordered from them) | V A |
| Content (`content`) | VCED A | VCE A | VCE A | V A | - | V A |
| Payments and payouts (`payments`) | V A | V A | - | - | V O | - |
| Reports (`reports`) | V A (overall) | V A (overall) | - | - | V O | - |
| Staff users (`staff-users`) | VCED A | V A | - | - | - | - |
| System settings (`settings`) | VE A | V A | - | - | - | - |
| Logs (`logs`, login history) | V A | V O | V O | V O | V O | V O |
| My profile (`profile`) | VE O | VE O | VE O | VE O | VE O | VE O |
| Masters (`masters.*`) and dashboard | VCED / dashboard | VCE / dashboard | V / dashboard | dashboard | dashboard | dashboard |

Extra actions (granted on top of the matrix, never beyond):

| Action | Permission | Who |
|---|---|---|
| Member status (activate, make inactive, suspend) | `members:status_change` | Super Admin, Admin |
| Member document approve / reject | `members:approve` / `members:reject` | Super Admin, Admin |
| Remind a member now about documents | `members:status_change` | Super Admin, Admin |
| Member delete | `members:delete` | Super Admin only |
| Order cancel | `orders:status_change` | Super Admin, Admin |
| Raise a refund request | `orders:custom` | Support, Admin, Super Admin |
| Approve or reject a refund | `orders:approve` | Super Admin, Admin |
| Customer block / unblock | `customers:status_change` | Super Admin, Admin |
| Payout release to members | `payments:approve` | Super Admin only |
| Report export | `reports:export` | Super Admin, Admin |

Sales gets no status change, approve, reject, export or delete. Members view their own orders
only and never change an order's status, for deals or products (D27).

### 1.3 Rules that apply everywhere

1. Members never delete. "Edit" includes pausing or unpublishing their own branch, deal,
   therapist or product.
2. Orders, payments and customers are never hard-deleted; use Cancel, Refund and Block.
3. Super-admin-only actions (`members:delete`, `payments:approve`, `staff-users:delete`,
   `settings:edit`, every delete on branches, deals, therapists, products) cannot be granted to
   another role.
4. "Own" scope is enforced on the server for every route; a foreign record returns 404.
5. A preview ("Login As") session is read-only for payouts, deletes, status changes, refunds,
   staff users and role grants. A Super Admin cannot be impersonated.

### 1.4 Staff users, settings, logs, profile

- Staff users are created only with the roles super_admin, admin, marketing, sales, support; the
  last active Super Admin cannot be deactivated or deleted.
- System settings are a key allowlist (no secrets). The support contact used in member notices is
  `SUPPORT_EMAIL` / `SUPPORT_PHONE` until the settings table exists (D22).
- Login history: Super Admin sees all, everyone else sees their own.
- My profile: name, phone, email, avatar; phone and email changes go through OTP.

## 2. Members

### 2.1 Lifecycle

| State | Meaning |
|---|---|
| Active | Default at creation. A welcome message goes out by SMS and email. |
| Inactive | Business pause. The member logs in and sees everything (orders, customers, own catalog) but cannot change anything existing or add anything new, and sees a view-only banner on every screen. Their items are hidden from the website. Admin can return them to Active at any time; everything comes back as it was. |
| Suspended | Admin action, reason required (10 to 500 characters). The member cannot log in (open sessions end at once), everything they own and their profile disappear from the website, and they get an email and SMS with the reason, the support contact and the steps to return. A suspended member who tries to log in sees the same message. Customers who already paid are honoured by default; Admin can refund. |
| Archived | Set by the system when a suspended member with order history is deleted: hidden everywhere, records kept. |
| Deleted | Super Admin only, only from Suspended (journey Inactive → Suspended → Delete), only when the member never had an order. |

- Status can change at any time, even with no branches or deals.
- Branches, deals and therapists keep their own status. The storefront shows an item only when the
  member, the branch and the deal are all active, so reactivation restores everything.
- Every status change is written to the status history and audit log with who and why.

### 2.2 Onboarding

Staff (Sales or Admin) create every member with a short form (owner first and last name, mobile,
email, business name) and share the login details (D9). There is no public self-registration. The
member then completes the profile, branches, deals, therapists and products, and sees their order
history and customers.

### 2.3 Documents

A member is trusted from creation. Documents are a compliance follow-up, never a gate: a member
with incomplete documents can still publish.

- Required: Aadhaar card, PAN card, GST number. States: Missing, Submitted, Approved, Rejected
  (with reason), Expired. "Complete" means all three are Submitted or Approved.
- The member page shows "Documents complete" or "Documents incomplete" and the due date.
- Support sees only which document types are uploaded and their status, never the files.
- Files are private and opened with expiring links. Aadhaar and PAN show masked; the full number
  is stored encrypted, never in plain text, never in a response or log (D3). GST format is
  validated on entry. Uploads by staff on a member's behalf show "uploaded by <user> for member".

### 2.4 Document reminders and the suspension review flag (decided 2026-10-17)

| Day (from creation) | Event |
|---|---|
| 14 | Documents due. Reminder 1 of 3 by email and SMS, listing the exact documents still needed |
| 21 | Reminder 2 of 3 |
| 28 | Reminder 3 of 3, the final one: "If they are not received, an admin may suspend your account" |
| 35 | Flagged **Ready for suspension review** (D4: one week after the final reminder) |
| any later day | Super Admin or Admin decides, with the reason prefilled "Documents not completed". The system never suspends on its own. |

- Only Active and Inactive members get reminders. A missed day sends only the next reminder, and
  reminders stay at least 7 days apart.
- When the member is flagged, everyone whose roles grant `members:status_change` gets a bell
  notification.
- The flag clears automatically once documents are complete, and on reactivation.
- **Remind now:** staff with `members:status_change` can send one extra reminder per member per
  24 hours, outside the schedule. It does not move the schedule.
- The job runs daily at 10:00 IST (D14: Railway cron calling a secured endpoint).

### 2.5 Member detail page

Header: name, status, documents chip, due date, review flag badge, and only the actions the viewer
may use (Make inactive, Suspend, Reactivate, Delete, Remind now). Tabs: Profile, Documents,
Branches, Deals, Therapists, Products, Activity (status history, document events, reminders,
review flag). The All members list filters by status, documents incomplete and ready for review in
one grouped Filter menu, with distinct tonal colours per status.

### 2.6 Catalog flow

1. A member creates, edits, pauses or unpublishes own branches, deals, therapists and products;
   never deletes.
2. A deal belongs to exactly one branch. A therapist belongs to exactly one branch and may be on
   several deals of that branch.
3. A product belongs to the member, not a branch.
4. Sales and Admin create the same objects on a member's behalf; only Super Admin deletes.
5. Creation order: member → (staff-made categories) → branch (name and state required) →
   therapists → deals (at least one package; therapists from the same branch) → products.
6. Categories and subcategories are created by staff and open to every member (D10). Type rules
   stay: deals need a `SERVICE` category, products `PRODUCT`, therapist specialization `THERAPY`.
7. One deal holds duration and price options only (`DealPackage`); options that differ by service
   become separate deals (D13).
8. Deals publish without an approval step (D6, task P3-15).
9. All long text is written in the rich text editor and stored as sanitized HTML; titles, brand,
   badge, short description, summary, benefits and how-to-use items stay plain text (D18, D20).

## 3. Customers and orders

- Customers sign in with OTP or Google and use cart, wishlist, checkout (Razorpay or COD), order
  history, payments and support requests. They have no console grants (R8).
- Staff block or unblock a customer with a reason (`customers:status_change`); customers are never
  deleted.
- **Refunds (D11):** Support raises a refund request; Admin or Super Admin approves or rejects
  (reject needs a reason). Partial refunds are allowed up to paid minus already refunded; payment
  must be `PAID` or `PARTIALLY_REFUNDED`.
- **Support access (D12):** Support sees name, phone, email and order lines, never payment gateway
  ids.
- **Member's own customers (D19):** name, city, order count, last order date; no phone or email
  unless an order is open.

## 4. Storefront

- **Shell:** desktop two-row header (logo, city chip, search, wishlist, cart, account; then
  category links and an "All categories" panel); phone header plus a bottom tab bar (Home,
  Categories, Wishlist, Cart, Account), no hamburger. Footer: trust strip, newsletter band (UI
  only until task ST-28), link columns, popular searches ("{Category} in {City}"), legal bar,
  theme switch.
- **Trust claims:** verified spas and therapists, secure payments via Razorpay, instant booking
  confirmation. No rating badge until reviews exist (task ST-22).
- **Location:** saved choice, then browser location (only if already granted or on user action),
  then Vercel IP, then none. Coordinates map to the nearest partner city within 75 km.
- **Header search** (`SearchPanel` under the header field, task ST-38): focusing the field opens
  a panel. Its first row names the visitor's location ("Near {city}", Change) or asks for one
  ("Set your location to see what's near you"). With no query it lists the top categories. From 2
  characters it shows, in order: matching categories and subcategories (text rows), Deals
  (nearest first with distance when there are coordinates, else the visitor's city; when the
  city has none, deals from other cities, nearest first, under "No deals in {city} yet. These are
  from other states.", and Show all then has no count),
  Therapists (nearest first), Products (not location bound); each a row with image, member, title,
  place, distance and price, 4 per group. The footer "Show all results" opens `/explore?q=` and
  carries the result count from the API. Change switches the panel to a location step: filter
  the partner cities, pick one, or "Use my current location"; when the browser refuses or fails,
  an error says so and points to the browser's location setting and the city list. Picking a
  location re-runs the search for it and returns to the results. Combobox keyboard path: arrows
  move through result rows, Enter opens one, Escape closes, Tab reaches Change and Show all. No
  new API: existing `/catalog/deals`, `/catalog/therapists`, `/catalog/products`.
- **Home:** hero with search, shop by category, deals near you (category tabs, distance sorted),
  how it works, therapists, offers, products, popular treatments, FAQ, partner banner.
- **Offer card** (`sky-product-card price-first`, showcase "Offer card", to replace listing cards
  page by page in task ST-31): tag on the image (New, Deal, Hot, Expire soon, each a theme role
  via `badge-color` / `badge-tone`), price, old price and discount with a one-star score, title
  (two lines, ellipsis). Services: no description; a hairline divider, then the member and the
  place with distance from the visitor, one line each (`divided`). Products: a two-line
  description. Add to cart and wishlist. The whole card opens the detail page; Add
  to cart (a deal asks for its package) and the heart act on their own, signed-out visitors go to
  sign in first. Grid or list view. `color` takes the same M3 roles as the feature card (none,
  surface, surface-high, primary, secondary, tertiary, inverse), slotted buttons included.
  `slider`: an image slider with previous / next buttons and dots when the item has two or more
  images (the buttons never open the detail page). On every listing: home, hero, category,
  explore, products, wishlist and "You May Also Like".
- **Therapist card** (`TherapistCard`): image slider, member, area, distance and "From" lowest
  package price; used on home, explore, category, therapists and the therapist page rail.
- **Explore** (`/explore`): list and grid show the same offer and therapist cards as the category
  page (list = horizontal cards), each with a kind tag (Deal, Product, Therapist).
- **Detail pages** (`/deal/:id`, `/therapist/:id`): one layout. Breadcrumb; gallery with
  thumbnails and the discount tag; buy box with chips, h1, price, package list, quantity, total,
  Add to cart, wishlist (deals) and share; Details accordions beside Location (Get directions)
  and Hours; then a rail (deals: same category; therapists: same member). A therapist is added
  to cart from its own page with the chosen package, never through a deal.
- **Category page** (`/category/:slug`, `/category/:slug/:city`): h1 and total, clamped
  description, subcategory pills, Filters, List/Grid/Map, sort (Relevance, Price low to high, high
  to low, Distance when the visitor has coordinates), filter panel (Your location, Distance,
  Price, Business, Branches, Clear all), 12 cards per page with infinite scroll. All view state is
  in the URL.
- **SEO, GEO, AEO:** public routes are prerendered at build time with JSON-LD (Organization,
  WebSite search, ItemList, FAQPage, BreadcrumbList); `sitemap.xml`, `robots.txt`, `llms.txt`;
  `noindex` on account, cart, checkout and auth pages.
- **Maps:** Leaflet + OpenStreetMap by default (free, attribution visible); Google Maps behind a
  switch.
- Open questions: ST-03 (staff "Account" on phones), ST-13 (index product and therapy category
  pages or redirect).

## 5. Static content

Website content managed in the console under the `content` permission (today the `cms.*` keys,
task P8-07): blog (posts, categories, block editor), FAQs, legal and static pages (terms and
others), About us, Contact us, How it works, Careers (page and job listings). Marketing creates
and edits; Admin cannot delete (P10-31). Public pages read it from the catalog API. Rich text is
sanitized on write and on render (D18).

Public static pages (About, Contact, Help Center, How it works, Careers, legal pages, Become a
member) share `StaticPage`: breadcrumb, h1 and intro on the left, the brand logo in the header
row's right column (`SectionHead media`, decorative, hidden under 600px because the site header
already shows it). The category page header uses the same logo slot.

- **Contact:** address, phone and email come from the CMS Contact Us row; empty fields fall back
  to `content.contact.defaults` (placeholders until the owner supplies real details, ST-34). Left
  column: details + contact form; right column: the CMS map embed, else a keyless Google Maps
  embed of the address. The form validates name, email, subject and message, then opens the
  visitor's email app with the message filled in, addressed to the contact email. A stored
  message needs a public endpoint first (ST-33).
- **Become a member:** same split layout. The existing application form stays (submit stays off
  while staff create every member); the right column shows the partner team contact details.
- **Help Center:** CMS FAQs replace the 8 content.json defaults once any exist.
- **About us:** describes MySpaDeal as a marketplace for deals and products from verified partner
  businesses. No comparison claims.

## 6. CTA banners

Call-to-action banners, managed under Masters → Promotions (`/account/masters/promotions`; super_admin
VCED, admin VCE, marketing V, D8). Decided 2026-10-18:

1. **Choose the state first** (or Global/Default), then create as many banners for it as needed.
2. **A banner holds:** background colour, one image, headline (1 to 120 characters), subheadline (up
   to 300), button label (1 to 40) and button colour, a destination, start and end dates, sort order
   and an active flag.
3. **Colours are theme roles, not free colours (D24):** background Primary, Secondary, Tertiary,
   Surface, Surface high or Inverse; button Primary, Secondary, Tertiary or Inverse (a strong fill,
   so the button keeps 3:1 against any background). Each role brings its own text colour, so every
   banner keeps WCAG contrast and the brand palette.
4. **Destination:** a page route, a category, or a deal or product found by searching the chosen
   state (same search as the home slider). The item must belong to that state.
5. **Placement (D25):** each banner goes into one or more named slots: Home after deals, Home
   after products, Category page top, Explore top, Deal page bottom, Product page bottom.
6. **Who sees what:** a visitor sees the active, in-date banners of their state for that slot; if
   their state has none for the slot, or their location is unknown, the Global/Default banners show.
   A slot with no banner shows nothing.

## 7. Home slider

Home hero slider, managed under Masters → Home hero (`/account/masters/home-hero`). Decided
2026-10-18:

1. **Overview first (D28).** The Home hero page is a table of every slider: Global / Default
   (always first) and each state that has one, with its status (Live, Draft, Empty), progress to
   live (eligible items out of 5), deal and product counts and last change. **New state slider**
   lists the states with an active branch that have no slider yet. Edit opens that slider's
   builder.
2. **Builder, no dialogs.** One page per slider: the ordered slides on the left, the **Add** panel
   on the right (tabs on phones). The Add panel lists that state's deals and products at once,
   newest first, with All / Deals / Products, a search by title, member or branch, and "Only
   visible to customers" on by default. **Add** turns into **Added** in place. A deal belongs to its
   branch's state; a product belongs to every state where its member has an active branch (D23).
   The same item cannot be added twice to one slider.
3. **Each slide is a live item:** it shows the deal's or product's current title, price and image;
   slides are ordered by dragging (or the move up / move down buttons) and can be switched off. A
   slide whose item customers cannot see says why (for example "branch paused").
4. **Visitors see their state's slider** (from their location) once it has at least 5 eligible
   slides (slide, item, branch and member all active); until then, and for visitors with no
   location, the Global/Default slider shows. The console shows progress ("3 of 5 to go live") as a
   draft, not an error.
5. **Storefront hero (D26):** the h1 and search stay on the left; the right side is a carousel of
   offer cards (`OfferCard`, see §4) with `color="surface-high"` and `variant="plain"`, two at a time (one
   and a peek on phones), mixing deals and products; a "Service" (primary) or "Product" (tertiary,
   tonal) tag names the type. Each card has the offer card's parts and actions: price, old price
   and discount, title and description (two lines each), member, place and distance for services,
   Add to cart (a deal asks for its package) and the wishlist heart; the whole card opens the detail
   page. No rating until reviews exist. Every slide has the same height and its actions at the
   bottom. Under the cards: the slide dots on the left, Previous and Next on the right. Autoplay
   pauses on hover and is off for reduced motion.

Still open (SL-01): slide schedule (start and end dates) and image size and alt text rules.

## 8. Masters

Categories and subcategories (types `SERVICE`, `PRODUCT`, `THERAPY`), popular tags and popular
treatment groups. Super Admin VCED, Admin VCE, Marketing V only (D8).

Recommended category tree for India (SEO-led, task MA-01 to confirm and load):

| Group | Subcategories |
|---|---|
| Massage | Full body, Ayurvedic, Deep tissue, Swedish, Head (champi), Couples, Foot reflexology, Prenatal, Hot stone |
| Spa and wellness | Body scrub and polishing, Body wraps, Steam and sauna, Aromatherapy, Detox, Bridal spa package |
| Hair | Women's haircut, Men's haircut, Colouring and highlights, Keratin and smoothening, Hair spa, Bridal hair, Extensions |
| Skin and beauty | Facials and cleanup, De-tan, Chemical peels, Body polishing, Laser hair removal, Anti-ageing, Body contouring and slimming, Bleaching |
| Nails and lashes | Manicure, Pedicure, Nail art, Gel and acrylic nails, Eyelash extensions, Lash lift and lamination |
| Therapy | Physiotherapy, Acupuncture, Chiropractic care, Naturopathy, Yoga and meditation |

Removed as not mainstream in India: float therapy, cold plunges, cryotherapy, IV therapy, vitamin
injections, dip powder nails.

## 9. Payments, payouts and reports

- **Payouts (D2, D17):** monthly, for the previous calendar month; eligible orders `CONFIRMED` or
  `COMPLETED` with payment `PAID`, minus approved refunds; commission 1% of the member's gross
  (`payout.commissionPercent`), rounded to 2 places half-up. Release is Super Admin only.
- **Reports:** Super Admin and Admin see overall figures, a member sees only their own: overall
  revenue, online payment waiting, payments transferred to members, deals ordered / cancelled /
  refunded, therapists ordered / cancelled / refunded, products ordered / cancelled / refunded.
  Date range up to 366 days; export for Super Admin and Admin.

## 10. Analytics

Not started. Plan: one GA4 property and GTM container for msd only, Google Consent Mode v2 with
analytics denied until consent, and `dataLayer` events with ids only (no names, emails or phones):
`view_deal`, `add_to_cart`, `begin_checkout`, `purchase`, `search`, `view_category`. Tasks AN-01
to AN-03.

## 11. Social media

Social links (label, URL, target) managed in the console and shown in the footer and in the
Organization JSON-LD `sameAs`. Further scope (share buttons, Open Graph images, post copy): to be
written (task SO-01).

## 12. Platform, security and release

Non-negotiables: no secrets in git; RLS-equivalent ownership checks on the server for every route;
input validation on every endpoint; HTTPS only; audit rows for status, document, refund, payout,
delete and role-grant changes in the same transaction (R4); Aadhaar Act / DPDP Act review of
document handling (P0-03, advisory). Files: one folder per owner (member, customer, home slider,
CTA banner, static content); identity documents only in a private bucket, opened with links that
expire after 5 minutes (ARCHITECTURE.md §12.3).

## 13. Decisions

### 13.1 Owner decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Old `REJECTED` vendors | Migrate to Suspended with reason "Migrated from rejected"; other old states become Active |
| D2 | Payout rule | As section 9 |
| D3 | Aadhaar and PAN storage | Full number encrypted at rest (AES-256-GCM), masked in responses, hash for duplicates; a switch to stop storing the full number later (task P5-16) |
| D4 | Review flag day | Day 35, one week after the final reminder (decided 2026-10-17) |
| D6 | Deal approval gate | Remove it |
| D7 | Member delete | Super Admin only, only from Suspended; zero orders = delete, otherwise archive |
| D8 | Masters and dashboard | Super Admin VCED, Admin VCE, Marketing V only; dashboard for all console roles with scoped data |
| D9 | Onboarding | Staff create members and share logins; member gets own-scope customers view |
| D10 | Category access | Categories open to every member; no per-member grants |
| D11 | Refund policy | Section 3 |
| D12 | Support access to customer data | Section 3 |
| D13 | Package label | Keep `DealPackage` as duration plus price |
| D14 | Scheduler | Railway cron calling a secured endpoint, daily 10:00 IST (decided 2026-10-17) |
| D17 | Payout commission | 1% |
| D18 | Content authoring | Rich text editor for all long text, stored as sanitized HTML |
| D19 | Member's own customers | Section 3 |
| D20 | Rich text scope | Long fields only; labels and lists stay plain text |
| D21 | Inactive and suspended behaviour | Section 2.1 |
| D22 | Support contact in notices | Env vars until the settings table exists |
| D23 | Product state | A product counts in every state where its member has an active branch (2026-10-18) |
| D24 | Banner colours | Theme colour roles only, no free colours (2026-10-18) |
| D25 | Banner placement | Named slots, several per banner (2026-10-18) |
| D26 | Home hero layout | Keep h1 and search on the left; larger mixed deal and product card carousel on the right (2026-10-18) |
| D28 | Home slider console | Overview table of every state slider, then a two-pane builder with no dialogs (2026-10-18) |
| D27 | Member order changes | None: members view own orders only (2026-10-18) |
| B2 | Vendor rename | Prisma `Vendor` → `Member`, `VendorDocument` → `MemberDocument` with `@@map`; FK columns stay `vendorId` |
| B5 | Permission key | `vendors` → `members`; role `vendor` → `member`; role `support` added |
| N1 | Reminder decisions (2026-10-17) | Clear the flag when documents complete; bell alert to `members:status_change` holders; Remind now in this release |

### 13.2 Rules this plan sets

| # | Rule |
|---|---|
| R1 | Fixed roles: role create, clone and delete return 403 `ROLE_MANAGEMENT_LOCKED`; Super Admin still edits grants |
| R3 | New and changed routes use `.strict()` schemas now; existing routes switch one by one |
| R4 | Mandatory audit rows are written in the same transaction and fail the request if the write fails |
| R5 | Customer block maps to the existing `UserStatus` `active` / `blocked`, plus reason columns |
| R6 | Refunds reuse `orders`: `orders:custom` raises, `orders:approve` decides |
| R7 | Canonical flat paths (`/members`, `/branches`, `/deals`, `/therapists`, `/products`); `/vendors/...` stays as a deprecated alias for one release |
| R8 | Customers get no console grants; self-service routes stay authenticated-only |
| R9 | Support's only extra is `orders:custom`; documents show type and status only |
| R10 | One member, one owner user |
| R11 | Bootstrap scopes use the DB values `ALL` and `OWN` |

### 13.3 Open decisions

| # | Decision | Recommendation |
|---|---|---|
| D5 | Migrated document rows | Start as Submitted; a re-upload resets Approved or Rejected to Submitted |
| D15 | Avatar | Reuse the existing media upload |
| D16 | Alias window for `/vendors/...` | One release, removed after 14 days of zero traffic |
