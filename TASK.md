# TASK

Task tracking for the skylabs-monorepo. Scope lives in `PLANNING.md`.

**How to use:** when you start a task move it to _In progress_; when done, check it
off under _Completed_ with the date. Add new work to _Backlog_. Keep this file current.

---

## In progress

- _(none — next up: register both Google OAuth redirect URIs on the shared Cloud Console
  client, then Content pages → contact, then the blog set)_

## External setup needed (outside this repo)

Nothing here is a code task — these are accounts/config only you can create.

- [x] Postgres databases `msdapi` and `meradriverapi` on `localhost:5432` — done;
  credentials live in each app's `.env.local` (not committed)
- [ ] **Google Cloud Console** — one OAuth 2.0 Client ID is currently shared by both apps.
  Register **both** redirect URIs as "Authorized redirect URIs" on that one client (add the
  production callback URLs too once deployed):
  - `http://localhost:4300/api/auth/google/callback` (msd)
  - `http://localhost:4500/api/auth/google/callback` (mera-driver)
  - Until both are registered, Google will reject the callback for whichever app's URI is
    missing. Splitting into two separate clients later is a straightforward config-only
    change (no code) — see `apps/<app>-api/.env.local`.
- [x] **Email provider** — Gmail SMTP configured with an App Password in both apps'
  `.env.local`; live-tested successfully (real email delivered) — 2026-07
- [x] **SMS provider** — `connectexpress.in` (`SMS_API_KEY`/`SMS_SENDER`) wired in both
  apps' `.env.local`. The API has no public docs; the contract was reverse-engineered via
  a couple of safe probe requests (see `lib/sms.ts`) — **not yet live-tested with a real
  phone number**, since that would send an actual SMS and consume paid credit. Test it
  yourself once by signing in with a real phone number on either app.
- _(none)_

## Backlog

### MSD — Consumer storefront (pages + shell)
- [x] Improved web header: logo, responsive nav, search bar, cart badge, auth buttons, mobile hamburger drawer — 2026-07-12
- [x] SEO/GEO/AEO footer: brand column, quick links, category links, support, newsletter opt-in, trust badges, legal bar — 2026-07-12
- [x] `content.json`: single file for all static copy across all consumer pages — 2026-07-12
- [x] Static data: `deals.ts` (15 deals), `categories.ts` (5 categories + subcategories) — 2026-07-12
- [x] CartContext + WishlistContext (localStorage-backed React contexts) — 2026-07-12
- [x] Home page: hero + search, featured deals carousel, category grid, hot right now carousel, gift cards CTA, per-category horizontal carousels (Massage, Facial, Nails, Spas, Wellness), welcome offer CTA — 2026-07-12
- [x] Search / Explore page (`/explore`): 5 filter chips (Price, Suggested, Category, Features, Distance) with Dialogs, list/grid/map view toggle, real-time client-side filtering — 2026-07-12
- [x] Category page (`/category/:slug`): breadcrumb, hero, subcategory Tabs, sort FilterChips, responsive deal grid — 2026-07-12
- [x] Deal detail page (`/deal/:id`): breadcrumb, gallery with thumbnails, info panel (provider, rating, price, CTA, features), Accordion (What's Included / How to Use / Cancellation), related deals carousel, JSON-LD LocalBusiness schema — 2026-07-12
- [x] Cart page (`/cart`): items with qty controls, order summary, gift card input, auth-aware checkout redirect — 2026-07-12
- [x] Wishlist page (`/wishlist`, RequireAuth): saved deals grid, empty state, add-to-cart action — 2026-07-12
- [x] Checkout page (`/checkout`, RequireAuth): 3-step flow (Details → Date & Time → Payment) with LinearProgress indicator, success screen — 2026-07-12
- [x] New type definitions: Deal, Category, Subcategory, CartItem, WishlistItem, SearchFilter, SearchView, PriceLevel, CheckoutStep, DealSort — 2026-07-12
- [x] Routes: added /explore, /category/:slug, /deal/:id, /cart, /wishlist (RequireAuth), /checkout (RequireAuth) to PublicLayout — 2026-07-12
- [x] Wired CartProvider + WishlistProvider in main.tsx — 2026-07-12

### Content pages — both apps (`pages/` + route)
- [ ] Contact page
- [ ] Blog category (filtered list)

### Account & admin — both apps (remaining)
- [ ] Logout from inside the console (currently in the public header)
- [ ] Admin/marketing/sales feature pages (real content, not stubs)
- [ ] Remove the "View as (demo)" role switcher now that real roles come from the JWT
- [ ] Replace localStorage account store (`account-context.tsx` / `account.service.ts`) with
  the real profile API (`/me` + a future profile-update endpoint)

### Auth integration (remaining)
- [ ] Register both apps' Google OAuth redirect URIs on the shared Cloud Console client —
  see "External setup needed" above
- [ ] Live-test phone OTP with a real number (SMS send is implemented but unverified — see
  "External setup needed" above)
- [ ] Refresh-token rotation / revocation (v1 ships a stateless 7d access token only, by
  design — see `apps/*-api/prisma/schema.prisma`)
- [ ] True E.164 phone normalization (`libphonenumber-js`) — current normalization just
  strips non-digits and assumes the user includes their country code

**Key auth files (reference):**

| Concern | msd | mera-driver |
|---------|-----|-------------|
| Auth state + roles + user | `apps/msd/src/auth/auth-context.tsx` | `apps/mera-driver/src/app/core/auth/auth.service.ts` |
| Auth guard | `apps/msd/src/auth/require-auth.tsx` | `apps/mera-driver/src/app/core/auth/auth.guard.ts` |
| Role guard | `apps/msd/src/auth/require-role.tsx` | `apps/mera-driver/src/app/core/auth/role.guard.ts` |
| HTTP token injection | `apps/msd/src/api/api-client.ts` | `apps/mera-driver/src/app/core/auth/auth.interceptor.ts` |
| API base config | `apps/msd/.env.local` (`VITE_API_URL`) | `apps/mera-driver/src/environments/environment.ts` |
| Menu / roles config | `apps/msd/src/app/admin/menu.ts` | `apps/mera-driver/src/app/admin/menu.ts` |
| Backend auth routes | `apps/msd-api/src/routes/auth/` | `apps/mera-driver-api/src/routes/auth/` |
| Backend OTP engine | `apps/msd-api/src/lib/otp.ts` | `apps/mera-driver-api/src/lib/otp.ts` |
| Backend Prisma schema | `apps/msd-api/prisma/schema.prisma` | `apps/mera-driver-api/prisma/schema.prisma` |

### Bugs
- [ ] `apps/mera-driver/src/app/pages/blog/blog.ts:44` calls `this.blog.listPosts(...)`, but
  `BlogService` only exposes `queryPosts` — blocks `nx build`/`nx test` for `mera-driver`
  (pre-existing, unrelated to auth; found while verifying the auth work)

### Quality & ops
- [ ] e2e tests (Playwright) for the auth flow
- [ ] Error tracking (Sentry free tier)
- [ ] CI gates (GitHub Actions: lint + test + build)
- [ ] Deployment (frontends + APIs) — `.env.example` already exists per app
  (msd, msd-api, mera-driver-api); mera-driver uses `environments/environment.prod.ts`
  (via `fileReplacements`) instead of an `.env.example`
- [ ] Fix `nx.json` `defaultBase` (`master` → `main`) if using `nx affected`

---

## Completed

### Foundation & design system
- [x] Nx monorepo with `msd` (React 19 + Vite) and `mera-driver` (Angular 21) — 2026-06
- [x] `packages/shared-ui`: all 15 Material Web (M3) component groups registered
- [x] Typed React wrappers (`@lit/react`) for shared-ui components
- [x] Theme engine: `applyTheme()`, per-app Material Theme Builder exports (msd green / mera-driver blue), light/dark toggle
- [x] Self-hosted fonts: Material Symbols Outlined + Roboto (no CDN)
- [x] Custom LIT components: `sky-badge`, `sky-card` (decorator-free)
- [x] Shared test polyfills (`installMaterialJsdomPolyfills`) and shared `layout.css`

### App structure (both apps)
- [x] Layouts: `public-layout`, `auth-layout`
- [x] Shared app components: header (nav + auth action), footer
- [x] Auth scaffolding: context/service, route guard, HTTP interceptor (Angular), api client, domain models
- [x] Central routing with lazy loading (Angular) and layout grouping

### Pages (both apps)
- [x] Home (sample, themed)
- [x] Sign-in (Email/Phone tabs, field, Send OTP, Google, divider)
- [x] OTP (code field, verify, resend countdown, back)
- [x] 404 / not-found (inside shell)
- [x] Component showcase (kept)
- [x] Blog list (paginated `?page` previews via `sky-card`/`sky-badge`/M3 buttons) + blog detail (block-rendered body, tags, SEO title/description) — static `blog` data/service that mirrors the future API; composed only from shared-ui — 2026-06

### Account & admin console (both apps)
- [x] Role-based admin layout (full-height sidebar + collapsible toggle + breadcrumb + centered content), shown after login / "My account" — 2026-06
- [x] RBAC: `roles` on user, role-filtered sidebar menu (config-driven), `RequireRole` / `roleGuard`, "View as" demo switcher
- [x] My Account: edit email/phone + full address CRUD (localStorage until backend)
- [x] Dummy role pages (Dashboard + admin/marketing/sales) demonstrating gating
- [x] Review pass: semantic breadcrumb (`<ol>` + `aria-current`) & address list (`<ul>/<li>`), config-driven address form, stable React account-store callbacks

### Components (shared-ui)
- [x] Carousel via Swiper Element (opt-in `/carousel` entry, brand-themed via `--swiper-theme-color`); raw `<swiper-container>`/`<swiper-slide>` in both apps, all 10 features demoed in each showcase — 2026-06
- [x] Card components: `sky-product-card` (stars/score, outlined variant, favorite), `sky-image-card`, `sky-category-card`, `sky-info-card` — LIT + M3 inside, React wrappers + raw Angular tags, responsive + `align` + semantic/a11y, demoed in both showcases — 2026-06
- [x] Accordion: `sky-accordion` (+ `single` mode) + `sky-accordion-item` (card panel, rotating md-icon chevron, `aria-expanded`/region, `variant`, `level`) — React wrappers + raw Angular tags, demoed in both showcases — 2026-06
- [x] Showcase now demos every M3 group with full features: chips (4 types), icon buttons (+toggle), FAB/extended/branded, selection (checkbox/radio/switch), text fields (icons, prefix/suffix, supporting, types, textarea, counter, validation), select, slider (continuous/discrete/range), menu (+submenu, popover), tabs (primary/secondary), progress (linear/circular/indeterminate/four-color), ripple, list (start/end slots) — 2026-06

### Quality passes
- [x] Accessibility: landmarks, labelled controls, `aria-hidden` icons, `autocomplete`, semantic destination pill, breadcrumb/list semantics
- [x] SEO: per-route titles, default meta description, `noindex` on auth pages
- [x] DRY: shared `layout.css` (shell + auth + admin), shared test setup, config-driven menus/forms

### Docs
- [x] `ARCHITECTURE.md`, `PLANNING.md`, `TASK.md`, updated `CLAUDE.md`

### Backends & auth integration
- [x] Scaffolded `apps/msd-api` and `apps/mera-driver-api` (Express + TS, `@nx/express`),
  each with its own Postgres DB (`msdapi`, `meradriverapi`) and port (4300, 4500) — 2026-07
- [x] Prisma schema per app (`User`, `OtpCode`, `ExchangeCode`), migrated live against both
  databases — 2026-07
- [x] Zod + `zod-to-openapi` validation & spec, `swagger-ui-express` at `/docs` for both
  APIs — 2026-07
- [x] Universal OTP engine: hashed codes, expiry, server-driven resend cooldown, max-attempt
  lockout, anti-enumeration, per-destination rate limiting — 2026-07
- [x] Email OTP delivery via Gmail SMTP (`lib/email.ts`) — live-tested, real email
  delivered — 2026-07
- [x] Phone OTP delivery via the `connectexpress.in` SMS gateway (`lib/sms.ts`) — request
  contract confirmed live (no public docs existed); not yet tested with a real phone
  number — 2026-07
- [x] Google OAuth (`passport-google-oauth20`) with a one-time exchange-code redirect flow
  (JWT never sits in a URL); returns a clean 503 instead of crashing when Google credentials
  aren't configured; real Cloud Console credentials now in both apps' `.env.local` — 2026-07
- [x] `GET /me` + frontend rehydration on boot; `AuthContext`/`AuthService` gained a real
  `user` field — 2026-07
- [x] Wired both frontends' sign-in/OTP pages to the real endpoints (replacing the mock
  token); post-login now lands on `/` — 2026-07
- [x] mera-driver gained `environments/environment.ts` (+ `.prod.ts` via `fileReplacements`)
  so its API base is configurable, matching msd's `VITE_API_URL` — 2026-07
- [x] Live-verified end-to-end against real Postgres: OTP request/verify round trip,
  wrong-code rejection, JWT issuance with the correct default role per app, `/me`
  rehydration — 2026-07
