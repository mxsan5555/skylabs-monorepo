# Architecture

How the monorepo is organised, what belongs where, and how to add the next
pages. Goal: share UI and stay framework-native for pages, so we can scale and
reuse without fighting React or Angular.

## The rule of thumb

- **Reusable, presentational UI → `packages/shared-ui`** (framework-agnostic web components).
- **Pages, routing, auth, data → each app** (`apps/msd` React, `apps/mera-driver` Angular).
- **Backend → one API per app** (`apps/msd-api`, `apps/mera-driver-api`), built later. msd
  (massage deals) and mera-driver (driver booking) are different businesses with different
  domains, data, and logic, so each gets its own API and database. Contracts are mirrored as
  app-local models for now.

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

### `apps/msd-api` and `apps/mera-driver-api` — Express + TypeScript (planned)
One backend per app (separate domains, separate databases). Until they exist,
each frontend's `api` client points at `/api` and models stay app-local (they
will mirror each API's contract).

Recommended stack (team knows Express, is learning OpenAPI — optimised for easy + fast):

- **Express + TypeScript** — scaffold with `npx nx g @nx/express:app apps/<name>-api`.
- **PostgreSQL** (in-house, free) — preferred over MySQL for richer types (JSONB),
  constraints, and full-text search. Each API owns its own database
  (`msd`, `mera_driver`); they never share tables.
- **Prisma** as the ORM — typed client + migrations, very little hand-written SQL,
  so the team moves fast with fewer bugs. Works with Postgres and MySQL.
- **Zod** for request/response validation, and **`zod-to-openapi`** to generate the
  OpenAPI 3 spec from those same Zod schemas — one source of truth, no spec drift,
  and the team picks up OpenAPI naturally as a by-product of validation.
- **`swagger-ui-express`** to serve interactive docs at `/docs` — the fastest way for
  the team to learn OpenAPI by seeing the live spec.
- **Auth** (no Supabase): issue JWTs; phone/email OTP via an SMS/email provider
  (e.g. Twilio / Resend free tiers) with codes stored in the DB; Google sign-in via
  `passport-google-oauth20`. The frontends' existing auth client/context already call
  these endpoints once they exist.

Shared backend infrastructure (error handling, auth middleware, the Zod→OpenAPI
setup) can move into a `packages/api-core` lib later **if** real duplication appears —
not up front. Domain code never gets shared between the two APIs.

## Auth & RBAC — file reference

Both apps implement auth independently (no shared auth package). The patterns are identical
in intent; the implementation is framework-native.

### Auth files

| Concern | msd (`apps/msd/src/`) | mera-driver (`apps/mera-driver/src/app/`) |
|---------|----------------------|------------------------------------------|
| Auth state + roles | `auth/auth-context.tsx` | `core/auth/auth.service.ts` |
| Token persistence | `auth/auth-storage.ts` | inside `auth.service.ts` |
| Auth route guard | `auth/require-auth.tsx` | `core/auth/auth.guard.ts` |
| Role route guard | `auth/require-role.tsx` | `core/auth/role.guard.ts` |
| HTTP token injection | _(none yet — no API)_ | `core/auth/auth.interceptor.ts` |
| Menu config (RBAC) | `app/admin/menu.ts` | `app/admin/menu.ts` |
| Sidebar (role filter) | `app/admin/sidebar.tsx` | `app/admin/sidebar/sidebar.ts` |
| Domain types / roles | `types/index.ts` | `models/index.ts` |

### Role definitions

| App | Roles | Default on login |
|-----|-------|-----------------|
| msd | `user \| admin \| marketing \| sales` | `['user']` |
| mera-driver | `customer \| driver \| admin \| marketing \| sales` | `['customer']` |

### localStorage keys

| Key | App | Holds |
|-----|-----|-------|
| `msd_auth_token` | msd | Bearer token (string) |
| `msd_auth_roles` | msd | `UserRole[]` (JSON) |
| `mera_auth_token` | mera-driver | Bearer token (string) |
| `mera_auth_roles` | mera-driver | `UserRole[]` (JSON) |

### Route protection map

| Route | msd | mera-driver | Allowed roles |
|-------|-----|-------------|---------------|
| `/account/*` | `<RequireAuth>` wraps `<AdminLayout>` | `canActivate: [authGuard]` on `/account` | any authenticated |
| `/account/dashboard` | open (inside auth area) | open (inside auth area) | all |
| `/account/profile` | open (inside auth area) | open (inside auth area) | all |
| `/account/deals` | `<RequireRole roles={['admin']}>` | — | `admin` |
| `/account/bookings` | — | `roleGuard`, `data.roles: ['admin']` | `admin` |
| `/account/promotions` | `<RequireRole roles={['marketing']}>` | `roleGuard`, `data.roles: ['marketing']` | `marketing` |
| `/account/sales` | `<RequireRole roles={['sales']}>` | `roleGuard`, `data.roles: ['sales']` | `sales` |

### Key implementation differences

| Aspect | msd (React) | mera-driver (Angular) |
|--------|-------------|----------------------|
| State mechanism | React Context + `useState` | `signal()` + `computed()` |
| Auth guard style | JSX wrapper `<RequireAuth>` | `canActivate: [authGuard]` |
| Role guard style | JSX wrapper `<RequireRole roles={[...]}>` | `canActivate: [roleGuard], data: { roles: [...] }` |
| HTTP token attachment | _(add interceptor when API is built)_ | `authInterceptor` on `HttpClient` ✅ |

> Guards are **UX only**. Once backends exist, every API endpoint must re-check the
> role from the JWT server-side — the frontend guard is not the security boundary.

## Where the upcoming pages go

`sign-in`, `otp`, `home`, `contact`, `blog`, `blog-detail`, `blog-category`,
`admin`, `user-profile`, `logout`, `404` are built **in each app** under
`pages/`, composed from `shared-ui` components:

| Concern | Lives in | Notes |
| --- | --- | --- |
| Page UI + route | each app `pages/` + route table | framework-native |
| Layout/shell | each app `layouts/` | public / auth / admin shells |
| Buttons, fields, cards, OTP input, blog card | `shared-ui` | reused by both apps |
| Auth state + guards | each app `auth/` / `core/auth/` | `RequireAuth` / `authGuard` |
| API calls + models | each app `api/` + `types/` / `core/` + `models/` | hit its own `*-api` later |
| Theme (brand colors) | each app `assets/theme` + `shared-ui` theme | msd green, mera-driver blue |

Pattern to add a protected page (e.g. profile):
- React: `pages/profile/profile.tsx`, route it wrapped in `<RequireAuth>`.
- Angular: `pages/profile/profile.ts`, route with `canActivate: [authGuard]`.

If a page-level chunk of UI is identical across both apps (e.g. a blog card,
the OTP input group), promote that **piece** to a `shared-ui` component — never
the whole page.
