# Mera Driver RBAC and Admin Dispatch verification

Work is confined to `apps/mera-driver` and `apps/mera-driver-api`. The working tree already contained substantial changes; those were preserved. No database reset, existing-record deletion, pricing-rule change, or SMS/IDSPay/payment-provider call was made for these checks.

## Actual root causes

- Permission resolution trusted role keys in existing tokens and a role-set cache. Assignment changes could therefore leave prior staff access active. Historical direct grants also needed explicit handling and conflict reporting.
- Seed reconciliation recreated baseline grants, including intentionally revoked grants. Existing roles now retain their saved metadata and grants; only newly created seed roles receive defaults.
- Role selection and matrix loading were asynchronous without sufficient separation between saved IDs, selected role, and pending responses. Metadata and permission edits also needed separate payloads and transactional audit writes.
- Staff user assignment needed to replace the staff membership while preserving separate Driver/Customer relationships. A new role key needed supported ownership scopes and permission-based navigation rather than an Admin fallback.
- Several UI/API consumers treated read authority as mutation authority or lacked record ownership checks. KYC review writes now require the explicit `kyc-assignments:edit` action.
- Dispatch combined unrelated fields into slash-separated text and used a native dropdown below the table. Its generic actions appeared on terminal bookings, and the candidate list did not expose staff phone details.
- Assignment row locks serialized writes but did not distinguish a stale administrator dialog from an intentional reassignment. A second request could overwrite the first winner. The API now compares the displayed booking version under the existing lock and records an idempotency key in the existing assignment audit.
- Driver requests did not persist whether the customer specifically preferred that driver. A nullable provenance field now distinguishes customer preference from automatic offers, without guessing historical values.

## Changed application files

Frontend:

- `src/app/pages/workflow/workflow.ts`, `workflow.html`: compact filters, server quick filters, five default composite columns, existing details flow, assignment dialog, pinned current driver, paginated selectable candidates, required reason, stale-response fencing, submitting/failure/success states, expandable history. Customer sorting remains available through the existing column control.
- `src/app/pages/workflow/dispatch-table.ts`: app-owned extension of the existing shared DataTable for multiline cells and per-row state restrictions; shared search/sort/pagination/column controls remain in use.
- `src/app/pages/workflow/dispatch.spec.ts`: dialog, permissions, filters, stale-response and failed-save regression tests.
- `src/app/pages/account/administration/roles/roles.ts`, `roles.html`, `roles.spec.ts`: Add/Edit roles, duplicate validation, stable keys, initial Super Admin selection, actual saved permissions, independent action selection and unsaved-change handling.
- `src/app/pages/account/administration/users/users.ts`, `users.html`: assignable-role dropdown, current role prefill, one staff role, preserved portal links, explicit legacy-role/direct-grant conflict display, loading/error handling.
- `src/app/core/rbac/rbac-api.service.ts`, `src/app/layouts/admin-layout/admin-layout.ts`, `admin-layout.html`: bootstrap refresh after mutations and on focus/navigation/30-second lifecycle; sidebar/controls refresh and revoked-route redirection.
- `src/app/core/auth/mera-auth.service.ts`, `mera-auth.service.spec.ts`, `auth.interceptor.ts`, `src/app/app.config.ts`: reuse shared authentication while preventing old bootstrap/renewal results and pending requests from crossing account sessions.
- `src/app/pages/account/customers/customers.ts`, `customers.html`, `src/app/pages/account/kyc-assignments/kyc-assignments.ts`, `pill-review.ts`, `pill-review.html`, `pill-review.spec.ts`: exact action guards and form/row controls.
- `verification/.gitignore`: exclude the isolated generated production bundle.

API:

- `src/routes/workflow.routes.ts`: scoped full-dataset filters/counts, fresh booking detail, paginated candidates, required optimistic booking version for assignment, legacy-state reads.
- `src/services/trip-workflow.service.ts`: staff-only candidate phone, explicit preference provenance, locked state/eligibility/version revalidation, duplicate retry handling, unchanged existing driver acceptance/OTP/payment workflow.
- `src/routes/dispatch.routes.test.ts`, `src/services/dispatch-assignment.test.ts`: filtering, scope/permission denial, stale eligibility, terminal states, concurrency, retry and history regressions.
- `src/services/permission.service.ts`, `bootstrap.service.ts`, `role.service.ts`, `user.service.ts`, `src/routes/rbac.routes.ts`: live memberships, exact saved grants/revokes and historical overrides, assignable roles, protected Super Admin handling, atomic role/assignment and audit updates.
- `src/lib/ownerScope.ts`, `src/routes/customers.routes.ts`, `src/services/customer.service.ts`, `src/routes/drivers.routes.ts`, `src/middleware/requirePermission.ts`, `authorizeDriverUpload.ts`, `src/services/dashboard.service.ts`: ownership/assignment restrictions, current-role scope, mutation enforcement and supported custom-role dashboards.
- Relevant existing permission, role, user, customer, driver, ownership, dashboard, upload and workflow regression fixtures were updated for live memberships and independent actions. `src/services/seed-permissions.test.ts` adds the non-destructive seed regression.
- `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/role-permission-seed.ts`: nullable staff customer ownership, preference provenance and defaults for newly created roles only.
- Additive migrations: `20261008000000_customer_staff_ownership`, `20261008010000_kyc_review_edit_permission`, `20261008020000_dispatch_preference_provenance`. All are applied to the local database; migration status reports up to date. The first attempt at the KYC permission migration was resolved as rolled back and corrected before successful deployment.
- `verification/rbac-live.cjs`, `dispatch-live.cjs`, `rbac-environment.cjs`, `rbac-migrate.cjs`, `rbac-server.cjs`, `rbac-ui-server.cjs`: reproducible local verification and retained evidence. Temporary edit scripts were removed.

## Completed checks

- Full frontend suite: **266 passed** in 33 files.
- Full API suite: **692 passed**, one existing opt-in document-browser test skipped, in 47 files.
- Both application TypeScript checks passed.
- After the final legacy-state refinement, the affected frontend workflow tests passed again (30), dispatch API route tests passed again (10), both TypeScript checks passed again and both final production builds passed.
- Both production builds passed, using output directories within the permitted apps. Angular font inlining initially hit sandbox network denial; the approved rerun downloaded the application's existing Google Fonts stylesheet and succeeded. Nx plugin isolation was disabled after worker startup failures. These infrastructure failures were not treated as successful checks.
- Database migration status: up to date; no reset or seed replay was used.
- Actual production browser/API/local PostgreSQL role verification passed: initial Super Admin selection; zero-grant Add Role; duplicate validation; role rename preserves grants and assignment; new role dropdown; replacement staff membership; same-token revocation; live controls/route refresh; reload and fresh real password login; exact View/Edit behavior; built-in role names, grants and user links unchanged. See [RBAC results](artifacts/rbac-live-results.json).
- Actual production browser/API/local PostgreSQL dispatch verification passed: full-dataset search/filter/count/pagination; sorting and column controls; current/preferred separation; blocked candidates; candidate search/pagination and empty results; cancel; eligible assignment; required replacement reason; stale eligibility rejection with unchanged booking; reassignment audit; existing View flow; terminal restrictions; concurrent winner/409 and idempotent retry; separate driver acceptance; custom-role read-only UI and direct API denial; matching Customer/Driver/Admin state; mobile focus/Tab/Escape and no browser runtime errors. One candidate transport failure was deliberately simulated in the browser to verify the error/retry UI; its retry used the real API. See [dispatch results](artifacts/dispatch-live-results.json).
- [Desktop dialog](artifacts/dispatch-dialog-desktop.png) and [mobile dialog](artifacts/dispatch-dialog-mobile.png) screenshots were visually inspected.
- Browser requests for the production API hostname were forwarded to the isolated local API, rather than mocked. Fixture records and relationships were retained inactive/cancelled with history. Failed verification attempts also retained their isolated fixtures; existing accounts and grants were not edited.

## Remaining limitations and rollout requirements

- Existing direct grant conflict: one `rbac.users:view` override. It remains stored and contributes when its account has an active staff role. Bootstrap/User Management report the conflict; it was not silently removed.
- Historical Customers have no trustworthy staff creator/assignment field to backfill. Their new ownership field remains null. Core administrators retain access; staff ownership rules fail closed rather than guessing ownership.
- Support-to-customer/driver assignment relationships are not modeled. Support/custom roles use supported ownership; a future explicit assignment model is required for a broader assigned-work queue. This is a data-model limitation, not an unrestricted Admin fallback.
- Existing reviewer roles need an authorized administrator to grant `kyc-assignments:edit` if they should perform reviews. The migration creates the action but does not recreate any role grant. Super Admin protection remains intact.
- Historical request preference provenance remains null. Requests and timestamps remain readable; an old automatic offer is not presented as a customer preference.
- Legacy accepted/driver-arrived/ongoing states remain readable and filterable. Their assignment restrictions remain those of the existing assignment service; this change does not migrate trip states or invent validated schedules.
- The opt-in binary document browser test was not part of this task's default suite. Dispatch and RBAC have separate completed live-browser checks.
- Existing deployed services were not replaced. Deployment must apply the additive migrations, generate Prisma Client and restart/rebuild the API/frontend. Existing sessions then refresh through the implemented lifecycle; the next protected API request uses live effective permissions.
