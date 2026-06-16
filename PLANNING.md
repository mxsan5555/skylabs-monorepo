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

## Conventions (summary)

- Pages are framework-native and app-local; reuse at the component level only.
- WCAG 2.2 AA accessibility and basic SEO (per-route titles, meta description,
  noindex on auth) are baseline requirements, not afterthoughts.
- Keep it simple: no shared backend, no premium services where a free/in-house
  option works, no abstraction before real duplication appears.

## Roadmap

1. **Foundation** — M3 design system + theming + app scaffolding ✅
2. **Auth screens** — sign-in, OTP (both apps) ✅
3. **Content pages** — home ✅, then contact, blog, blog-detail, blog-category 🔜
4. **Account/admin** — user profile, logout, admin panel 🔜
5. **Backends** — `apps/msd-api`, `apps/mera-driver-api` (Express + Postgres + Prisma + OpenAPI) ⏳ deferred until pages need real data
6. **Auth integration** — wire OTP/Google to real endpoints once backends exist ⏳
7. **Hardening** — tests, error tracking, CI gates, deployment ⏳

Current focus: **frontend pages first** (step 3), backends deferred.
