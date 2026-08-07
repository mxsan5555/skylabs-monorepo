# Architecture

How the monorepo is organised, what belongs where, and how to add the next
pages. Goal: share UI and stay framework-native for pages, so we can scale and
reuse without fighting React or Angular.

## The rule of thumb

- **Reusable, presentational UI → `packages/shared-ui`** (framework-agnostic web components).
- **Reusable RBAC *code* (not data) → `packages/shared-types`, `shared-permissions`,
  `shared-menu`, `shared-auth`, `shared-utils`** — see the Dynamic RBAC section below.
- **Pages, routing, auth, data, business modules → each app** (`apps/msd` React,
  `apps/mera-driver` Angular). Each app's admin console lives inside that same app
  (`apps/msd/src/app/admin` + `pages/account/`, `apps/mera-driver/src/app/admin` +
  `pages/account/`) — **no separate `-admin` frontend app**. That was tried and reverted:
  the ERP/RBAC screens are just more pages in the existing app, gated by permission like
  everything else.
- **Backend → one API per app** (`apps/msd-api`, `apps/mera-driver-api`), built. msd
  (massage deals) and mera-driver (driver booking) are different businesses with different
  domains, data, and logic, so each gets its own API and database — **fully independent**:
  own routes/controllers/services/Prisma schema/database/env/deployment. Business modules
  (Customers/Vendors/Orders/… for msd-api; Drivers/Vehicles/Trips/… for mera-driver-api)
  are currently permission-gated stub routers; RBAC itself is fully real.

Pages are **not** shared web components. A page owns routing, guards, data
fetching and SSR — all framework-specific. Sharing happens one level down, at
the component and pattern level. Each app composes pages from `shared-ui`.

## Projects

### `packages/shared-ui` — design system (LIT + Material Web)
Presentational only. No routing, no data, no auth.
```
src/
  material/      Material Web (M3) element registration (all 15 groups)
  components/    Custom LIT components (sky-badge, sky-card, sky-product-card,
                 sky-image-card, sky-category-card, sky-info-card, sky-accordion
                 (+ sky-accordion-item) — compose M3 inside)
  react/ (react.ts)  Typed React wrappers for the above
  theme/         applyTheme(), base.css (self-hosted Material Symbols + Roboto)
  testing/       installMaterialJsdomPolyfills() for app unit tests
```
Consumed as: `@skylabs-monorepo/shared-ui` (register elements),
`@skylabs-monorepo/shared-ui/react` (React wrappers),
`@skylabs-monorepo/shared-ui/carousel` (opt-in Swiper Element registration),
`@skylabs-monorepo/shared-ui/theme.css`.

**Carousel** uses Swiper's own web components (`<swiper-container>`/`<swiper-slide>`)
rather than a custom `sky-carousel` — Swiper Element already is the cross-framework
component, and slide content is app-specific. `src/carousel.ts` only calls Swiper's
`register()` (opt-in, separate entry); brand theming is one line in `theme/base.css`
(`--swiper-theme-color` → `--md-sys-color-primary`). Apps compose carousels locally
with raw tags. See `CLAUDE.md` → "Carousel (Swiper Element)".

### `apps/msd` — React (Vite, port 4200)
```
src/
  main.tsx          Bootstraps theme + router
  api/              Fetch-based ApiClient (app-owned)
  auth/             AuthProvider/useAuth, RequireAuth guard, token storage
  types/            Domain models
  app/
    app.tsx         Providers wrap the route tree
    routes.tsx      Central route table
    layouts/        App shells (public-layout; auth/admin layouts later)
    components/      App-specific UI that knows the router/auth (header, footer)
    pages/          One folder per page (home, not-found, showcase, …); each owns its .css
```

### `apps/mera-driver` — Angular (standalone, port 4400)
```
src/
  main.ts           Bootstraps theme + app
  app/
    app.ts          Root shell (<router-outlet>)
    app.config.ts   Providers: router, HttpClient + auth interceptor
    app.routes.ts   Route table (lazy loadComponent)
    core/           Singletons: auth (service/guard/interceptor), api client
    models/         Domain models
    layouts/        App shells (public-layout; auth/admin layouts later)
    shared/         App-specific UI (header, footer)
    pages/          One folder per page (home, not-found, showcase, …); each owns its files
```

### `packages/shared-types`, `shared-permissions`, `shared-menu`, `shared-auth`, `shared-utils` — RBAC code, never data
Scaffolded like `shared-ui` (`type:lib,scope:shared` tags, `@nx/vite:build`, `@nx/vitest:test`).
```
shared-types/        Role, Permission, PermissionAction, MenuNode, WidgetConfig,
                      BootstrapResponse, ApiEnvelope<T>, … — types only, no runtime code
shared-permissions/  can(), filterMenuByPermissions(), permissionKeyFor() — pure functions
shared-menu/         src/msd-menu.json, src/mera-driver-menu.json (static menu structure,
                      the one thing that ISN'T DB-driven) + getMenuForApp()
shared-auth/         src/index.ts (token storage, jwt decode, bootstrap fetch)
                      src/react.ts    → AuthProvider, useAuth, RequireAuth,
                                        RequirePermission, PermissionButton
                      src/angular.ts  → provideSharedAuth, AuthService, authGuard,
                                        permissionGuard, HasPermissionDirective
shared-utils/        formatDateTime(), debounce() — small cross-cutting helpers
```
These packages carry **logic only** — no seeded roles, no permission rows, no menu
*content* beyond the static structure above. Each API's own database is the only
place actual Role/Permission/User rows live; `msd-api` and `mera-driver-api` each
seed their own independently from the same shared-menu JSON.

### `apps/msd-api` and `apps/mera-driver-api` — Express + TypeScript (built)
One backend per app, **fully independent**: own routes/controllers/services/Prisma
schema/database/`.env.local`/deployment. Never share tables, never share a route.

```
apps/<name>-api/src/
├── routes/          One file per resource: auth.routes.ts, rbac.routes.ts, plus a
│                    stub router per business module (customers/vendors/orders/… for
│                    msd-api; drivers/vehicles/trips/… for mera-driver-api)
├── services/        Business logic layer; routes call services only
├── middleware/       authenticate.ts, requirePermission.ts (the only permission
│                    gate — no hardcoded role checks anywhere), validate.ts, errorHandler.ts
├── schemas/         Zod schemas + zod-to-openapi registrations
├── lib/
│   ├── prisma.ts    Prisma client singleton
│   └── jwt.ts, passport.ts, crypto.ts
└── main.ts          App bootstrap, swagger at /docs, starts server

apps/<name>-api/
├── prisma/
│   ├── schema.prisma   RBAC tables + soft-delete/audit conventions (see below)
│   └── seed.ts         6 default roles + starter permission set from shared-menu
└── .env.local          Never committed
```

- **PostgreSQL** — msd-api → db `msd`; mera-driver-api → db `mera_driver`. Never shared.
- **Prisma**, pinned `6.19.3` (Prisma 7 dropped `datasource.url` from the schema file,
  which the classic singleton-client pattern relies on). Each app generates its client
  to its own `src/generated/prisma-client` rather than the shared `node_modules/@prisma/
  client` default, so the two independent schemas can't clobber each other in this
  single-`node_modules` monorepo.
- **Zod** for request/response validation, **`zod-to-openapi`** to generate the OpenAPI
  3 spec from those same Zod schemas, **`swagger-ui-express`** serving it at `/docs`.
- **Auth** (no Supabase): JWT pairs (15-min access / 30-day rotated opaque refresh);
  phone/email OTP (bcrypt-hashed, 5-attempt/10-min-expiry, no user enumeration); Google
  sign-in via `passport-google-oauth20`.
- **RBAC tables** (identical shape in both schemas): `User`, `Role` (`isSystem`/
  `isSuperAdmin`/`isActive` flags), `Permission` (`menuKey`+`action`, unique
  `${menuKey}:${action}` key), `RolePermission`/`UserRole` (join tables), `DashboardWidget`/
  `RoleDashboardWidget`, `OtpChallenge`, `RefreshSession`, `AuditLog`, `LoginHistory`,
  `ImpersonationSession`. Every model: uuid `id`, `createdAt`/`updatedAt`, soft-delete
  `deletedAt` where semantically right (e.g. `User`). All FKs indexed. No business logic
  in DB triggers.

Business-module routes (Customers/Orders/Drivers/Trips/…) currently exist only as
permission-gated stub routers (`GET /` behind `requirePermission(menuKey,'view')`,
returns `[]`) — proving the gate wires up end to end. Building out real business logic
per module is separate, future work; RBAC itself is complete.

## Auth & RBAC — file reference

Both apps consume the **same** `packages/shared-auth` package (via its `/react` and
`/angular` entry points respectively) rather than hand-rolling auth logic — that's the
one thing that *is* shared between the two businesses, since it's pure code, not data
or a session. Each app still keeps its own token, its own bootstrap fetch, its own API
base URL.

### Auth files

| Concern | msd (`apps/msd/src/`) | mera-driver (`apps/mera-driver/src/app/`) |
|---------|----------------------|------------------------------------------|
| Auth state + bootstrap | `shared-auth/react`'s `AuthProvider`/`useAuth()`, wired in `app/app.tsx` (`appPrefix="msd"`) | `shared-auth/angular`'s `AuthService`, provided via `provideSharedAuth({appPrefix:'mera_driver',...})` in `app.config.ts` |
| Token persistence | inside `shared-auth` (`msd_auth_token` / `msd_auth_real_token` during preview) | inside `shared-auth` (`mera_driver_auth_token` / `..._real_token`) |
| Auth route guard | `shared-auth/react`'s `<RequireAuth>` | `shared-auth/angular`'s `authGuard` |
| Permission route guard | `<RequirePermission menuKey="..." action?>` | `permissionGuard`, `data: { permission: { menuKey, action? } }` |
| Permission button/directive | `<PermissionButton menuKey action?>` | `*appHasPermission="{menuKey,action}"` (`HasPermissionDirective`) |
| HTTP token injection | fetch wrapper inside `shared-auth` core | `core/auth/auth.interceptor.ts` (reads token from `AuthService`) |
| RBAC API client | `api/rbac/{client,auth,roles,users,audit-logs}.ts` | `core/rbac/rbac-api.service.ts`, `core/auth/auth-api.service.ts` |
| Menu (dynamic) | `getMenuForApp('msd')` server-filtered into `bootstrap.menu`; `app/admin/menu-utils.ts` for breadcrumb lookup | `getMenuForApp('mera-driver')`, same server-filtered `bootstrap.menu` |
| Sidebar | `app/admin/sidebar.tsx` — renders `bootstrap.menu` directly | `app/admin/sidebar/sidebar.ts` — same |
| Dashboard widgets | `app/dashboard/widget-registry.tsx` (`WIDGET_REGISTRY` keyed by widget `key`) | local registry in `pages/account/dashboard/` |
| Role Management | `app/pages/account/roles/{roles,role-list,permission-matrix,widget-assignments}.tsx` | `pages/account/administration/roles/` |
| User Management | `app/pages/account/users/{users,user-list,role-assignment,login-history-panel,sessions-panel,create-user-dialog}.tsx` | `pages/account/administration/users/` |
| Audit Logs | `app/pages/account/audit-logs/audit-logs.tsx` | `pages/account/administration/audit-logs/` |
| Domain types | `@skylabs-monorepo/shared-types` (`Role`, `Permission`, `BootstrapResponse`, …) — no more app-local `UserRole` union | same |

### Role model

No fixed per-app role union anymore. Both APIs seed the same 6 default role **keys**
(`super_admin`, `admin`, `customer`, `vendor`, `marketing`, `sales` — each app's own DB
row, own permission grants) and SuperAdmin can add unlimited custom roles at runtime in
either app independently via the Role Management screen. What used to be a hardcoded
`UserRole` union + inline `roles: [...]` arrays is now `bootstrap.permissions: string[]`
resolved from the DB per request.

### Route protection map (shape, not a fixed table — every leaf below is one
`RequirePermission`/`permissionGuard` call keyed to that node's `menuKey` from
`packages/shared-menu`)

| Route family | msd | mera-driver |
|---------------|-----|-------------|
| `/account/*` (all) | `<RequireAuth>` wraps `<AdminLayout>` | `canActivate: [authGuard]` on `/account` |
| `/account/dashboard`, `/account/profile` | open (inside auth area, no extra permission) | open (inside auth area, no extra permission) |
| `/account/{customers,vendors,orders,products,inventory,reports}` | `RequirePermission menuKey="<key>"` | n/a (mera-driver's business set is `drivers,vehicles,trips,attendance,payments,reports`) |
| `/account/masters/*` | `RequirePermission menuKey="masters.*"` | `RequirePermission menuKey="masters.*"` |
| `/account/administration/{roles,users,audit-logs}` | `RequirePermission menuKey="rbac.roles\|rbac.users\|rbac.audit-logs"` | same |
| `/account/settings` | `RequirePermission menuKey="settings"` | same |

### Login As / preview

`useAuth().loginAsUser(targetUserId)` / `AuthService.loginAsUser(...)` calls `POST
/rbac/impersonate`, stashes the real token, swaps in the returned preview token, and
`isPreviewing`/`isPreviewing()` drives a banner in the admin layout with a "Return to
SuperAdmin" action (`returnToSuperAdmin()`) that restores it. Both admin layouts hide
the Administration nav group while previewing, on top of the backend's own
`ImpersonationSession`/`AuditLog` trail.

> Every guard/directive above is **UX only**. Every API endpoint re-checks the
> permission from the JWT's roles server-side via `requirePermission` — the frontend
> never is the security boundary.

## `.claude/` — Project AI Dev Team

Project-scoped agents, skills, and commands live here. Claude Code loads them automatically when opened in this repo. Do not delete or move this directory.

```
.claude/
├── settings.local.json          ← project permissions (git restore/rm)
├── agents/                      ← 6 project-specific AI agents
│   ├── skylabs-abhi.md          ← DB + API (Express, Prisma, JWT auth)
│   ├── skylabs-ravi.md          ← Frontend (React 19 + Angular 21)
│   ├── skylabs-neha.md          ← UI/UX design (60/30/10 + M3)
│   ├── skylabs-dev.md           ← QA (Vitest + Playwright + Angular tests)
│   ├── skylabs-vivek.md         ← SEO + GA4 + social media
│   └── skylabs-reena.md         ← Content management
├── skills/                      ← Reference docs agents load on demand
│   ├── msd-stack.md             ← React 19 + Vite patterns, auth, routing
│   ├── mera-driver-stack.md     ← Angular 21 patterns, auth service, signals
│   ├── skylabs-auth.md          ← JWT, OTP, Google OAuth implementation
│   ├── skylabs-api.md           ← Express + Prisma + Zod + OpenAPI patterns
│   ├── shared-ui-usage.md       ← All sky-* and md-* component usage
│   ├── skylabs-testing.md       ← Vitest + Playwright config and templates
│   ├── skylabs-seo.md           ← Per-app SEO, JSON-LD, GA4 events
│   └── skylabs-content.md       ← Voice rules, content.json, blog schema
└── commands/                    ← Slash commands that orchestrate agents
    ├── msd-feature.md           ← /msd-feature — full pipeline for msd
    ├── mera-driver-feature.md   ← /mera-driver-feature — full pipeline for mera-driver
    ├── new-endpoint.md          ← /new-endpoint — API endpoint pipeline
    ├── new-shared-component.md  ← /new-shared-component — shared-ui component pipeline
    └── skylabs-audit.md         ← /skylabs-audit — full project audit
```

See `CLAUDE.md → AI Dev Team` for the agent routing table and command descriptions.

## Where the upcoming pages go

`sign-in`, `otp`, `home`, `contact`, `blog`, `blog-detail`, `blog-category`,
`admin`, `user-profile`, `logout`, `404` are built **in each app** under
`pages/`, composed from `shared-ui` components:

| Concern | Lives in | Notes |
| --- | --- | --- |
| Page UI + route | each app `pages/` + route table | framework-native |
| Layout/shell | each app `layouts/` | public / auth / admin shells |
| Buttons, fields, cards, OTP input, blog card | `shared-ui` | reused by both apps |
| Auth state + guards | `packages/shared-auth` (`/react`, `/angular`) | `RequireAuth`/`RequirePermission` / `authGuard`/`permissionGuard` |
| API calls + models | each app `api/` + `@skylabs-monorepo/shared-types` | hits its own `*-api` (msd → `msd-api`, mera-driver → `mera-driver-api`) |
| Theme (brand colors) | each app `assets/theme` + `shared-ui` theme | msd green, mera-driver blue |

Pattern to add a protected page (e.g. profile):
- React: `pages/profile/profile.tsx`, route it wrapped in `<RequireAuth>`.
- Angular: `pages/profile/profile.ts`, route with `canActivate: [authGuard]`.

If a page-level chunk of UI is identical across both apps (e.g. a blog card,
the OTP input group), promote that **piece** to a `shared-ui` component — never
the whole page.
