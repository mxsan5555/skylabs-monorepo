# Developer Process — Dynamic RBAC System

A step-by-step handbook for working on the Role-Based Access Control system in this
repository, written so a developer can extend it without needing an AI assistant.

> Companion docs: `CLAUDE.md` (repo conventions), `ARCHITECTURE.md` (project layout).
> This document is specifically about the **dynamic RBAC** system: roles, permissions,
> the sidebar menu, dashboard widgets, and how they connect across the two APIs and two
> frontends.

---

## 1. Overall architecture

```
                    packages/shared-types        <- TS contracts (Role, Permission, MenuNode, BootstrapResponse, ...)
                    packages/shared-permissions   <- pure functions: can(), filterMenuByPermissions()
                    packages/shared-menu          <- STATIC menu structure (msd-menu.json / mera-driver-menu.json)
                    packages/shared-auth          <- /react and /angular: AuthProvider/AuthService, guards, directives
                              |
        -----------------------------------------------------
        |                                                   |
     apps/msd-api (port 3333, /api/v1 prefix)      apps/mera-driver-api (port 3334, root)
     own Postgres DB "msd"                          own Postgres DB "mera_driver"
     own prisma/schema.prisma, migrations, seed.ts  own prisma/schema.prisma, migrations, seed.ts
        |                                                   |
     apps/msd (React 19, port 4200)                 apps/mera-driver (Angular 21, port 4400)
     admin console under src/app/pages/account/     admin console under src/app/pages/account/
```

**Nothing about roles/permissions/menus/widgets is shared as data between the two
businesses.** `msd-api` and `mera-driver-api` each have their own Postgres database, their
own `Role`/`Permission`/`User` tables, and their own seed data. What's shared is **code**
(the four `packages/shared-*` libraries above) — the same logic, applied independently to
two unrelated datasets.

The one thing that is genuinely static (not database-driven) is the **menu structure** —
`packages/shared-menu/src/msd-menu.json` and `mera-driver-menu.json`. Everything else
(which roles exist, which permissions a role holds, which dashboard widgets it sees) is
rows in each API's own database.

### Request flow, end to end

1. User signs in (OTP or Google) → API issues a JWT: `{ sub: userId, roles: string[]
   (role keys), app: 'msd' | 'mera-driver', iat, exp }`. **No permissions are embedded in
   the token** — only role keys.
2. Frontend immediately calls `GET /rbac/bootstrap` with that token. The API resolves the
   caller's roles → permissions → filtered menu → dashboard widgets, and returns:
   ```ts
   interface BootstrapResponse {
     user: { id, name, email, phone, status };
     roles: { id, key, name, isSuperAdmin }[];
     permissions: string[];       // flattened "${menuKey}:${action}" keys
     menu: MenuNode[];            // ALREADY filtered — only nodes the caller can see
     dashboardWidgets: { key, title, order }[];
     preview?: { isPreview: true; impersonatedBy: string };
   }
   ```
3. The frontend stores this once per session (in `AuthProvider`'s React state / Angular
   `AuthService`'s signals) and renders everything from it — sidebar, routes, buttons,
   dashboard — without re-deriving access itself.
4. **Every API route re-checks the permission on every request** via the
   `requirePermission(menuKey, action)` middleware — the frontend's use of `bootstrap` is
   a UX convenience only, never the security boundary.

---

## 2. How the sidebar is generated

The sidebar is **not** hand-coded per app. The flow is:

1. `packages/shared-menu/src/msd-menu.json` (and `mera-driver-menu.json`) define the full,
   static tree — every possible menu node, whether or not the current user can see it:
   ```json
   {
     "id": "customers",
     "title": "Customers",
     "icon": "group",
     "route": "/account/customers",
     "permissionKey": "customers",
     "parent": null,
     "order": 2
   }
   ```
2. The backend (`GET /rbac/bootstrap`, built in each API's `src/services/bootstrap.service.ts`
   or equivalent) calls `getMenuForApp('msd' | 'mera-driver')` from
   `packages/shared-menu/src/index.ts`, then `filterMenuByPermissions(menu, permissions)`
   from `packages/shared-permissions/src/index.ts`. That function keeps a node only if the
   caller holds `${node.permissionKey}:view`, **or** at least one of its children survives
   (so a parent group isn't hidden just because it has no route of its own — e.g.
   "Administration" stays visible if the caller can see "Role Management" underneath it).
3. The already-filtered `menu` array comes back in the bootstrap response.
4. The frontend sidebar renders it directly:
   - React: `apps/msd/src/app/admin/sidebar.tsx` — walks `useAuth().bootstrap.menu`
     recursively.
   - Angular: `apps/mera-driver/src/app/admin/sidebar/sidebar.ts` — walks
     `authService.bootstrap()?.menu` the same way.

**The sidebar never re-implements permission logic itself.** If a node is in
`bootstrap.menu`, it's visible; if not, it isn't. There is no separate "hide this menu
item for this role" config anywhere in either frontend app.

---

## 3. How `/rbac/bootstrap` is used

| Endpoint | msd-api | mera-driver-api |
|---|---|---|
| Bootstrap | `GET /api/v1/rbac/bootstrap` | `GET /rbac/bootstrap` |

Called by `@skylabs-monorepo/shared-auth`'s core (`packages/shared-auth/src/index.ts`,
`fetchBootstrap()`), which both `AuthProvider` (React) and `AuthService` (Angular) call
automatically:

- Right after a successful `signIn(accessToken)` call (OTP verify or Google callback).
- On every app load, if a valid token is already in storage.
- Whenever `refreshBootstrap()` (React: `useAuth().refreshBootstrap()`; Angular:
  `authService.refreshBootstrap()`) is called explicitly — e.g. after a "Login As" swap.

It is **not** polled or auto-refreshed on a timer. If a SuperAdmin changes a role's
permissions while a user of that role is already logged in, that user sees the change on
their **next** login or token refresh — not instantly. This is a deliberate simplicity
trade-off (see `docs/` design notes / commit history for `packages/shared-auth`).

---

## 4. How permissions control menus, routes, buttons, and dashboard widgets

Everything keys off the same string: **`${menuKey}:${action}`**, built by
`permissionKeyFor(menuKey, action)` in `packages/shared-permissions/src/index.ts`. `action`
is one of the 16 values in `PermissionAction` (`packages/shared-types/src/index.ts`):
`view create edit delete export import approve reject upload download print assign
restore permanent_delete status_change custom`.

| Surface | Mechanism | File |
|---|---|---|
| Sidebar visibility | `filterMenuByPermissions` server-side, see §2 | `packages/shared-permissions/src/index.ts` |
| Route access (React) | `<RequirePermission menuKey="orders" action="view">` | `packages/shared-auth/src/react/require-permission.tsx` |
| Route access (Angular) | `permissionGuard`, `data: { permission: { menuKey, action } }` | `packages/shared-auth/src/angular/permission.guard.ts` |
| Button/action gating (React) | `<PermissionButton menuKey="orders" action="create">` | `packages/shared-auth/src/react/permission-button.tsx` |
| Button/action gating (Angular) | `*appHasPermission="{menuKey:'orders', action:'create'}"` | `packages/shared-auth/src/angular/has-permission.directive.ts` |
| API route protection | `requirePermission(menuKey, action)` middleware | `apps/<api>/src/middleware/requirePermission.ts` |
| Dashboard widgets | `bootstrap.dashboardWidgets` (already filtered to the role) rendered via a local `WIDGET_REGISTRY` map keyed by widget `key` | `apps/msd/src/app/dashboard/widget-registry.tsx`, mera-driver's equivalent under `apps/mera-driver/src/app/pages/account/dashboard/` |

**No file in this repo hardcodes a role name** (`if (role === 'admin')`) to gate anything.
If you ever find yourself writing that, stop — it means a `menuKey`/`action` pair is
missing and should be added instead (see §11).

---

## 5. How to rename a sidebar item

Renaming only changes the **label** — it does not touch permissions.

1. Edit the `title` (and/or `icon`) field in the relevant menu JSON:
   - `packages/shared-menu/src/msd-menu.json` for msd
   - `packages/shared-menu/src/mera-driver-menu.json` for mera-driver
   ```json
   { "id": "customers", "title": "My Customers", ... }
   ```
2. Rebuild/restart the API that serves that menu (it's bundled into the API's webpack
   build at build time — editing the JSON alone does nothing to an already-built `dist/`):
   ```bash
   npx nx build msd-api        # or: npx nx serve msd-api (rebuilds + serves)
   ```
3. The frontend picks up the new title on its next `GET /rbac/bootstrap` call (next login,
   or call `refreshBootstrap()`). No permission change, no seed, no migration needed.

---

## 6. How to add a new sidebar item

Use this when you're adding a link to an **existing** module/page, or a placeholder for a
future one — not a full new module (see §7 for that).

1. Add a node to the menu JSON with a **new, unique `permissionKey`**:
   ```json
   {
     "id": "reports-financial",
     "title": "Financial Reports",
     "icon": "receipt_long",
     "route": "/account/reports/financial",
     "permissionKey": "reports.financial",
     "parent": null,
     "order": 11
   }
   ```
   (Nest it under a parent by setting `"parent": "<parent id>"` and adding it to that
   parent's `children` array instead — see the `masters`/`administration` groups for the
   pattern.)
2. Re-run that API's seed script so a `Permission` row gets created for
   `reports.financial:view` (and any other actions — see §11):
   ```bash
   npx dotenv -e apps/msd-api/.env.local -- npx tsx --tsconfig apps/msd-api/tsconfig.app.json apps/msd-api/prisma/seed.ts
   ```
3. Rebuild/restart the API (§5, step 2).
4. Grant the new permission to whichever roles should see it — via the Role Management
   screen (`/account/administration/roles` in msd, `/administration/roles` in
   mera-driver) once logged in as SuperAdmin, **or** by adding it to
   `grantStarterPermissions`/`grantBaselinePermissions` in `seed.ts` and re-seeding.
   SuperAdmin gets it automatically at seed time — see §13.
5. Add the matching route + page component in the frontend (React: add a `<Route>` in
   `apps/msd/src/app/routes.tsx` wrapped in `<RequirePermission menuKey="reports.financial">`;
   Angular: add a route in `apps/mera-driver/src/app/app.routes.ts` with `canActivate:
   [permissionGuard], data: { permission: { menuKey: 'reports.financial' } }`).

---

## 7. How to add a new module end-to-end (backend + frontend + permissions)

Example: adding a "Vendors" module to `mera-driver` (doesn't exist there today).

**Backend (`apps/mera-driver-api`):**

1. Add the menu node to `packages/shared-menu/src/mera-driver-menu.json` (§6, step 1).
2. If the module needs more than `view` + the default leaf actions (`view/create/edit/delete`),
   add a case for its `permissionKey` in `actionsForNode()` in
   `apps/mera-driver-api/prisma/seed.ts` (msd-api's equivalent is the
   `EXTRA_ACTIONS_BY_MENU_KEY` map in `apps/msd-api/prisma/seed.ts`).
3. Create the route file: `apps/mera-driver-api/src/routes/vendors.routes.ts`, following
   the existing stub pattern (see `drivers.routes.ts`):
   ```ts
   import { Router } from 'express';
   import { authenticate } from '../middleware/authenticate';
   import { requirePermission } from '../middleware/requirePermission';

   const router = Router();
   router.get('/', authenticate, requirePermission('vendors', 'view'), async (_req, res) => {
     res.json({ data: [], error: null });
   });
   export default router;
   ```
4. Register it in `apps/mera-driver-api/src/app.ts` (or `main.ts`):
   `app.use('/vendors', vendorsRoutes);`
5. Add real business logic (Prisma model, service, full CRUD) as a separate concern once
   the permission gate is proven — this repo currently ships several modules as
   permission-gated stubs (`customers`, `orders`, `products`... in msd-api;
   `drivers`, `trips`... in mera-driver-api) precisely so the RBAC gate can be built and
   tested before the business logic exists.
6. Re-run the seed script (§6, step 2), rebuild/restart the API.

**Frontend (`apps/mera-driver`):**

7. Add the route in `apps/mera-driver/src/app/app.routes.ts`:
   ```ts
   { path: 'vendors', loadComponent: () => import('./pages/account/vendors/vendors'), canActivate: [permissionGuard], data: { permission: { menuKey: 'vendors' } } }
   ```
8. Build the page component under `apps/mera-driver/src/app/pages/account/vendors/` (or
   reuse `ModulePlaceholder` — `apps/mera-driver/src/app/pages/account/module-placeholder/`
   — while the real UI isn't built yet).
9. Nothing to touch in the sidebar — it renders from `bootstrap.menu` automatically once
   the permission exists and is granted to a role (§2, §4).

**Grant + verify:**

10. Log in as SuperAdmin, go to Role Management, grant `vendors:view` (and whatever else)
    to the roles that need it.
11. Log in as that role (or use "Login As") and confirm the sidebar item, route, and any
    gated buttons appear.

---

## 8. File-change matrix

| You want to... | Files to touch |
|---|---|
| Rename/reorder/re-icon a sidebar item | `packages/shared-menu/src/{msd,mera-driver}-menu.json` |
| Add a sidebar item for an existing permission | menu JSON only |
| Add a brand-new permission/menu node | menu JSON + that API's `prisma/seed.ts` (action list) |
| Add a whole new module | menu JSON + `prisma/seed.ts` + new `routes/<name>.routes.ts` + register in `app.ts`/`main.ts` + frontend route + frontend page |
| Change which actions a menu item supports | `EXTRA_ACTIONS_BY_MENU_KEY` (msd-api) / `actionsForNode()` (mera-driver-api) in `prisma/seed.ts` |
| Change a role's permission grants (data, not code) | Role Management UI (`PUT /rbac/roles/:id/permissions`), or `grantStarterPermissions`/`grantBaselinePermissions` in `seed.ts` for defaults |
| Add a new default role | the `ROLES` array in `prisma/seed.ts` (both APIs, independently — see §CLAUDE.md's "Default roles" note) |
| Add a dashboard widget | `WIDGETS`/widget list in `prisma/seed.ts` + a component in the frontend's `WIDGET_REGISTRY` keyed by the same `key` |
| Change JWT/session behavior | `apps/<api>/src/services/token.service.ts`, `auth.service.ts` |
| Change how a permission is resolved/cached | `apps/<api>/src/middleware/requirePermission.ts` (and its resolver service) |
| Change SuperAdmin auto-grant behavior | `grantAllPermissionsToSuperAdmins`/`grantAllPermissionsToSuperAdmin` in `prisma/seed.ts` |

---

## 9. Files that should never be hand-modified

| Path | Why |
|---|---|
| `apps/*/src/generated/prisma-client/**` | Auto-generated by `npx prisma generate`. Hand edits are silently overwritten and cause version drift between the schema and the client types. |
| `apps/*/prisma/migrations/<timestamp>_*/migration.sql` (once it has ever been applied to any database) | Migration history is immutable — editing an applied migration desyncs `prisma migrate status` from reality. If the schema needs to change further, create a **new** migration (`npx prisma migrate dev --name <description>`), never edit an old one. |
| `apps/*/src/middleware/requirePermission.ts` — specifically, never add a role-name string comparison inside it | This is the single enforcement point the entire system's "no hardcoded roles" guarantee depends on. Any `role.key === 'admin'`-style check here (or in any route file) reintroduces exactly the hardcoded-role problem this system replaced. |
| `.env.local` (either API) | Never committed (see `.gitignore`); each developer/environment has its own real credentials. Don't put real secrets in `.env.example`. |
| `dist/` (either API or app) | Build output, regenerated by `npx nx build <project>`. |

`packages/shared-types`, `packages/shared-permissions`, `packages/shared-menu`, and
`packages/shared-auth` **can** be modified, but changes ripple into all four apps at
once (two APIs, two frontends) — treat edits there as a coordinated, repo-wide change,
not a local one.

---

## 10. How to add new permissions

A permission is just a `(menuKey, action)` pair that becomes a `Permission` row when the
seed script runs. There are two cases:

**A) A new action on an existing menu node** (e.g. add `export` to `trips` in
mera-driver-api):
```ts
// apps/mera-driver-api/prisma/seed.ts
function actionsForNode(node: MenuNode): PermissionAction[] {
  if (node.children && node.children.length > 0) return GROUP_ACTIONS;
  switch (node.permissionKey) {
    case 'trips':
      return ['view', 'create', 'edit', 'delete', 'export']; // added 'export'
    // ...
  }
}
```
(msd-api's equivalent: add `'trips'` — or whichever `menuKey` — with the extra actions
to the `EXTRA_ACTIONS_BY_MENU_KEY` map in `apps/msd-api/prisma/seed.ts`.)

**B) A permission for a brand-new menu node** — see §6/§7; the node's `permissionKey`
automatically gets a `view` permission (plus whatever's configured in the action map)
the next time seed runs.

Then:
```bash
npx dotenv -e apps/mera-driver-api/.env.local -- npx tsx --tsconfig apps/mera-driver-api/tsconfig.app.json apps/mera-driver-api/prisma/seed.ts
```
This **upserts** — safe to re-run any time, will not duplicate existing rows or wipe
other data.

---

## 11. How to assign permissions to roles

**Preferred (data change, no deploy needed):** log in as SuperAdmin → Role Management
(`/account/administration/roles` in msd, `/administration/roles` in mera-driver) → select
a role → toggle checkboxes in the permission matrix (sourced from `GET
/rbac/permissions/catalog`, which returns real `Permission.id`s) → toggle the pre-checked
state comes from `GET /rbac/roles/:id/permissions` → Save calls `PUT
/rbac/roles/:id/permissions { permissionIds: string[] }`.

**Alternative (code change, for defaults new environments should start with):** edit
`grantStarterPermissions` (msd-api) / `grantBaselinePermissions` (mera-driver-api) in
`prisma/seed.ts`, then re-run seed. Use this for "what should a fresh install look like,"
not for day-to-day permission changes — those belong in the UI so they're auditable
(every permission/role change through the UI writes an `AuditLog` row; direct seed edits
don't).

---

## 12. How SuperAdmin automatically receives new permissions

**This happens at seed time, not automatically at request time.** The mechanism:

```ts
// apps/msd-api/prisma/seed.ts (mera-driver-api's version is grantAllPermissionsToSuperAdmin, same idea)
async function grantAllPermissionsToSuperAdmins(roles, permissionIdByKey) {
  const allPermissionIds = [...permissionIdByKey.values()];
  for (const role of roles.values()) {
    if (!role.isSuperAdmin) continue;           // the ONLY isSuperAdmin check in the whole codebase
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: allPermissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}
```

Every time `seed.ts` runs, it wipes and rebuilds every `isSuperAdmin`-flagged role's
`RolePermission` rows from the **complete current set** of `Permission` rows. So:

- Add a new permission (§10), re-run seed → SuperAdmin has it. ✅
- Add a new permission, **forget to re-run seed** → SuperAdmin does **not** have it yet,
  and will get a 403 on that route until seed runs. This is the single most common
  "why can't even SuperAdmin see my new page" bug — see §14.
- The `isSuperAdmin` flag lives on the `Role` row (`Role.isSuperAdmin: boolean`), set once
  in the `ROLES` seed array — it is a **data flag**, never a hardcoded `role.key ===
  'super_admin'` string check anywhere in application code.

---

## 13. How menu changes appear in the UI

1. Menu JSON edit → requires an API rebuild (it's bundled into the webpack `dist/` at
   build time — see §5).
2. New permission → also requires a seed run (§10) before it exists in the DB at all.
3. Frontend only ever sees the menu via `bootstrap.menu`, fetched once per session. A
   logged-in user will **not** see a menu change until:
   - they log out and back in, or
   - the frontend calls `refreshBootstrap()` (React: `useAuth().refreshBootstrap()`;
     Angular: `authService.refreshBootstrap()`) — currently only wired to fire after a
     "Login As" swap, not on a timer or on role-save.
4. There is deliberately no push/websocket mechanism — this is a simplicity trade-off,
   documented in `packages/shared-auth`'s design notes.

---

## 14. When a rebuild / restart / migration / seed is required

| Change | Rebuild API? | Restart API? | `prisma migrate`? | Re-seed? | Frontend action needed |
|---|:-:|:-:|:-:|:-:|---|
| Menu JSON: rename/reorder/re-icon | ✅ | ✅ | ❌ | ❌ | fresh bootstrap (re-login) |
| Menu JSON: new node, new `permissionKey` | ✅ | ✅ | ❌ | ✅ | fresh bootstrap + role must be granted the new permission |
| `prisma/schema.prisma`: new field/model | ✅ | ✅ | ✅ `migrate dev --name ...` | usually ✅ (if seed references it) | — |
| `prisma/seed.ts`: new default role, starter grants, widgets | ❌ (seed isn't bundled into `dist`, run separately) | ❌ | ❌ | ✅ | fresh bootstrap for affected users |
| Route/service/middleware code | ✅ | ✅ (or `nx serve`'s watcher auto-restarts) | ❌ | ❌ | — |
| Role permission grants via UI | ❌ | ❌ | ❌ | ❌ | fresh bootstrap for that role's users |
| Frontend RBAC UI code | — | `nx serve` hot-reloads automatically | — | — | — |

Commands used throughout this repo (msd-api shown; swap the path for mera-driver-api):
```bash
# Build / serve
npx nx build msd-api
npx nx serve msd-api

# Prisma
npx dotenv -e apps/msd-api/.env.local -- npx prisma migrate dev --schema=apps/msd-api/prisma/schema.prisma --name <description>
npx dotenv -e apps/msd-api/.env.local -- npx prisma generate --schema=apps/msd-api/prisma/schema.prisma
npx dotenv -e apps/msd-api/.env.local -- npx tsx --tsconfig apps/msd-api/tsconfig.app.json apps/msd-api/prisma/seed.ts
```

> **Windows note**: the Prisma query engine DLL (`src/generated/prisma-client/runtime/
> query_engine-windows.dll.node`) gets file-locked by any running server process. If
> `prisma generate` fails with `EPERM: operation not permitted, rename ...`, stop
> whatever's listening on that API's port first (`netstat -ano | grep :3333`, then stop
> that PID), then retry.

---

## 15. Common mistakes and how to debug them

| Symptom | Likely cause | Fix |
|---|---|---|
| New sidebar item never appears, even for SuperAdmin | Seed script wasn't re-run after adding the menu node | Re-run seed (§10) |
| New menu item's Create/Edit/Delete buttons never enable | Only `view` was added to the seed's action map for that `menuKey` | Add the missing actions to `EXTRA_ACTIONS_BY_MENU_KEY`/`actionsForNode`, re-seed |
| 403 Forbidden on an endpoint you just added | Forgot `requirePermission(menuKey, action)` on the route, or the permission doesn't exist yet in the DB | Check the route has the middleware; check `GET /rbac/permissions/catalog` includes it |
| Edited menu JSON but nothing changed in the browser | API wasn't rebuilt (menu.json is bundled at build time), or frontend hasn't fetched a fresh bootstrap | `npx nx build <api>` + restart, then re-login on the frontend |
| SuperAdmin is missing a permission that clearly exists in the catalog | Seed wasn't re-run after the permission was added — SuperAdmin's grants are synced at seed time, not live (§12) | Re-run seed |
| A role you just edited in Role Management doesn't seem to have the new permission | Frontend is still using the bootstrap fetched at login | Log out/in, or trigger a bootstrap refresh |
| `PUT /rbac/roles/:id/permissions` fails or silently no-ops | Sent a fabricated string instead of the real `permissionId` from `GET /rbac/permissions/catalog` | Always read `permissionId` from the catalog response — never construct it client-side |
| A route works in msd but 404s when you copy the pattern to mera-driver | Forgot msd-api is mounted under `/api/v1`, mera-driver-api is mounted at root | `http://localhost:3333/api/v1/...` vs `http://localhost:3334/...` |
| A hardcoded `if (role === 'admin')` shows up in a code review | Someone bypassed the permission system | Replace with a `menuKey:action` permission + `requirePermission`/`RequirePermission`/`can()` check |
| `prisma generate` fails with `EPERM ... query_engine-windows.dll.node` | A running server process has the DLL locked (Windows) | Stop the process on that API's port, retry |

---

## 16. Troubleshooting checklist — "sidebar/menu changes not visible"

Work through these in order:

1. **Confirm you edited the right file.** `packages/shared-menu/src/msd-menu.json` for
   msd, `mera-driver-menu.json` for mera-driver. Not a copy anywhere else.
2. **Rebuild the API.** `npx nx build msd-api` (or `mera-driver-api`). The menu JSON is
   bundled into `dist/` at build time — a running `node dist/apps/msd-api/main.js` from
   before your edit is still serving the old menu.
3. **Restart the API process.** If you were running `npx nx serve <api>`, its file
   watcher should auto-rebuild on save — but confirm by checking the terminal output for
   a fresh "Successfully ran target build" line after your edit. If running the built
   `dist/` directly, you must manually stop and restart it.
4. **If you added a brand-new `permissionKey`, re-run the seed script** (§10). A menu node
   whose permission was never seeded will never appear for anyone, including SuperAdmin.
5. **Check the raw API response**, bypassing the frontend entirely:
   ```bash
   curl http://localhost:3333/api/v1/rbac/bootstrap -H "Authorization: Bearer <token>"
   ```
   If the `menu` array in this response is correct, the problem is frontend-side (stale
   session) — go to step 6. If it's still wrong, the problem is backend-side — go back to
   steps 2–4.
6. **Force a fresh bootstrap on the frontend.** Log out and log back in (simplest), or
   trigger `refreshBootstrap()`/`authService.refreshBootstrap()` from a debugger/console.
7. **Confirm the logged-in user's role actually has `${permissionKey}:view`.** Check via
   the Role Management screen, or:
   ```bash
   curl http://localhost:3333/api/v1/rbac/roles/<roleId>/permissions -H "Authorization: Bearer <superadmin-token>"
   ```
8. **Double-check the base URL/port the frontend is actually calling.** msd:
   `VITE_API_URL` in `apps/msd/.env.local` (should be `http://localhost:3333/api/v1`);
   mera-driver: `environment.apiUrl` in `apps/mera-driver/src/environments/environment.ts`
   (should be `http://localhost:3334`, no `/api/v1`).

---

## 17. Development workflow for a new feature (checklist)

1. Decide the `menuKey` (and `permissionKey`s if adding new actions) for the feature.
2. Add/edit the menu node(s) in `packages/shared-menu/src/{msd,mera-driver}-menu.json`.
3. If it needs non-default actions, update the seed script's action map
   (`EXTRA_ACTIONS_BY_MENU_KEY` / `actionsForNode`).
4. Build the backend route (`apps/<api>/src/routes/<name>.routes.ts`), gated by
   `requirePermission(menuKey, action)` on every handler, registered in `app.ts`/`main.ts`.
5. Re-run that API's seed script.
6. Rebuild/restart the API.
7. Build the frontend route + page, gated by `<RequirePermission>` / `permissionGuard`.
8. Log in as SuperAdmin, confirm the item appears and works (SuperAdmin already has the
   permission from step 5's seed run).
9. Go to Role Management and grant the new permission to whichever other roles need it.
10. Log in as (or "Login As") one of those roles and confirm.
11. Write tests: Supertest for the route (401/403/200 at minimum — see any existing
    `*.routes.test.ts` for the pattern), unit tests for new frontend components, mocking
    `@skylabs-monorepo/shared-auth`'s `useAuth()`/`AuthService`.
12. Never write a role-name string check anywhere in this flow — if you find yourself
    wanting to, it means a permission is missing (§4, §9).

---

## 18. Deploying to production

Full step-by-step guide (first-time Railway/Cloudflare friendly):
**`DEPLOYMENT.md → Deploying msd-api`**. In short:

- **API compute → Railway** (always-on Node): build `npm ci && npx nx build msd-api`,
  start `node dist/apps/msd-api/main.js`, and run `prisma generate` + `prisma migrate
  deploy` on each deploy (using the pinned Prisma 6.19.3 — never bare `npx prisma`,
  which pulls Prisma 7 and errors on `datasource.url`).
- **Database → Neon** Postgres, injected as `DATABASE_URL` on Railway (the same Neon
  store attached to msd's Vercel project — not a new DB).
- **Media files → Cloudflare R2** (Railway's disk is wiped on redeploy). Requires the
  `lib/media-storage.ts` disk→R2 swap + `R2_*` env vars (see DEPLOYMENT.md).
- **Frontend wiring:** set `VITE_API_URL` on the msd Vercel project to the Railway
  origin (`https://<railway-domain>/api/v1`) and redeploy; set `CORS_ORIGIN` on
  Railway to the Vercel domain(s); update the Google OAuth redirect URI.
- Production secrets live only on Railway/Neon/local `.env.local` — never in
  `.env.example` or any committed file.
