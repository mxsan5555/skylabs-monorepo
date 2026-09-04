# PLANNING

Project scope, vision, stack, and roadmap for the **skylabs-monorepo**.
For structural detail (folders, where code goes) see `ARCHITECTURE.md`.
For live task status see `TASK.md`.

## Vision

Run two separate products from one monorepo while sharing a single Material 3
design system, so both look on-brand-yet-distinct and the team ships fast
without rebuilding UI per app.

## Products

| App | Tech | Port | Business | Brand theme |
| --- | --- | --- | --- | --- |
| `apps/msd` | React 19 + Vite | 4200 | **Massage deals** | Green (`#007C2B`) |
| `apps/mera-driver` | Angular 21 + Tailwind | 4400 | **Booking drivers** | Blue (`#1175BC`) |

They are **different businesses** (different domains, data, users), so they
share UI but **not** backends, databases, or business logic.

## What is shared vs per-app

- **Shared** (`packages/shared-ui`): Material 3 web components (Material Web + LIT),
  custom components (`sky-badge`, `sky-card`), theme engine (`applyTheme`), fonts,
  app-shell/auth layout CSS, test helpers. Presentational only.
- **Per-app**: pages, routing, layouts, auth flow, API client, domain models,
  state, theme tokens, and (planned) backend + database.

## Stack

- **Frontend**: React 19 + Vite (msd) · Angular 21 standalone + Tailwind (mera-driver) ·
  TypeScript · Material 3 (`@material/web` + `lit`, themed per app).
- **Component consumption**: typed `@lit/react` wrappers in React; raw `<md-*>` +
  `CUSTOM_ELEMENTS_SCHEMA` in Angular. Same components underneath.
- **Backend (planned, one per app)**: Express + TypeScript · PostgreSQL (in-house) ·
  Prisma ORM · Zod + `zod-to-openapi` (validation → OpenAPI spec) · `swagger-ui-express`.
  Chosen because the team knows Express and is learning OpenAPI; no Supabase (cost).
- **Auth (in-house)**: JWT · phone/email OTP (SMS/email provider) · Google OAuth.
- **Tooling**: Nx 22.7.5 (npm) · ESLint · Vitest / Angular unit-test · GitHub Actions.
- **Deployment**: two frontends → two independent **Vercel** projects, self-selecting
  per push via `nx-ignore`; branch flow `feature→develop→release→main`; `nx release`
  for version tags. APIs host off Vercel (Railway/Fly). Full detail: `DEPLOYMENT.md`.

## Access control (RBAC)

One account/admin console (shown after login) serves every persona; **roles**
decide what each sees and can open.

### Roles per app

| App | Roles | Type definition |
|-----|-------|----------------|
| msd | `user`, `admin`, `marketing`, `sales` | `apps/msd/src/types/index.ts` |
| mera-driver | `customer`, `driver`, `admin`, `marketing`, `sales` | `apps/mera-driver/src/app/models/index.ts` |

### What each role sees (sidebar menu)

| Menu item | msd roles | mera-driver roles |
|-----------|-----------|-------------------|
| Dashboard | all | all |
| My Account | all | all |
| Deals | `admin` | — |
| Bookings | — | `admin` |
| Promotions | `marketing` | `marketing` |
| Sales | `sales` | `sales` |

Menu config: `apps/<app>/src/app/admin/menu.ts` — add `{ label, icon, to, roles: [...] }` to `ADMIN_MENU`.

### Auth file map

| Concern | msd | mera-driver |
|---------|-----|-------------|
| Auth state + roles | `auth/auth-context.tsx` (React Context) | `core/auth/auth.service.ts` (signals) |
| Auth route guard | `auth/require-auth.tsx` | `core/auth/auth.guard.ts` |
| Role route guard | `auth/require-role.tsx` | `core/auth/role.guard.ts` |
| HTTP token injection | _(planned with API)_ | `core/auth/auth.interceptor.ts` |

### How access is controlled

- **Visibility**: the sidebar is built from one role-aware menu config — items list
  the roles allowed to see them, and the sidebar filters by the user's roles.
- **Access**: routes are guarded to the same roles (`RequireRole` / `roleGuard`);
  lacking the role redirects to the profile.
- **Boundary**: guards are UX only — each API must re-check the role from the JWT on
  every request once backends exist. See `CLAUDE.md` → "Auth & roles (RBAC)" for full detail.

## AI Dev Team

The project ships with 6 project-scoped AI agents, 8 skill reference docs, and 5 command pipelines — all under `.claude/`. They are loaded automatically in Claude Code sessions.

### Agents

| Agent | Specialty |
|-------|-----------|
| `skylabs-abhi` | Express APIs, Prisma schemas, JWT auth, OTP, Google OAuth |
| `skylabs-ravi` | React 19 (msd) + Angular 21 (mera-driver) frontend |
| `skylabs-neha` | UI/UX design — 60/30/10 rule, M3 tokens, accessibility specs |
| `skylabs-dev` | QA — Vitest, Angular unit tests, Playwright e2e |
| `skylabs-vivek` | SEO/GEO/AEO, GA4/GTM, social media copy |
| `skylabs-reena` | Content — `content.json`, blog posts, marketing copy |

### Commands

| Command | Triggers |
|---------|---------|
| `/msd-feature` | Full pipeline: neha → abhi → ravi → dev → vivek → reena |
| `/mera-driver-feature` | Same pipeline scoped to mera-driver |
| `/new-endpoint` | abhi builds endpoint + dev writes integration tests |
| `/new-shared-component` | neha spec → ravi LIT + React wrapper → dev unit test |
| `/skylabs-audit` | Code + test + SEO + content + design audit across all agents |

Full agent file map: `.claude/agents/` · Full skill file map: `.claude/skills/` · See `ARCHITECTURE.md → .claude/` for the directory layout.

## Conventions (summary)

- Pages are framework-native and app-local; reuse at the component level only.
- WCAG 2.2 AA accessibility and basic SEO (per-route titles, meta description,
  noindex on auth) are baseline requirements, not afterthoughts.
- One source of truth for repeated UI (shared `layout.css`, config-driven menus and
  forms); no abstraction before real duplication appears.
- Keep it simple: no shared backend, no premium services where a free/in-house
  option works.
- Use the AI agent team (above) for all new features — never build outside the
  defined pipeline or bypass a step (e.g. shipping without skylabs-dev tests or
  skylabs-vivek SEO on public pages).

## Roadmap

1. **Foundation** — M3 design system + theming + app scaffolding ✅
2. **Auth screens** — sign-in, OTP (both apps) ✅
3. **Account/admin console** — role-based admin layout + My Account (profile + address CRUD) + role gating ✅
4. **Content pages** — home ✅, then contact, blog, blog-detail, blog-category 🔜
5. **Account extras** — logout from console, admin/marketing/sales feature pages 🔜
6. **Backends** — `apps/msd-api`, `apps/mera-driver-api` (Express + Postgres + Prisma + OpenAPI) ⏳ deferred until pages need real data
7. **Auth integration** — wire OTP/Google + real roles to the backend (replace mock token + demo role switcher) ⏳
8. **Hardening** — tests, error tracking, CI gate + deployment 🔜
   - Deployment wired: two Vercel projects (msd, mera-driver), `nx-ignore` per
     project, `main`=Production, `nx release` on `release`, CI gate on PRs. See
     `DEPLOYMENT.md`. Remaining: e2e tests, error tracking (Sentry).

Current focus: **frontend pages first** (step 4), backends deferred.
