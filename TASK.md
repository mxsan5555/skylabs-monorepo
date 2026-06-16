# TASK

Task tracking for the skylabs-monorepo. Scope lives in `PLANNING.md`.

**How to use:** when you start a task move it to _In progress_; when done, check it
off under _Completed_ with the date. Add new work to _Backlog_. Keep this file current.

---

## In progress

- _(none — next up: Content pages → blog set or contact/profile)_

## Backlog

### Content pages — both apps (`pages/` + route)
- [ ] Contact page
- [ ] Blog (list + categories nav)
- [ ] Blog detail
- [ ] Blog category (filtered list)

### Account & admin — both apps
- [ ] User profile (protected: `RequireAuth` / `authGuard`)
- [ ] Logout (clear session, redirect)
- [ ] Admin panel (protected; likely its own `admin-layout`)

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

### Quality passes
- [x] Accessibility: landmarks, labelled controls, `aria-hidden` icons, `autocomplete`, semantic destination pill
- [x] SEO: per-route titles, default meta description, `noindex` on auth pages
- [x] DRY: shared `layout.css`, shared test setup, removed duplication

### Docs
- [x] `ARCHITECTURE.md`, `PLANNING.md`, `TASK.md`, updated `CLAUDE.md`
