# CLAUDE.md

Guidance for Claude Code when working in this repository.

> Companion docs: **`PLANNING.md`** (scope, stack, conventions), **`ARCHITECTURE.md`**
> (detailed layout + where things go), **`TASK.md`** (what's done / in progress / backlog).
> Read `PLANNING.md` at the start of a session; update `TASK.md` as work completes.

## Repo State

Nx 22.7.5 monorepo (npm). Two frontend apps share one Material 3 design-system
package. Backends are planned but not built yet.

- **`apps/msd`** — React 19 + Vite, port **4200**. Business: **massage deals**. Theme: green (`#007C2B`).
- **`apps/mera-driver`** — Angular 21 (standalone) + Tailwind, port **4400**. Business: **driver booking**. Theme: blue (`#1175BC`).
- **`packages/shared-ui`** (`@skylabs-monorepo/shared-ui`) — Material 3 web components (Material Web + LIT), theme, React wrappers, test helpers. Presentational only.

The two apps are **different businesses** → each will get its **own** Express + Postgres
API and database (no shared backend). See `ARCHITECTURE.md`.

## Commands

```bash
# Serve (dev)
npx nx serve msd                      # http://localhost:4200
npx nx run mera-driver:serve          # http://localhost:4400

# Build a project (shared-ui builds first as a dependency of the apps)
npx nx build shared-ui
npx nx build msd
npx nx build mera-driver

# Lint / test / build everything we have, in one go
npx nx run-many -t lint test build --projects=shared-ui,msd,mera-driver

# Single project targets
npx nx run <project>:lint
npx nx run <project>:test             # vitest (msd, shared-ui) / @angular/build:unit-test (mera-driver)
npx nx affected -t build --base=main
npx nx graph
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

## Auth & roles (RBAC)

After sign-in (OTP) the user lands on the **account console** (`/account`), an admin
layout shown for every persona. The same layout serves every role — what each persona
sees and can open is driven by **roles**.

### Role definitions

| Role | msd (massage deals) | mera-driver (driver booking) |
|------|--------------------|-----------------------------|
| Base user | `user` | `customer` or `driver` |
| Staff | `admin`, `marketing`, `sales` | `admin`, `marketing`, `sales` |
| Type definition | `apps/msd/src/types/index.ts` | `apps/mera-driver/src/app/models/index.ts` |
| Default on login | `['user']` | `['customer']` |

### Auth files

| Concern | msd | mera-driver |
|---------|-----|-------------|
| Auth state | `auth/auth-context.tsx` (React Context + useState) | `core/auth/auth.service.ts` (Angular signals) |
| Token storage | `auth/auth-storage.ts` | inside `auth.service.ts` |
| Auth route guard | `auth/require-auth.tsx` (`<RequireAuth>`) | `core/auth/auth.guard.ts` (`authGuard`) |
| Role route guard | `auth/require-role.tsx` (`<RequireRole>`) | `core/auth/role.guard.ts` (`roleGuard`) |
| HTTP token injection | _(not yet — no API calls)_ | `core/auth/auth.interceptor.ts` |
| Menu config | `app/admin/menu.ts` | `app/admin/menu.ts` |
| Sidebar (role filter) | `app/admin/sidebar.tsx` | `app/admin/sidebar/sidebar.ts` |

### localStorage keys

| Key | App | Holds |
|-----|-----|-------|
| `msd_auth_token` | msd | Bearer token |
| `msd_auth_roles` | msd | `UserRole[]` (JSON) |
| `mera_auth_token` | mera-driver | Bearer token |
| `mera_auth_roles` | mera-driver | `UserRole[]` (JSON) |

### Route protection

| Route | msd guard | mera-driver guard | Allowed roles |
|-------|-----------|-------------------|---------------|
| `/account/*` (all) | `<RequireAuth>` | `canActivate: [authGuard]` | any authenticated |
| `/account/dashboard` | _(none extra)_ | _(none extra)_ | all roles |
| `/account/profile` | _(none extra)_ | _(none extra)_ | all roles |
| `/account/deals` | `<RequireRole roles={['admin']}>` | — | `admin` |
| `/account/bookings` | — | `roleGuard`, `data.roles: ['admin']` | `admin` |
| `/account/promotions` | `<RequireRole roles={['marketing']}>` | `roleGuard`, `data.roles: ['marketing']` | `marketing` |
| `/account/sales` | `<RequireRole roles={['sales']}>` | `roleGuard`, `data.roles: ['sales']` | `sales` |

### How it works

1. **The user carries `roles: UserRole[]`.** Real roles come from the backend JWT later;
   until then they're stored in localStorage and can be swapped with the sidebar
   **"View as (demo)"** switcher to preview each persona. Remove the switcher once the
   backend assigns roles.

2. **Show / hide nav items by role** — one config drives the sidebar. Each item lists the
   roles allowed to see it; the sidebar filters by the user's roles.
   - To add a sidebar item: add `{ label, icon, to, roles: [...] }` to `ADMIN_MENU`.

3. **Protect the route** (don't rely on the hidden menu alone) — guard the route to the
   same roles. A user lacking the role is redirected to `/account/profile`.
   - React: `<RequireRole roles={['admin']}><Page/></RequireRole>`
   - Angular: `canActivate: [roleGuard], data: { roles: ['admin'] }`

4. **Security boundary**: these guards are **UX only**. When the per-app Express API
   exists, **every request must re-check the role from the JWT** server-side. Never gate
   sensitive data on the frontend alone.

To add a role-gated section: add a `MenuItem` with its `roles` (controls visibility) +
a route with the matching `RequireRole`/`roleGuard` (controls access). Same role list in
both places.

## Stack (this workspace — overrides global defaults)

- Web: React 19 + Vite (msd), Angular 21 (mera-driver), TypeScript, Tailwind (mera-driver), Material 3 via `shared-ui`.
- Backend (planned, per app): **Express + TypeScript**, **PostgreSQL** (in-house, not Supabase), **Prisma** ORM, **Zod** + **zod-to-openapi** for validation + spec, `swagger-ui-express` for `/docs`.
- Auth (in-house): JWT + phone/email OTP + Google OAuth (`passport-google-oauth20`).
- CI/CD: GitHub Actions.

## Adding things

- **New page**: create `apps/<app>/src/app/pages/<name>/`, add it to the route table (`routes.tsx` / `app.routes.ts`) under the right layout; protect with `RequireAuth` (React) / `canActivate: [authGuard]` (Angular).
- **New console (account/admin) page**: put it under `pages/account/`, render it inside `AdminPage` (centered title + subtitle), route it under the `AdminLayout` area, and add a `MenuItem` to `ADMIN_MENU` with its `roles`. Gate it with `RequireRole`/`roleGuard` (see Auth & roles above).
- **New shared component**: add to `packages/shared-ui/src/components/` + barrel; add a React wrapper in `src/react.ts`.
- **New app/lib**: `npx nx g @nx/react:app`, `@nx/angular:app`, `@nx/express:app`, or `@nx/js:lib`. Apps under `apps/`, shared code under `packages/`.

## Environment Variables

Each app manages its own `.env.local` (never committed); add `.env.example` when created.
Frontends read the API base from an env var (e.g. `VITE_API_URL`); secrets go in CI/CD env, never in source.

## Notes

- `nx.json` `defaultBase` is `"master"` but the active branch is `main` — update it if `nx affected` is used in CI.
