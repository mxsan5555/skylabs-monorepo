# Monorepo architecture

Shared layer for both apps. App-specific design lives in `docs/msd/ARCHITECTURE.md` and
`docs/mera-driver/ARCHITECTURE.md`.

## 1. Rule of thumb

- **Two businesses, one codebase.** msd (massage deals) and mera-driver (driver booking) share UI
  code and RBAC code, never data. Each has its own API, Prisma schema, database, env and deploy.
- **Reusable presentational UI goes to `packages/shared-ui`** (LIT web components on Material
  Web). It stays app-neutral: only components both apps could use. A new option on a shared
  component must leave its default rendering unchanged.
- **App layout pieces stay in the app** (`apps/<app>/src/app/components/`): page bands, grids,
  toolbars, filter panels.
- **Pages are never shared.** A page owns routing, guards, data fetching and prerender, which are
  framework-specific. Reuse happens one level down, at the component level.
- **RBAC code (not data) is shared** in `packages/shared-types`, `shared-permissions`,
  `shared-menu`, `shared-auth`, `shared-utils`.
- **Each admin console lives inside its app** under `pages/account/`. A separate `-admin` app was
  tried and reverted.

## 2. Projects

| Project | Stack | Port | Notes |
|---|---|---|---|
| `apps/msd` | React 19 + Vite | 4200 | Storefront + admin console, prerendered public pages |
| `apps/mera-driver` | Angular 21 standalone + Tailwind | 4400 | Public site, `/ride/*` booking UI, driver/customer portals, admin console |
| `apps/msd-api` | Express + TypeScript + Prisma + PostgreSQL (db `msd`) | 3333 | Routes under `/api/v1`, docs at `/docs` |
| `apps/mera-driver-api` | same stack (db `mera_driver`) | 3334 | Routes at root, docs at `/docs` |
| `packages/shared-ui` | LIT + Material Web | - | Design system, theme, React wrappers, test polyfills |
| `packages/shared-types` | TypeScript | - | `Role`, `Permission`, `PermissionAction`, `MenuNode`, `BootstrapResponse`, `ApiEnvelope<T>`; types only |
| `packages/shared-permissions` | TypeScript | - | `can()`, `filterMenuByPermissions()`, `permissionKeyFor()` |
| `packages/shared-menu` | JSON + TS | - | `msd-menu.json`, `mera-driver-menu.json`, `getMenuForApp()` |
| `packages/shared-auth` | TS, `/react`, `/angular` | - | Token storage, bootstrap fetch, guards, permission button/directive, "Login As" |
| `packages/shared-utils` | TS | - | `formatDateTime()`, `debounce()` |

### 2.1 `packages/shared-ui`

```
src/
  material/      Material Web (M3) element registration (all 15 groups)
  components/    In-house LIT components (written without decorators):
                 cards: sky-product-card, sky-image-card, sky-category-card, sky-info-card, sky-card
                 M3 surfaces (m3-surface.ts vocabulary): sky-image, sky-tile-card, sky-feature-card, sky-cta-banner
                 inputs: sky-action-field, sky-search-bar
                 other: sky-accordion, sky-badge (variant or tonal `status`), sky-data-table, sky-snackbar
  react.ts       Typed React wrappers
  carousel.ts    Opt-in Swiper Element registration
  theme/         applyTheme(), base.css (tokens, self-hosted Material Symbols + Roboto), layout.css
  testing/       installMaterialJsdomPolyfills()
```

Usage rules for every component (props, React vs Angular, carousel, theming) are in `CLAUDE.md`
under "shared-ui". That section is the component reference; this file does not repeat it.

### 2.2 API pattern (both APIs, independent copies)

```
apps/<api>/src/
  routes/        One router per resource; every business route calls requirePermission(menuKey, action)
  services/      Business logic; routes call services only
  middleware/    authenticate, requirePermission (the only permission gate), validate, errorHandler
  schemas/       Zod schemas, registered with zod-to-openapi
  lib/           prisma singleton, jwt, passport, helpers
  openapi/       OpenAPI registry served at /docs
apps/<api>/prisma/
  schema.prisma, migrations/, seed.ts     each API owns its own
```

- **Prisma** is pinned to `6.19.3` (Prisma 7 dropped `datasource.url` from the schema file). Each
  API generates its client into its own `src/generated/prisma-client`, so the two schemas never
  clobber each other in the single `node_modules`.
- **Validation:** Zod for request bodies, query and params; `zod-to-openapi` builds the OpenAPI 3
  document from the same schemas; `swagger-ui-express` serves it at `/docs`.
- **Auth (in-house, no Supabase):** JWT access token (15 min) plus a rotated opaque refresh token
  (30 days); phone/email OTP (hashed, attempt-limited, no user enumeration); Google sign-in via
  `passport-google-oauth20`.
- **RBAC tables** (same shape in both schemas): `User`, `Role` (`isSystem`, `isSuperAdmin`,
  `isActive`), `Permission` (`menuKey` + `action`, unique key), `RolePermission`, `UserRole`,
  `DashboardWidget`, `RoleDashboardWidget`, `OtpChallenge`, `RefreshSession`, `AuditLog`,
  `LoginHistory`, `ImpersonationSession`. mera-driver also has `UserPermissionOverride`.

## 3. Dynamic RBAC (both apps)

Nothing about roles, permissions, menus or widgets is hardcoded. Roles, grants and widgets are
rows in each API's own database; only the menu structure is static JSON in `packages/shared-menu`.

### 3.1 Request flow

1. Sign in (OTP or Google) issues a JWT `{ sub, roles: roleKey[], app, iat, exp }`. No permissions
   are in the token.
2. The frontend calls `GET /rbac/bootstrap` and receives
   `{ user, roles, permissions: string[], menu, dashboardWidgets, preview? }`, already filtered for
   the caller. It is refetched after every sign-in and token refresh.
3. The sidebar renders `bootstrap.menu` as is. Routes and buttons check `bootstrap.permissions`
   via `can()` / `RequirePermission` / `PermissionButton` (React) or `AuthService.can()` /
   `permissionGuard` / `HasPermissionDirective` (Angular).
4. **Every API route re-checks the permission** with `requirePermission(menuKey, action)`. The
   frontend checks are UX only, never the security boundary.

A permission is `${menuKey}:${action}`. `action` is one of 16 fixed values (`view create edit
delete export import approve reject upload download print assign restore permanent_delete
status_change custom`). A menu node is visible when the caller holds `${permissionKey}:view`, or
when one of its children is visible.

**No file compares a role name.** If you want `if (role === 'admin')`, a `menuKey:action` pair is
missing; add it instead. `Role.isSuperAdmin` is the only flag that grants everything.

### 3.2 File reference

| Concern | msd (React) | mera-driver (Angular) |
|---|---|---|
| Auth state + bootstrap | `shared-auth/react` `AuthProvider` / `useAuth()` (`appPrefix="msd"`) | `shared-auth/angular` `AuthService` (`appPrefix: 'mera_driver'`) |
| Auth route guard | `<RequireAuth>` | `authGuard` |
| Permission route guard | `<RequirePermission menuKey action?>` | `permissionGuard`, `data: { permission: { menuKey, action? } }` |
| Permission button | `<PermissionButton menuKey action?>` | `*appHasPermission="{menuKey, action}"` |
| HTTP token injection | fetch wrapper in `shared-auth` | `core/auth/auth.interceptor.ts` |
| Sidebar | `app/admin/sidebar.tsx` | `app/admin/sidebar/sidebar.ts` |
| Dashboard widgets | `app/dashboard/widget-registry.tsx` | registry under `pages/account/dashboard/` |
| Role, user, audit screens | `pages/account/{roles,users,audit-logs}/` | `pages/account/administration/{roles,users,audit-logs}/` |
| API permission gate | `apps/msd-api/src/middleware/requirePermission.ts` | `apps/mera-driver-api/src/middleware/requirePermission.ts` |
| Seed (roles, permissions, widgets) | `apps/msd-api/prisma/seed.ts` (`EXTRA_ACTIONS_BY_MENU_KEY`) | `apps/mera-driver-api/prisma/seed.ts` (`actionsForNode`) |

### 3.3 Login As (preview)

A Super Admin calls `POST /rbac/impersonate { targetUserId }` and gets a short-lived preview JWT
(`isPreview`, `impersonatedBy`). The frontend stashes the real token, shows a "Previewing as ...
Return to SuperAdmin" banner, and hides the Administration menu group. No refresh session is
created for the target, so the preview cannot outlive its 15-minute token. The action is written
to `ImpersonationSession` and `AuditLog`.

### 3.4 How to change things

| You want to | Touch |
|---|---|
| Rename, reorder or re-icon a sidebar item | menu JSON only; rebuild the API (the JSON is bundled into `dist`) |
| Add a sidebar item for an existing permission | menu JSON |
| Add a new permission or menu node | menu JSON + that API's `seed.ts` action map, then re-run the seed |
| Add a whole module | menu JSON + `seed.ts` + `routes/<name>.routes.ts` registered in `app.ts` + frontend route wrapped in the permission guard + page |
| Change a role's grants | Role Management screen (audited), or the seed defaults for fresh installs |
| Add a default role | `ROLES` in that API's `seed.ts` |
| Add a dashboard widget | widget list in `seed.ts` + a component keyed by the same `key` in the frontend registry |

New module checklist: pick the `menuKey`; add the menu node; add non-default actions to the seed
action map; build the route with `requirePermission` on every handler; re-run the seed; rebuild
the API; add the guarded frontend route and page; check as Super Admin; grant to the roles that
need it; check as that role ("Login As"); write route tests (401, 403, 200) and component tests.

Super Admin gets new permissions **at seed time** (`grantAllPermissionsToSuperAdmins` rebuilds
its grants from every `Permission` row). A new permission that was never seeded returns 403 even
for Super Admin.

### 3.5 When a rebuild, restart, migration or seed is needed

| Change | Rebuild API | Migrate | Re-seed | Frontend |
|---|:-:|:-:|:-:|---|
| Menu JSON rename or reorder | yes | no | no | fresh bootstrap (sign in again) |
| Menu JSON new node / new `permissionKey` | yes | no | yes | fresh bootstrap + grant the role |
| `schema.prisma` change | yes | yes (new migration) | if the seed reads it | - |
| `seed.ts` defaults | no | no | yes | fresh bootstrap |
| Route, service, middleware code | yes (`nx serve` watches) | no | no | - |
| Role grants in the UI | no | no | no | fresh bootstrap for that role |

### 3.6 Troubleshooting "menu change not visible"

1. Edited the right file (`msd-menu.json` or `mera-driver-menu.json`)?
2. Rebuilt and restarted the API? A running `dist` still serves the old JSON. A stale `nx serve`
   is the usual cause of unstyled pages or 500s in dev too.
3. New `permissionKey`: re-ran the seed?
4. `curl <api>/rbac/bootstrap -H "Authorization: Bearer <token>"`: if the `menu` is right, sign in
   again on the frontend; if not, go back to steps 2 and 3.
5. Does the role hold `${permissionKey}:view`? Check Role Management or
   `GET /rbac/roles/:id/permissions`.
6. Right base URL? msd `VITE_API_URL` = `http://localhost:3333/api/v1`; mera-driver
   `environment.apiUrl` = `http://localhost:3334` (no `/api/v1`).

Windows: `prisma generate` fails with `EPERM ... query_engine-windows.dll.node` while any server
holds the DLL. Stop the process on that API's port and retry.

### 3.7 Files never edited by hand

| Path | Why |
|---|---|
| `apps/*/src/generated/prisma-client/**` | Output of `prisma generate` |
| `apps/*/prisma/migrations/*/migration.sql` once applied anywhere | History is immutable; add a new migration |
| Role-name checks inside `requirePermission.ts` or any route | Breaks the "no hardcoded roles" rule |
| `.env.local` | Never committed; real values per developer |
| `dist/` | Build output |

Changes in `packages/shared-*` reach both APIs and both frontends at once; treat them as
repo-wide changes.

## 4. AI dev team (`.claude/`)

Project agents (`skylabs-abhi` API/DB, `skylabs-ravi` frontend, `skylabs-neha` design,
`skylabs-dev` QA, `skylabs-udaya` SEO/analytics/social, `skylabs-reena` content), skills and
slash commands (`/msd-feature`, `/mera-driver-feature`, `/new-endpoint`, `/new-shared-component`,
`/skylabs-audit`). Routing table: `CLAUDE.md` "AI Dev Team".
