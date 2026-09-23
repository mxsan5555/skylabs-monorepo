# msd: site shell (header, footer, tab bar), location, SEO/prerender, and home page

Date: 2026-09-22
Status: approved in brainstorming, pending spec review
Scope: `apps/msd` (plus one additive `apps/msd-api` field). First of a page-by-page series; every later page gets its own spec and reuses the shell, location, and prerender pieces defined here.

## 1. Goals

1. Replace the current header (`header-v2.tsx`, 893 lines, two header versions) and footer with a shell that is calmer, easier to navigate, strong on mobile, and consistent with shared-ui.
2. Make public pages readable by search engines and AI answer engines (SEO, GEO, AEO) by prerendering HTML at build time and emitting JSON-LD.
3. Rebuild the home page around user intent with fewer, fixed sections.
4. Hold every change to the project rules: colours only from `--md-sys-color-*` (app theme files), shape/type/motion/elevation from `packages/shared-ui/src/theme/base.css`, copy from `apps/msd/src/content.json`, shared-ui components wherever one fits, semantic HTML, WCAG 2.2 AA minimum, AAA through the high-contrast theme, responsive from 320px, no duplicated styles.

## 2. Non-goals

- Optimizing any page other than home (category, deal, blog, and the rest get their own specs).
- A newsletter backend. The form ships UI-only; backend goes to the `TASK.md` backlog.
- Reviews or ratings data. No rating claims appear until real reviews exist.
- Migrating to SSR or React Router 7 framework mode.

## 3. Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Rendering | Build-time prerender of public routes with `react-dom/server` + `hydrateRoot`; stays on React Router 6 and Vercel static hosting. |
| Header, desktop (>= 840px) | Two calm rows: logo, search, city chip, wishlist, cart, account; then plain category links plus an "All categories" mega panel. |
| Header, phone (< 840px) | Logo + city chip, full-width search, and a bottom tab bar (Home, Categories, Wishlist, Cart, Account). No hamburger. |
| Footer | Trust strip, newsletter band, link columns, popular searches ("{Category} in {City}"), legal bar. Accordions on phones. |
| Trust claims | Verified spas and therapists; Secure payments via Razorpay; Instant booking confirmation. No rating badge. |
| Location | Saved choice, then browser geolocation (only if already granted, or on user action), then a Vercel IP function, then none. |
| Headings | Generic "near you" wording in prerendered HTML; the city shows only in the city chip and location-sorted results (Groupon pattern). |
| City URLs | `/category/:slug/:city` (for example `/category/massage/pune`). |
| Home structure | Option B, about 10 fixed sections (section 7). |
| Newsletter | UI-only for now; backend is backlog. |

## 4. Units

| Unit | Path | Responsibility | Depends on |
|---|---|---|---|
| `LocationProvider`, `useVisitorLocation()` | `apps/msd/src/location/` | Resolve and share `{ status, city, state, coords, source, setCity, requestBrowser }` once per visit. Replaces `hooks/useCurrentLocation.ts`. Named `useVisitorLocation()` (not `useLocation()`) so it never clashes with React Router's `useLocation()`. | `/api/geo`, `CatalogShellProvider` (cities with coordinates), `localStorage` key `msd.location` |
| `geo` function | `apps/msd/api/geo.ts` | Vercel function returning `{ city, region, latitude, longitude }` from `x-vercel-ip-city`, `x-vercel-ip-country-region`, `x-vercel-ip-latitude`, `x-vercel-ip-longitude`; `null` when headers are absent. | Vercel runtime |
| `CatalogShellProvider`, `useCatalogShell()`, `categoryHref()` | `apps/msd/src/catalog/` | Fetch categories and locations once; share with header, tab bar sheet, footer, and home. Seeds from prerendered data. `categoryHref(slug, subSlug?)` builds every category URL (`/category/<slug>`, `?sub=<subSlug>` for a subcategory). | `api/catalog.ts` |
| `SiteHeader` | `apps/msd/src/app/components/site-header/` | Desktop two-row header, phone header, mega panel, city chip dialog. | providers, shared-ui |
| `MobileTabBar` | `apps/msd/src/app/components/mobile-tab-bar/` | Phone bottom navigation and the category sheet. | providers, shared-ui |
| `CartCountProvider`, `useCartCount()` | `apps/msd/src/hooks/use-cart-count.ts` | One shared cart count for the header and tab bar badges (one fetch, not one per badge). | `api/cart.ts`, auth |
| `SiteFooter` | `apps/msd/src/app/components/site-footer/` | Trust strip, newsletter band, columns, popular searches, legal bar, theme switch. | providers, shared-ui |
| `Seo`, `jsonld.ts` | `apps/msd/src/app/seo/` | Title, description, canonical, Open Graph/Twitter, JSON-LD builders. | `VITE_SITE_URL`, `content.json` |
| Prerender | `apps/msd/prerender/` | Render public routes to HTML, embed page data, write `sitemap.xml`, `robots.txt`, `llms.txt`. | `entry-server.tsx`, `PRERENDER_API_URL` |
| `usePrerenderedData` | `apps/msd/src/prerender-data/` | Return embedded data for a key first, then refetch on the client when inputs (for example coordinates) change. | none |
| Home page | `apps/msd/src/app/pages/home/` | Section 7. Exports `prerenderData()`. | providers, `Seo`, shared-ui |
| `/catalog/locations` | `apps/msd-api` | Add average `latitude`/`longitude` per city (additive, no migration). | `Branch.latitude/longitude` |

Removed: `header-v2.tsx`, `header-v2.css`, `header.tsx`, `header.css`, `footer.tsx`, `footer.css`, `hooks/useCurrentLocation.ts` (after all callers move to `useVisitorLocation()`), hardcoded `NAV_MENUS`, the Google Maps geocode call.

## 5. Shell

### 5.1 Header, desktop (>= 840px)

- Row 1 (64px), in this order: logo link (one `<img>` with `width`/`height`), city chip, `sky-action-field` search (`role="search"`, `type="search"`, submits to `/explore?q=`), then actions: wishlist and cart icon buttons with `sky-badge` counts (accessible names like "Cart, 2 items"), account (Sign in button, or M3 menu when signed in: Profile, Orders for customers, Sign out). "Become a Member" is a text link.
- Row 2 (`--site-header-strip-size`, 56px): top categories as plain `<a>` links from `useCatalogShell()`, then "All categories" disclosure button (`aria-expanded`, `aria-controls`) opening a mega panel of every category and subcategory as plain links built with `categoryHref()` (while categories load or fail, the panel lists the `nav.categories` fallback links). Esc closes and returns focus to the button. Not an ARIA menu.
- Sticky; row 2 hides on scroll down and returns on scroll up by a transform (no layout shift), using motion tokens (zero under reduced motion).
- Category links open the category page; `?sub=<subSlug>` selects that subcategory tab, and switching tabs rewrites `?sub=` (removed for "All").
- Skip link targets `<main id="main-content" tabindex="-1">` in `PublicLayout`.

### 5.2 Phone (< 840px)

- Header: logo, city chip, full-width search.
- `MobileTabBar`: `<nav aria-label="Primary">`, five 48px targets, `aria-current="page"` on the active item, badges on Wishlist and Cart, `padding-bottom: env(safe-area-inset-bottom)`. The page gets matching bottom padding.
- Categories opens a full-screen sheet with the category tree in `sky-accordion`.

### 5.3 City chip and dialog

- Shows the resolved city, or "Set location" when none.
- Opens an M3 dialog: "Use my current location" (triggers the browser prompt) and a city list from `/catalog/locations`. Choosing saves to `msd.location`.

### 5.4 Footer

1. Trust strip: three claims from `content.json`, decorative icons with `aria-hidden`.
2. Newsletter band: `sky-action-field` with `type="email"`, `autocomplete="email"`, `required`. UI-only: on valid submit it clears the field and shows the success message from `content.json` in an `aria-live="polite"` region. No request is sent; the `TASK.md` backlog item "Newsletter backend (msd-api table + endpoint)" tracks the real integration.
3. Columns: brand block (name, tagline, contact, social links with "opens in new tab" in the accessible name), Discover (categories from `useCatalogShell()`), Company, Help, Partners. Each column is a `<nav>` with an `<h2>`.
4. Popular searches: "{Category} in {City}" links to `/category/{slug}/{city-slug}`. Prerendered HTML lists all pairs (capped at 40 links); on the client the visitor's city moves first.
5. Legal bar: copyright with the current year, legal links, theme switch (light, dark, system) calling `applyTheme` / `applySystemTheme`.
- Phone: blocks 3 and 4 collapse into `sky-accordion`; links stay in the DOM.

## 6. Location and shared data

### 6.1 Resolution order

1. `msd.location` in `localStorage` (try/catch guarded) → `source: 'saved'`.
2. If `navigator.permissions.query({ name: 'geolocation' })` reports `granted`, read coordinates silently → `source: 'browser'`. Never prompt on load; prompt only from the city chip or "Use my location".
3. `GET /api/geo` → `source: 'ip'`.
4. Otherwise `status: 'none'`.

Browser and IP coordinates map to a city name by nearest city centre from `/catalog/locations` (Haversine), capped at 75 km: farther than that, the visitor keeps coordinates for distance sorting but gets no city. An IP result without coordinates keeps its city name only when it exactly (case-insensitive) matches a catalog city, using the catalog's spelling and state. No third-party geocoding.

### 6.2 Consumers

- Header city chip, home deals (distance sort via `latitude`/`longitude` query params already supported by the catalog API), footer popular-search ordering.

### 6.3 Errors

- Each provider fails independently. Category fetch failure: header strip falls back to `content.json` `nav.categories`; footer Discover uses the same fallback. Location failure: `status: 'none'`. Nothing in the shell throws.

## 7. Home page

Order (every section is a `<section aria-labelledby>` with an `<h2>`, except the hero `<h1>`):

1. Hero: `<h1>` from `content.json` ("...near you"), subheading, `sky-action-field` search, spotlight deal link. Hero image keeps `fetchpriority="high"` with `width`/`height`.
2. Shop by category: `sky-tile-card` grid; each tile gets a slotted `<a><h3>` so the link and heading exist in light DOM.
3. Deals near you: one carousel with category tabs (M3 tabs, `role="tablist"` semantics from shared-ui), replacing Featured deals, Biggest savings, and all per-category carousels. Distance-sorted when coordinates exist.
4. How it works: three steps (Find, Book, Relax) as an ordered list; copy in `content.json`.
5. Therapists carousel.
6. Offers: welcome offer, gift card (`sky-feature-card`), member banner for signed-out visitors.
7. Products carousel.
8. Popular treatments directory (links to `/explore?q=`).
9. FAQ (`sky-accordion`, answers slotted in light DOM) with FAQPage JSON-LD.
10. Partner banner (`sky-cta-banner`).

Carousel prev/next buttons stay in the section header row with accessible names. Images below the hero use `loading="lazy"` and `decoding="async"`. `home.css` is rewritten against tokens; unused `content.json` keys for removed sections (`spaFinderHero`, `premiumHero`, `heroImages`, `vacationStays`, `trustSection`, removed `sections.*` entries) are deleted after a repo-wide grep confirms no other caller.

`prerenderData()` returns categories, locations, deals (first 24), therapists (12), products (12), and FAQs.

## 8. SEO, GEO, AEO

### 8.1 Prerender

- `entry-server.tsx` renders `<App>` in `StaticRouter`; the script injects the HTML and a `<script type="application/json" id="__MSD_DATA__">` payload into `index.html`, then writes `dist/apps/msd/<route>/index.html`.
- `main.tsx` uses `hydrateRoot` when `#root` has children, else `createRoot`.
- Routes in this spec: `/` and `/category/:slug/:city` (every pair from `/catalog/locations`).
- If `PRERENDER_API_URL` is unreachable, the route falls back to the plain shell and the build logs a warning; the build does not fail.
- New Nx target `msd:prerender` depends on `msd:build`; `vercel.json` `buildCommand` runs it. The existing SPA rewrite stays for non-prerendered routes.
- SEO-critical text lives in light DOM (slots or plain markup), since shadow DOM content is not in the prerendered HTML.

### 8.2 `Seo` component

Props `{ title, description, path, image?, noindex?, jsonLd? }`. Emits `<title>`, meta description, canonical (`VITE_SITE_URL` + path), Open Graph and Twitter tags, optional JSON-LD. Replaces hand-written `<title>`/`<meta>` on pages as they are migrated.

### 8.3 JSON-LD

- All public pages: `Organization` (name, logo, `sameAs` from social links), `WebSite` with `SearchAction` to `/explore?q={search_term_string}`.
- Home: `ItemList` of carousel deals (each an `Offer` with price and `priceCurrency: "INR"`, no `AggregateRating`), `FAQPage`.
- City route: `BreadcrumbList`.

### 8.4 Crawler files (generated by the prerender script)

- `robots.txt`: allow all; disallow `/account`, `/my-account`, `/cart`, `/checkout`, `/orders`, `/sign-in`, `/otp`; `Sitemap:` line.
- `sitemap.xml`: static public routes, every category, every category/city pair.
- `llms.txt`: plain-text summary of MySpaDeal and links to main sections.

## 9. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SITE_URL` | msd (Vercel + `.env.example`) | Canonical and Open Graph base URL |
| `PRERENDER_API_URL` | msd build (Vercel) | API used by the prerender script |

`VITE_GOOGLE_MAPS_API_KEY` is no longer needed by location code (other callers, if any, keep it).

## 10. Testing and acceptance

Unit and component tests (Vitest + Testing Library, msd):
- `LocationProvider`: each source in order (saved, granted browser, IP, none); never calls `getCurrentPosition` on load when permission is `prompt`; nearest-city mapping.
- `usePrerenderedData`: returns embedded data, then refetches on input change.
- `SiteHeader`: skip link target exists; mega panel disclosure (`aria-expanded`, Esc closes and restores focus); badge accessible names.
- `MobileTabBar`: `aria-current` on the active route; five links present.
- `SiteFooter`: newsletter validation and live success message; popular-search links use `/category/:slug/:city`; each column is a labelled `<nav>`.
- `jsonld.ts`: builders output valid shapes; no rating fields.
- Home: section order, one `<h1>`, FAQ JSON-LD present when FAQs exist.

msd-api (Vitest + supertest): `/catalog/locations` includes `latitude`/`longitude` and keeps existing fields.

Build checks:
- `npx nx run msd:prerender` produces `dist/apps/msd/index.html` containing the hero `<h1>`, category links, and JSON-LD; plus `sitemap.xml`, `robots.txt`, `llms.txt`.
- No React hydration warnings in the browser console on `/`.

Acceptance (manual + Playwright where practical):
- axe (WCAG 2.2 AA) reports no violations on `/` in light, dark, and high-contrast themes.
- No horizontal scroll at 320px, 390px, 768px, 1280px.
- Full keyboard path: skip link, header, mega panel, tab bar, footer.
- Lighthouse on the prerendered `/`: SEO 100, Accessibility 100, LCP under 2.5s on the mobile preset.
- Grep over changed files finds no hex or `rgb(` colours and no hardcoded user-facing strings.

## 11. Risks

- Hydration mismatches from browser-only values (location, auth, wishlist): those render only after mount, never during prerender.
- Lit components during `renderToString`: importing shared-ui registers custom elements at module load, which needs `HTMLElement`/`customElements`. The server entry installs `@lit-labs/ssr-dom-shim` before importing the app; custom elements then render as host tags with attributes and slotted light DOM only.
- Build-time API dependency: mitigated by the shell fallback in 8.1.
- Removing `content.json` keys: guarded by a repo-wide grep before deletion.
