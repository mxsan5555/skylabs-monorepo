# MSD CMS Articles routing correction

## Confirmed root cause

The permission-filtered menu already points Articles to `/account/cms/blog/articles`, but routes.tsx had no static route for that URL. React Router therefore matched `/account/cms/blog/:id`, rendering BlogDetailAdmin with id="articles". The detail client requested `/blog-posts/articles`; the API UUID validator correctly returned "Invalid route parameters", and the component displayed its Back to Blog error screen. Reordering routes would not create the missing list route.

The sidebar independently prefix-matched each NavLink, so both `/account/cms/blog` (Pages) and `/account/cms/blog/articles` (Articles) were active. Ancestor expansion also inspected only immediate child routes, missing nested groups.

This checkout has one standalone BlogPost model, no parent blog-page foreign key, no pageId article API parameter, and no page-scoped Articles components/routes. No parent page is selected or hardcoded. The existing Pages list and Articles entry reuse the same BlogPost data and UI through separate permission surfaces.

## Implementation

- Added explicit Articles listing and detail routes, gated by cms.blog.articles:view. Existing Pages list/detail and Categories routes retain their own guards.
- Reused BlogList, its Shared UI DataTable, search/pagination, BlogFormDialog and block editor. Articles View opens `/account/cms/blog/articles/:id`; Back returns to Articles. Pages retains `/account/cms/blog/:id` and Back to Blog.
- Parameter names remain `id` in both detail route families, component useParams and API UUID validation. Invalid/missing detail IDs render Not Found without an API call; valid nonexistent UUIDs retain the API Not Found behavior. Stale detail responses are ignored after navigation.
- Shared the existing API CRUD/media router through a factory. `/blog-posts` retains cms.blog.pages permissions; `/blog-articles` checks cms.blog.articles for each view/create/edit/delete/media action. Services, validation, persistence and audit behavior are shared. Categories permissions are unchanged.
- Added an Articles media client destination so article cover-image actions never fall back to Pages permissions.
- Sidebar selects exactly one longest matching leaf on URL segment boundaries and expands all of its ancestors.
- Browser verification caught an existing Edit-dialog timing bug: show() ran on the old keyed dialog before the selected article committed. Opening now occurs after commit, for both reused list surfaces.

## Actual verification

- Real Chromium at http://localhost:4200, 1440 x 1000, using intercepted API/identity fixtures (not a live authenticated session). Browser script and complete request log: browser-check.mjs, browser-results.json, browser.log.
- Exercised direct Articles access, populated listing, refresh, Pages-to-Articles sidebar navigation, exactly one active leaf, nested expanded groups, article View and Back, selected-row Edit dialog, New dialog, DataTable search, existing Pages detail, malformed article IDs, valid nonexistent IDs, and permission denial with Pages-only permissions.
- No browser page errors; no API requests with undefined IDs or the literal articles as a database ID. Screenshot articles.png shows the real rendered application with fixture content.
- Frontend regressions: 7 files, 65 tests passed, covering lists under both scopes, forms, categories, sidebar, detail validation, API destinations and media permission destinations (frontend-tests.log).
- API regressions: 2 files, 96 tests passed, covering both CRUD/media namespaces and Categories, cross-permission denial, validation and literal-identifier rejection (api-tests.log). Rechecked after generated client restoration.
- Frontend Vite production build passed with explicit exit code 0 (build.log); existing chunk-size/plugin-timing warnings remain.
- API TypeScript check passed after local generated-client recovery (api-typecheck.log).
- Full frontend TypeScript check remains blocked by 32 errors elsewhere in the current checkout, including existing missing exported types, CMS category/social/legal dialog ref types, and home catalog fields (frontend-typecheck.log). No errors were reported in the modified CMS Articles/sidebar/client components.

## Local build environment

The API build required an outside-sandbox retry because Nx plugin workers were denied access. Its first compile then encountered incomplete generated Prisma client declarations. Direct generation was blocked by Windows EPERM replacing the query-engine DLL, including outside the sandbox. Generated client files were restored using a temporary output at the same directory depth and the original schema, retaining the existing engine binary and normalizing generated metadata back to the original paths. The temporary schema/output was removed afterward. No schema, database records, seed data or migrations were changed by this task.

The final API production build passed: webpack compiled successfully and Nx reported the msd-api build target succeeded (api-build.log).

ESLint completed with zero errors and six existing warnings in the touched frontend files (lint.log).

## Changed files

Production:
- apps/msd/src/app/routes.tsx
- apps/msd/src/app/admin/sidebar.tsx
- apps/msd/src/app/admin/sidebar-active.ts
- apps/msd/src/app/pages/account/cms/blog-list.tsx
- apps/msd/src/app/pages/account/cms/blog-detail-admin.tsx
- apps/msd/src/app/pages/account/cms/blog-form-dialog.tsx
- apps/msd/src/api/rbac/blog-posts.ts
- apps/msd/src/api/media.ts
- apps/msd-api/src/app.ts
- apps/msd-api/src/routes/blog-posts.routes.ts

Tests:
- apps/msd/src/app/admin/sidebar.test.tsx
- apps/msd/src/app/pages/account/cms/blog-list.test.tsx
- apps/msd/src/app/pages/account/cms/blog-detail-admin.test.tsx
- apps/msd/src/api/rbac/blog-posts.test.ts
- apps/msd/src/api/media.test.ts
- apps/msd-api/src/routes/blog-posts.routes.test.ts

No accounting/member functionality was changed by this task. Existing edits in this shared workspace were preserved. Artifacts are under apps/msd/artifacts/cms-articles.
