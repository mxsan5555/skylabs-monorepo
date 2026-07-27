# Command: /msd-feature

Builds a new feature end-to-end in the msd app (React 19 + Vite, massage deals).

## Pipeline

1. **skylabs-neha** — Design spec
   - 60/30/10 colour allocation using green (#007C2B) M3 tokens
   - Responsive layout (375 / 768 / 1280px)
   - Component states: default, hover, focus, disabled, loading, error
   - Accessibility notes: contrast ratios, touch targets, ARIA

2. **skylabs-abhi** — Backend (if the feature needs an API)
   - OpenAPI spec first (written before code)
   - Express route + Zod validation + Prisma query in `apps/msd-api/`
   - JWT auth middleware + role check if required
   - Swagger docs at `/docs`

3. **skylabs-ravi** — Frontend implementation
   - React 19 page/component in `apps/msd/src/app/pages/` or `components/`
   - Route entry in `routes.tsx`
   - `RequireAuth` / `RequireRole` guards as needed
   - Sidebar `MenuItem` in `admin/menu.ts` if it's an account page
   - API call wired through `apps/msd/src/api/`
   - `content.json` strings for all new UI copy

4. **skylabs-dev** — Tests
   - Write test cases (Given / When / Then) before asking skylabs-ravi to implement
   - Vitest unit tests: `*.test.tsx` co-located with component
   - Playwright e2e test: `e2e/msd/<feature>.spec.ts`
   - Verify: happy path + empty state + error state + auth guard redirect

5. **skylabs-vivek** — SEO (public pages only — skip for account pages)
   - `<title>` and `<meta name="description">` in JSX
   - Open Graph tags
   - JSON-LD (LocalBusiness or BreadcrumbList as appropriate)
   - GA4 events pushed to dataLayer

6. **skylabs-reena** — Copy
   - Write or review all UI strings in `content.json`
   - Blog article if the feature has a content angle
   - Check voice rules checklist

## Usage

```
/msd-feature [describe the feature in plain language]
```

### Examples
```
/msd-feature add a promotions page for marketing managers with a list of active coupons
/msd-feature add a "recently viewed" deals section to the home page
/msd-feature add a booking history page to the account console
```

## Constraints
- Backend for msd lives in `apps/msd-api/` — never share with mera-driver-api
- Auth is currently mocked (localStorage); wire real JWT when msd-api exists
- All new account pages need `noindex` meta + `RequireAuth` guard
- Tests must run green before handoff: `npx nx run msd:test`
