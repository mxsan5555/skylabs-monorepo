# TASK

Task tracking for the skylabs-monorepo. Scope lives in `PLANNING.md`.

**How to use:** when you start a task move it to _In progress_; when done, check it
off under _Completed_ with the date. Add new work to _Backlog_. Keep this file current.

---

## In progress

- _(none — next up: Content pages → contact, then the blog set)_

## Backlog

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
- [ ] e2e tests (Playwright) for the auth flow
- [ ] Error tracking (Sentry free tier)
- [ ] CI gates (GitHub Actions: lint + test + build)
- [ ] `.env.example` per app; deployment (frontends + APIs)
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
