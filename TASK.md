# TASK

Task tracking for the skylabs-monorepo. Scope lives in `PLANNING.md`.

**How to use:** when you start a task move it to _In progress_; when done, check it
off under _Completed_ with the date. Add new work to _Backlog_. Keep this file current.

---

## In progress

### Deployment (Vercel) — code done, dashboard config pending
- [ ] In Vercel, per project (msd, mera-driver): set Root Directory to the app
      folder, Production Branch = `main`, attach the bought domain to Production,
      add env vars (`VITE_API_URL` etc.) — see `DEPLOYMENT.md`
- [ ] Validate the `../../` paths in `vercel.json` on a first preview deploy
- [ ] Add the CI check as a required status check in branch protection

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
- [ ] Real role assignment + enforcement once backends exist (JWT claim + per-request API check); remove the "View as" demo switcher
- [ ] Replace localStorage account store with profile API

### Backends — one per app (deferred until pages need real data)
- [ ] Scaffold `apps/msd-api` (Express + TS, `@nx/express`)
- [ ] Scaffold `apps/mera-driver-api` (Express + TS)
- [ ] PostgreSQL + Prisma schema per domain (massage deals / driver booking)
- [ ] Zod + `zod-to-openapi` validation & spec, `swagger-ui-express` at `/docs`
- [ ] Auth endpoints: phone/email OTP, Google OAuth, JWT issue/verify
- [ ] Domain endpoints (blog, profile, admin, deals/bookings)

### Auth integration (after backends)
- [ ] Wire sign-in / OTP / Google to real endpoints (replace mock token)
- [ ] Point each frontend `api` client at its API base via env (`VITE_API_URL`, etc.)
- [ ] Add `authInterceptor` to msd (matching the one already in mera-driver) once msd-api exists
- [ ] Remove "View as (demo)" role switcher from both sidebars; roles come from JWT

**Key auth files (reference):**

| Concern | msd | mera-driver |
|---------|-----|-------------|
| Auth state + roles | `apps/msd/src/auth/auth-context.tsx` | `apps/mera-driver/src/app/core/auth/auth.service.ts` |
| Auth guard | `apps/msd/src/auth/require-auth.tsx` | `apps/mera-driver/src/app/core/auth/auth.guard.ts` |
| Role guard | `apps/msd/src/auth/require-role.tsx` | `apps/mera-driver/src/app/core/auth/role.guard.ts` |
| HTTP interceptor | _(not yet)_ | `apps/mera-driver/src/app/core/auth/auth.interceptor.ts` |
| Menu / roles config | `apps/msd/src/app/admin/menu.ts` | `apps/mera-driver/src/app/admin/menu.ts` |

### Quality & ops
- [ ] e2e tests (Playwright) for the auth flow — add `playwright.config.ts` at repo root (config template in `.claude/skills/skylabs-testing.md`)
- [ ] Error tracking (Sentry free tier)
- [ ] `.env.example` per app and per API (msd-api, mera-driver-api) — see env var list in `.claude/skills/skylabs-auth.md` and `skylabs-api.md`

### AI dev team (`.claude/`)
- [ ] Add `playwright.config.ts` at repo root so `skylabs-dev` can run e2e tests against both apps
- [ ] Add `.env.example` to each API app once scaffolded (msd-api, mera-driver-api)
- [ ] Run `/skylabs-audit` after each major milestone to catch regressions early

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

### Deployment (Vercel + CI)
- [x] `nx.json`: `defaultBase` `master` → `main` + `release` config (independent, conventional commits) — 2026-09-04
- [x] `apps/msd/vercel.json` + `apps/mera-driver/vercel.json` (build/output/`nx-ignore`/SPA rewrite) — 2026-09-04
- [x] `.github/workflows/ci.yml` — `nx affected -t lint test build` PR gate on develop/release/main — 2026-09-04
- [x] `DEPLOYMENT.md` (source of truth + Mermaid flowchart) + root `README.md` — 2026-09-04
- [x] Deployment docs into `CLAUDE.md` / `PLANNING.md` — 2026-09-04

### Docs
- [x] `ARCHITECTURE.md`, `PLANNING.md`, `TASK.md`, updated `CLAUDE.md`

### AI Dev Team
- [x] Project-scoped agent team: 6 agents (`skylabs-abhi`, `skylabs-ravi`, `skylabs-neha`, `skylabs-dev`, `skylabs-vivek`, `skylabs-reena`) in `.claude/agents/` — 2026-07-18
- [x] 8 skill reference docs in `.claude/skills/` (msd-stack, mera-driver-stack, skylabs-auth, skylabs-api, shared-ui-usage, skylabs-testing, skylabs-seo, skylabs-content) — 2026-07-18
- [x] 5 command pipelines in `.claude/commands/` (`/msd-feature`, `/mera-driver-feature`, `/new-endpoint`, `/new-shared-component`, `/skylabs-audit`) — 2026-07-18
- [x] Updated `CLAUDE.md`, `PLANNING.md`, `ARCHITECTURE.md`, `TASK.md` with AI dev team docs — 2026-07-18
