# CLAUDE.md

Guidance for Claude Code when working in this repository.

> Companion docs: **`PLANNING.md`** (scope, stack, conventions), **`ARCHITECTURE.md`**
> (detailed layout + where things go), **`TASK.md`** (what's done / in progress / backlog).
> Read `PLANNING.md` at the start of a session; update `TASK.md` as work completes.

## Repo State

Nx 22.7.5 monorepo (npm). Two frontend apps, two independent backends, six
shared packages.

- **`apps/msd`** — React 19 + Vite, port **4200**. Business: **massage deals** (public storefront + the full RBAC admin console under `/account/*`). Theme: green (`#007C2B`).
- **`apps/mera-driver`** — Angular 21 (standalone) + Tailwind, port **4400**. Business: **driver booking** (same public + admin-console split as msd). Theme: blue (`#1175BC`).
- **`apps/msd-api`** — Express + TypeScript + Prisma + PostgreSQL (db `msd`), port **3333**, all routes under `/api/v1`. MSD's own RBAC + business modules (Customers, Vendors, Orders, Products, Inventory, Reports — business logic is stubbed, RBAC is real).
- **`apps/mera-driver-api`** — Express + TypeScript + Prisma + PostgreSQL (db `mera_driver`), port **3334**, routes mounted at root (no `/api/v1` prefix). MeraDriver's own RBAC + business modules (Drivers, Vehicles, Trips, Attendance, Payments, Reports — business logic stubbed, RBAC real).
- **`packages/shared-ui`** (`@skylabs-monorepo/shared-ui`) — Material 3 web components (Material Web + LIT), theme, React wrappers, test helpers. Presentational only.
- **`packages/shared-types`** — cross-app RBAC domain types (`Role`, `Permission`, `MenuNode`, `BootstrapResponse`, `ApiEnvelope<T>`, …). Types only, no runtime code, no business data.
- **`packages/shared-permissions`** — pure functions `can()`, `filterMenuByPermissions()`, `permissionKeyFor()`.
- **`packages/shared-menu`** — static menu trees `msd-menu.json` / `mera-driver-menu.json` (id/title/icon/route/permissionKey/parent/children/order) + `getMenuForApp()`.
- **`packages/shared-auth`** — auth core + `/react` (msd) and `/angular` (mera-driver) entry points: `AuthProvider`/`AuthService`, `RequireAuth`/`authGuard`, `RequirePermission`/`permissionGuard`, `PermissionButton`/`HasPermissionDirective`, and the "Login As" preview-token flow.
- **`packages/shared-utils`** — small cross-cutting helpers (date formatting, debounce).

The two apps are **different businesses** with **fully independent** backends —
own routes/controllers/services/Prisma schema/database/env per API, never a
shared table or shared identity DB. RBAC is duplicated **by pattern** (same
Prisma schema template, same `shared-auth`/`shared-permissions` packages),
never by shared data. See `ARCHITECTURE.md`.

## Commands

```bash
# Serve (dev)
npx nx serve msd                      # http://localhost:4200
npx nx run mera-driver:serve          # http://localhost:4400
npx nx serve msd-api                  # http://localhost:3333/api/v1 (docs at /docs)
npx nx serve mera-driver-api          # http://localhost:3334 (docs at /docs)

# Build a project (shared-ui/shared-* build first as dependencies)
npx nx build shared-ui
npx nx build msd
npx nx build mera-driver

# Lint / test / build everything we have, in one go
npx nx run-many -t lint test build --projects=shared-ui,shared-types,shared-permissions,shared-menu,shared-auth,shared-utils,msd,mera-driver,msd-api,mera-driver-api

# Single project targets
npx nx run <project>:lint
npx nx run <project>:test             # vitest (msd, shared-*, msd-api, mera-driver-api) / @angular/build:unit-test (mera-driver)
npx nx affected -t build --base=main
npx nx graph

# Prisma (per API — each owns its own schema/migrations/seed)
npx prisma validate --schema=apps/msd-api/prisma/schema.prisma
npx prisma generate --schema=apps/msd-api/prisma/schema.prisma
npx prisma migrate dev --schema=apps/msd-api/prisma/schema.prisma
# same pattern with apps/mera-driver-api/prisma/schema.prisma
```

If pages render unstyled or an import 500s in dev, it's almost always a **stale
`nx serve`** holding the old config — kill it and reserve fresh, don't assume a code bug.

## shared-ui — the design system

- Register all M3 elements once per app: `import '@skylabs-monorepo/shared-ui';`
- Theme: `import '@skylabs-monorepo/shared-ui/theme.css';` + `applyTheme('light' | 'dark', contrast?)`.
- App-shell / auth layout styles: `@skylabs-monorepo/shared-ui/layout.css` (msd imports it in `main.tsx`; mera-driver lists it in `project.json` build `styles`).
- **React (msd)** uses typed wrappers: `import { FilledButton } from '@skylabs-monorepo/shared-ui/react';`
- **Angular (mera-driver)** uses raw `<md-*>` tags; any component using them needs `schemas: [CUSTOM_ELEMENTS_SCHEMA]`.
- Custom in-house components live in `packages/shared-ui/src/components/` (e.g. `sky-badge`, `sky-card`), written in LIT **without decorators** for cross-framework source compatibility.
- **Card components** (compose M3 web components inside, themed by `--md-sys-color-*`, primitive props → same usage in React/Angular):
  - `sky-product-card` — listing card (image, badge, favorite, rating **stars** via `rating`+`reviews` _or_ a **score badge** via `score`+`score-label`, price/discount); `variant="outlined"` for the bordered look.
  - `sky-image-card` — full-bleed image with overlay `label` (+ optional `href`, `ratio`).
  - `sky-category-card` — rounded image + `heading`/`subheading` (+ optional `href`).
  - `sky-info-card` — surface card with an illustration (`media` slot) or `icon` + `heading`/`subheading`.
  - React: `SkyProductCardReact`, `SkyImageCardReact`, `SkyCategoryCardReact`, `SkyInfoCardReact`. Angular: raw `<sky-*-card>` tags.
- **Accordion** (`sky-accordion` + `sky-accordion-item`): expandable card panels with a rotating `md-icon` chevron. Each header is one accessible trigger (`aria-expanded`/`aria-controls`); collapsed bodies are `hidden`. `sky-accordion single` keeps only one item open. React: `SkyAccordionReact`/`SkyAccordionItemReact`; Angular: raw `<sky-accordion>`/`<sky-accordion-item>`.
  - All cards are **fluid** (fill their container — wrap them in a responsive grid/flex), support **`align="left|center|right"`**, and are **semantic + accessible by default**: `figure`/`figcaption` (image & category), `article` + `h3`/`p`, `<img alt>`, `href` renders one labelled stretched link, and `aria` on the rating and favorite button.
- Icons: self-hosted Material Symbols Outlined (the `material-symbols` package, imported in `theme/base.css`). Use `<md-icon>name</md-icon>` and `aria-hidden="true"` when decorative.

### Carousel (Swiper Element)

We do **not** wrap carousels in a custom component — Swiper already ships
framework-agnostic web components (`<swiper-container>` / `<swiper-slide>`), and
slide content is app-specific, so a wrapper would add surface for no reuse.

- **Opt-in registration**: `import '@skylabs-monorepo/shared-ui/carousel';` once on a
  page/component that uses a carousel (separate entry so Swiper's bundle isn't in the
  base bundle). Then use raw `<swiper-container>` / `<swiper-slide>` tags.
- **React (msd)**: tags work in JSX; `apps/msd/src/types/swiper-elements.d.ts` types them.
- **Angular (mera-driver)**: the component needs `schemas: [CUSTOM_ELEMENTS_SCHEMA]`.
- **Theming is automatic**: `theme/base.css` maps `--swiper-theme-color` to
  `--md-sys-color-primary`, so pagination/scrollbar/arrows match each app's brand.
- **Features are attributes** (`slides-per-view="auto"`, `space-between`, `loop`,
  `pagination`, `pagination-type="fraction"`, `scrollbar`, `centered-slides`, …). For
  object params (custom breakpoints) use `init="false"` + property assignment +
  `el.initialize()`. See the showcase in each app for all 10 demoed features.

## Conventions

- **Pages live in each app**, never as shared web components. Reuse happens at the component level (`shared-ui`) and as app-local logic. Compose pages from `shared-ui` pieces.
- Each app owns its **routing, layouts, auth, api client, and models** (logic is app-local, not shared between apps).
- **Accessibility** (WCAG 2.2 AA): semantic landmarks (`<main>`, `<header>`, `<nav>`), labelled controls, `aria-hidden` on decorative icons, `autocomplete` hints on inputs, keyboard-navigable.
- **SEO**: per-route `<title>` (React 19 hoists `<title>`/`<meta>`; Angular uses the route `title`), default `<meta name="description">` in each `index.html`, `noindex` on auth pages.
- Tag projects in `project.json` (`type:app|lib`, `scope:<domain>`) and enforce boundaries in `nx.json`.

## Auth & roles (Dynamic RBAC)

After sign-in (OTP or Google) the user lands on the **account console**
(`/account`), an admin layout shown for every persona. Nothing is hardcoded:
roles, permissions, menus, and dashboard widgets are all database rows, and
what a given user sees is resolved fresh from their granted permissions —
not from a fixed role→page mapping in the frontend.

### Default roles (seeded, both apps' DBs independently)

`super_admin` (flagged `isSuperAdmin`, auto-granted every permission),
`admin`, `customer`, `vendor`, `marketing`, `sales` — all `isSystem: true`
(undeletable). SuperAdmin can create unlimited additional custom roles
(HR, Dispatcher, Warehouse, …) at runtime; nothing about a custom role
requires a code change.

### The permission model

- A **permission** is a `${menuKey}:${action}` pair, e.g. `orders:create`,
  `rbac.roles:view`. `action` is one of 16 fixed kinds (`view create edit
  delete export import approve reject upload download print assign restore
  permanent_delete status_change custom` — see `PermissionAction` in
  `packages/shared-types`).
- `menuKey` comes from the **static** menu tree in
  `packages/shared-menu/src/{msd,mera-driver}-menu.json` — the *only* thing
  that isn't database-driven, per the original spec ("menu structure comes
  from `packages/shared-menu`"). Everything else (which menu items a role
  can see, which CRUD actions it can perform, which dashboard widgets it
  gets) is rows in each API's `Role`/`Permission`/`RolePermission`/
  `DashboardWidget`/`RoleDashboardWidget` tables.
- A menu node is visible to a role iff the role holds `${permissionKey}:view`
  (no separate `RoleMenu` table needed — see `filterMenuByPermissions` in
  `packages/shared-permissions`).

### How login → dashboard actually flows

1. `POST /auth/otp/verify` (or the Google callback) issues a JWT
   (`{ sub, roles: roleKey[], app, iat, exp }`, 15-min access / rotated
   30-day opaque refresh) — **no permissions embedded in the token**.
2. The frontend immediately calls `GET /rbac/bootstrap`, which returns
   `{ user, roles, permissions: string[], menu, dashboardWidgets, preview? }`
   — already filtered server-side for this user. This is the single source
   of truth the UI renders from; it is refetched after every sign-in and
   token refresh, so a SuperAdmin's live role edit reaches affected users
   within one refresh cycle with no code change and no forced re-login.
3. Sidebar renders `bootstrap.menu` directly. Routes/buttons check
   `bootstrap.permissions` via `can()`/`RequirePermission`/`PermissionButton`
   (React) or `AuthService.can()`/`permissionGuard`/`HasPermissionDirective`
   (Angular).
4. **Every API route re-checks the permission server-side** via
   `requirePermission(menuKey, action)` middleware — the frontend guard is
   UX only and is never the security boundary.

### Auth files

| Concern | msd (React) | mera-driver (Angular) |
|---------|-------------|------------------------|
| Auth state + bootstrap | `@skylabs-monorepo/shared-auth/react`'s `AuthProvider`/`useAuth()` | `@skylabs-monorepo/shared-auth/angular`'s `AuthService` (signals) |
| Token storage | inside `shared-auth` (keyed by `appPrefix="msd"`) | inside `shared-auth` (keyed by `appPrefix="mera_driver"`) |
| Auth route guard | `<RequireAuth>` | `authGuard` |
| Permission route guard | `<RequirePermission menuKey action?>` | `permissionGuard` (`data: { permission: { menuKey, action? } }`) |
| Permission button/directive | `<PermissionButton menuKey action?>` | `*appHasPermission="{menuKey,action}"` |
| HTTP token injection | fetch wrapper inside `shared-auth` | `core/auth/auth.interceptor.ts` |
| Dynamic menu | `getMenuForApp('msd')` (server pre-filters into `bootstrap.menu`) | `getMenuForApp('mera-driver')` (same) |
| Sidebar | `app/admin/sidebar.tsx` (renders `bootstrap.menu`) | `app/admin/sidebar/sidebar.ts` (same) |
| Dashboard widgets | `app/dashboard/widget-registry.tsx` (`WIDGET_REGISTRY` keyed by widget `key`) | equivalent local registry in `pages/account/dashboard/` |
| RBAC admin screens | `app/pages/account/{roles,users,audit-logs}/` | `pages/account/administration/{roles,users,audit-logs}/` |

### Backend files (identical pattern in `msd-api` and `mera-driver-api`, independent DBs)

- `middleware/requirePermission.ts` — the *only* permission gate; resolves
  `UserRole → RolePermission → Permission` per request (short-TTL cache).
  **No route ever compares a role name as a string.**
- `routes/rbac.routes.ts` — roles CRUD/clone/status, `GET
  /permissions/catalog` (menu × action matrix with real `Permission.id`s),
  `GET /roles/:id/permissions` (a role's current grants), `PUT
  /roles/:id/permissions`, `PUT /roles/:id/widgets`, users CRUD/status/
  role-assign/session-revoke/OTP-reset/login-history/device-sessions, `GET
  /audit-logs`, `POST /impersonate`, `GET /bootstrap`.
- `prisma/seed.ts` — seeds the 6 default roles + a starter permission set
  walked from that app's `shared-menu` JSON, auto-granting everything to
  the `isSuperAdmin`-flagged role.

### Login As (SuperAdmin role/user preview)

SuperAdmin calls `POST /rbac/impersonate {targetUserId}` → gets back a
short-lived preview JWT (`isPreview: true, impersonatedBy`). The frontend
stashes its real token, swaps in the preview token, and shows a persistent
"Previewing as {name} — Return to SuperAdmin" banner (`useAuth().isPreviewing`
/ `AuthService.isPreviewing()`); clicking it restores the real token. No
`RefreshSession` is created for the impersonated user, so the preview
can't outlive its 15-minute token or leave a lingering session — and the
action is written to `ImpersonationSession` + `AuditLog` for traceability.

To add a role-gated section: add a node to the relevant `shared-menu` JSON
(controls visibility once a role is granted its `:view` permission) + a
route wrapped in `RequirePermission`/`permissionGuard` + a
`requirePermission(menuKey, action)` call on every API route it hits. No
role name ever appears in any of these three places.

## Stack (this workspace — overrides global defaults)

- Web: React 19 + Vite (msd), Angular 21 (mera-driver), TypeScript, Tailwind (mera-driver), Material 3 via `shared-ui`.
- Backend (built, per app — `msd-api`, `mera-driver-api`, never shared): **Express + TypeScript**, **PostgreSQL** (in-house, not Supabase), **Prisma** ORM (pinned `6.19.3` — Prisma 7 dropped `datasource.url` from the schema file, which the singleton-client pattern below relies on), **Zod** + **zod-to-openapi** for validation + spec, `swagger-ui-express` for `/docs`. Each app generates its Prisma client to its own `src/generated/prisma-client` (not the shared `node_modules/@prisma/client` default) so the two independent schemas never clobber each other in this single-`node_modules` monorepo.
- Auth (in-house): JWT + phone/email OTP + Google OAuth (`passport-google-oauth20`).
- CI/CD: GitHub Actions.

## Deployment

Branch flow: `feature/* → develop → release → main`. The two **frontends** deploy
to **two independent Vercel projects** (`apps/msd`, `apps/mera-driver`); each runs
`npx nx-ignore <app>` as its Ignored Build Step, so a push only rebuilds the app(s)
its Nx graph actually affects — `main` never routes which project deploys. `main`
is Production (bought custom domain); `release`/`develop` use Vercel preview URLs.
Versioning is `npx nx release --skip-publish` run on the `release` branch (not
`main`), tagging only changed apps (`msd@x.y.z`, `mera-driver@x.y.z`). The two
Express APIs host **off Vercel** (Railway/Fly — long-running servers). CI gate:
`.github/workflows/ci.yml` runs `nx affected -t lint test build` on every PR.
Full detail (Vercel `vercel.json` per app, dashboard settings, domains, env vars):
see **`DEPLOYMENT.md`**.

## AI Dev Team

This project ships with a set of project-scoped agents, skills, and commands under `.claude/`. They are loaded automatically when Claude Code is opened in this repo.

### Agent routing

| Agent | Call for |
|-------|---------|
| `skylabs-abhi` | Any schema design, Prisma migration, Express route, Zod validation, auth flow (OTP/OAuth/JWT) in either API |
| `skylabs-ravi` | Any React 19 or Angular 21 UI task — pages, components, routing, guards |
| `skylabs-neha` | Design spec before building any new screen or component (60/30/10, M3 tokens, accessibility) |
| `skylabs-dev` | Test cases (before coding), Vitest unit tests, Angular unit tests, Playwright e2e |
| `skylabs-vivek` | SEO meta + JSON-LD + GA4 events before any public page ships; social media copy |
| `skylabs-reena` | Any copywriting, `content.json` updates, blog articles, marketing text |

### Commands (invoke as slash commands)

| Command | What it does |
|---------|-------------|
| `/msd-feature` | Full 6-agent pipeline for a new msd feature (design → API → frontend → tests → SEO → copy) |
| `/mera-driver-feature` | Same pipeline for mera-driver |
| `/new-endpoint` | Build a new API endpoint in msd-api or mera-driver-api (abhi → dev) |
| `/new-shared-component` | Add a new `sky-*` component to shared-ui (neha → ravi → dev) |
| `/skylabs-audit` | Full project audit across all 5 dimensions (code/tests/SEO/content/design) |

### Skills (auto-loaded by each agent)

Skills are reference documents in `.claude/skills/`. Each agent loads only what it needs.

| Skill file | Covers |
|------------|--------|
| `msd-stack.md` | React 19 + Vite file layout, routing, auth context, Vitest config |
| `mera-driver-stack.md` | Angular 21 standalone patterns, routing, auth service, signals |
| `skylabs-auth.md` | JWT, OTP, Google OAuth patterns for both APIs |
| `skylabs-api.md` | Express + Prisma + Zod + OpenAPI conventions |
| `shared-ui-usage.md` | All `sky-*` and `md-*` component usage for both apps |
| `skylabs-testing.md` | Vitest + Playwright config, test templates per framework |
| `skylabs-seo.md` | Per-app SEO, JSON-LD, GA4 event schema, noindex rules |
| `skylabs-content.md` | Voice rules, content.json structure, blog schema |

### Agent handoff format

```
HANDOFF: skylabs-<from> → skylabs-<to>
Task: [one line]
Delivers: [bullet list of what is handed over]
Needs from you: [what the next agent must do]
Constraints: [hard limits]
```

## Adding things

- **New page**: create `apps/<app>/src/app/pages/<name>/`, add it to the route table (`routes.tsx` / `app.routes.ts`) under the right layout; protect with `RequireAuth` (React) / `canActivate: [authGuard]` (Angular).
- **New console (account/admin) page**: put it under `pages/account/`, add a node to that app's `packages/shared-menu` JSON (`permissionKey`, icon, route, order), route it under the admin layout wrapped in `RequirePermission`/`permissionGuard` for that `menuKey`, and gate every API route it calls with `requirePermission(menuKey, action)` server-side. Then have SuperAdmin grant the permission to whichever roles need it via the Role Management screen — no code change required to change who can see it.
- **New shared component**: add to `packages/shared-ui/src/components/` + barrel; add a React wrapper in `src/react.ts`. Use `/new-shared-component` command to run the full pipeline.
- **New app/lib**: `npx nx g @nx/react:app`, `@nx/angular:app`, `@nx/express:app`, or `@nx/js:lib`. Apps under `apps/`, shared code under `packages/`. Current app set is fixed at `msd`, `mera-driver`, `msd-api`, `mera-driver-api` — RBAC/ERP screens belong inside these existing apps' admin areas, not new standalone apps.

## Environment Variables

Each app manages its own `.env.local` (never committed); add `.env.example` when created.
Frontends read the API base from an env var (e.g. `VITE_API_URL`); secrets go in CI/CD env, never in source.

## Notes

- `nx.json` `defaultBase` is `"main"` (matches the active branch) — `nx affected`
  in CI and `nx-ignore` on Vercel both compare against it. See `DEPLOYMENT.md`.
