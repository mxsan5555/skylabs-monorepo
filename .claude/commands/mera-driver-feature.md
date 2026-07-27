# Command: /mera-driver-feature

Builds a new feature end-to-end in the mera-driver app (Angular 21 + Tailwind, driver booking).

## Pipeline

1. **skylabs-neha** — Design spec
   - 60/30/10 colour allocation using blue (#1175BC) M3 tokens
   - Responsive layout (375 / 768 / 1280px)
   - Component states: default, hover, focus, disabled, loading, error
   - Accessibility notes: contrast ratios, touch targets, ARIA

2. **skylabs-abhi** — Backend (if the feature needs an API)
   - OpenAPI spec first (written before code)
   - Express route + Zod validation + Prisma query in `apps/mera-driver-api/`
   - JWT auth middleware + role check if required
   - Roles available: `customer`, `driver`, `admin`, `marketing`, `sales`

3. **skylabs-ravi** — Frontend implementation
   - Angular 21 standalone component in `apps/mera-driver/src/app/pages/`
   - Route entry in `app.routes.ts`
   - `canActivate: [authGuard]` / `canActivate: [roleGuard], data: { roles: [...] }` as needed
   - Sidebar `MenuItem` in `admin/menu.ts` if it's an account page
   - Use `<md-*>` and `<sky-*>` tags; add `CUSTOM_ELEMENTS_SCHEMA` to the component
   - HTTP call via an injectable service, not directly in the component

4. **skylabs-dev** — Tests
   - Write test cases (Given / When / Then) before asking skylabs-ravi to implement
   - Angular unit tests: `*.component.spec.ts` co-located
   - Playwright e2e test: `e2e/mera-driver/<feature>.spec.ts`
   - Verify: happy path + empty state + error state + auth/role guard redirect

5. **skylabs-vivek** — SEO (public pages only — skip for account pages)
   - Route `title` field in `app.routes.ts`
   - `Meta` service for description and robots tags
   - Open Graph tags in component
   - GA4 events pushed to dataLayer

6. **skylabs-reena** — Copy
   - Write or review all inline template strings
   - Check voice rules checklist (professional, reliable tone)

## Usage

```
/mera-driver-feature [describe the feature in plain language]
```

### Examples
```
/mera-driver-feature add a driver profile page showing rating, trips completed, and car details
/mera-driver-feature add a scheduled booking flow for customers
/mera-driver-feature add a promotions management page for marketing managers
```

## Constraints
- Backend for mera-driver lives in `apps/mera-driver-api/` — never share with msd-api
- Auth is currently mocked (localStorage); wire real JWT when mera-driver-api exists
- All new account pages need `noindex` meta + `canActivate: [authGuard]`
- Tests must run green before handoff: `npx nx run mera-driver:test`
- Standalone components only — no NgModules
