# Driver application and portal implementation

Date: 3 October 2026. Intentional changes stayed inside the two Mera Driver apps. Existing uncommitted work (including the pre-existing root TASK.md change), original users, roles, bookings, payments and onboarding records were preserved.

## Implemented flow

The existing desktop/mobile website header opens a Material dialog containing only Full Name, Phone Number and Driver Type. The footer uses `/become-driver`, which renders the same component inside the existing public layout. Active business categories come from the existing `driver-types` Master: Commercial, the existing `Non Commercials` value displayed as Non-commercial, and Other. Licence/vehicle categories remain separate.

`GET /drivers/application-options` supplies active Master IDs; `POST /drivers/applications` validates name, normalized Indian mobile and a compatible active Master ID. These public routes use bounded IP rate limiting. The existing Driver creation service saves truthful partial data with `completeStep:false`, website source, 0% progress, no login and no invented onboarding values. It does not approve KYC, collect a fee, set availability online or grant trip eligibility. The API-confirmed success message is: “Aapki driver application submit ho gayi hai. Hamari team review karke aapka login activate karegi.”

Normalized-phone PostgreSQL advisory locking serializes concurrent application submissions. Driver and User contact checks include legacy formatted phones; duplicates receive a privacy-safe 409 without overwrite or account reuse. Driver phones remain compatible with existing ten-digit onboarding fields; login User phones use the existing +91 normalization.

The existing `sky-data-table` in `/account/drivers` remains in use with server-side search, filters, pagination, sorting, export, column selection and four summary cards. Driver Type and login status are visible. A basic application is in All Drivers, not Driver Users, Need KYC Review or Ready for Trips. Review counts and rows share the same database predicate; a basic unsubmitted application is not a KYC submission.

The existing Manage Driver User dialog displays saved name and phone. Authorized `POST /drivers/:id/create-user` locks and rereads the same Driver row inside a transaction, creates a phone/OTP-capable User with the existing driver role, and links that same Driver. Email and password are optional. An existing linked login or unrelated contact conflict returns 409; no unrelated User is attached. The list and cards refresh after creation. Driver accounts remain excluded from general staff User Management.

Driver login opens `/driver`, with the existing driver layout, own sidebar, actual onboarding/KYC/fee/readiness data and the existing tab → pill → form onboarding. Saved name, phone and driver type are retained. Partial save/reload works. No account creation or profile save bypasses KYC, licence, registration fee or eligibility policy.

## Confirmed portal routing root cause and protection

The old running API returned staff navigation for a customer-role account that had no linked Customer: Dashboard, Trips & Bookings, Bookings and Admin Dispatch. Its bootstrap permissions included `dashboard:view` and booking staff permissions. OTP/Google registration assigned the customer role but did not create the Customer record. Frontend login chose a portal from linked records and otherwise fell back to `/account/dashboard`; backend bootstrap built the staff menu even for portal roles. The admin guard also relied on missing record links. OTP lost the selected login persona. This combination caused the reported admin sidebar exposure.

Authenticated roles now determine a server-validated portal context, signed into tokens and persisted across refresh. Browser context selection cannot grant a role. A mixed customer/staff account stays customer for website customer login; staff context requires an explicit Staff selection. Reserved customer/driver roles cannot grant staff permissions or widgets through Role Management, cloning or backend permission APIs. Existing staff workflow permission keys and legitimate role assignments remain intact.

Customer registration creates/links a Customer transactionally. Existing authorized customer login can provision a missing own profile; conflicting Customer contacts require staff resolution rather than silent merging. Email-only profiles preserve a missing mobile as null. Missing driver activation/profile links produce a clear error, not admin fallback. No original account roles were automatically removed or reassigned.

Frontend guards and safe return routing use the current authenticated context and supported portal routes. External, traversal and unauthorized staff return URLs are rejected. Backend ownership still resolves from authenticated user ID. Portal context blocks staff permissions, private cross-portal documents and cross-account records. Logout/account changes clear old bootstrap, menus, booking state and user-scoped profile/address caches. Customer and driver menu rendering waits for current bootstrap; desktop and mobile share portal access rules.

## Additive migrations

- `prisma/migrations/20261003150000_portal_session_context/migration.sql`: nullable refresh-session portal context and nullable Customer mobile for truthful email-only registration. No existing data backfill or role reassignment.
- `prisma/migrations/20261003160000_driver_application_other_type/migration.sql`: adds only the missing Other option to the existing driver-types Master with conflict-safe insertion. Existing Commercial/Non Commercials IDs and names are retained.

The Driver schema already supports incomplete fields; no duplicate Driver model, role or application database was added. Migration status reports 24 migrations and an up-to-date local database.

## Changed files for this connected task

Backend paths below are relative to `apps/mera-driver-api`:

- `prisma/schema.prisma` and the two migration folders above.
- `src/services/driver-application.service.ts`, `driver-application.service.test.ts`, `driver.service.ts`, `driver-list.service.ts`.
- `src/middleware/publicRateLimit.ts`, `src/routes/drivers.routes.ts`.
- `src/services/portal-context.ts`, `portal-context.test.ts`, `auth.service.ts`, `token.service.ts`, `permission.service.ts`, `bootstrap.service.ts`, `role.service.ts`.
- `src/routes/auth.routes.ts`, `auth.routes.test.ts`, `src/schemas/auth.schema.ts`, `src/lib/jwt.ts`, `resolveOwnCustomer.ts`, `resolveOwnDriver.ts`, `src/middleware/authenticate.ts`, `authorizeDriverUpload.ts`.
- `verification/driver-application-portal-smoke.cjs`, its screenshots/results under `verification/artifacts`, and this report.

Frontend paths below are relative to `apps/mera-driver/src/app`:

- `shared/driver-application/driver-application.ts`, `.html`, `.spec.ts`; `shared/header/header.ts`, `.html`; `shared/footer/footer.ts`; `app.routes.ts`.
- `pages/account/drivers/drivers.ts`, `.html`; `pages/driver/profile/profile.ts`; `pages/driver/dashboard/dashboard.html`.
- `core/auth/portal-routing.ts`, `.spec.ts`, `auth-api.service.ts`, `admin-area.guard.ts`, `customer-portal.guard.ts`, `driver-portal.guard.ts`, `admin-area.guard.spec.ts`.
- `pages/sign-in/sign-in.ts`, `.html`, `.spec.ts`; `pages/otp/otp.ts`, `.spec.ts`; `pages/unauthorized/unauthorized.ts`, `.html`.
- `pages/account/administration/roles/roles.ts`, `.html`; `layouts/customer-layout/customer-layout.ts`; `pages/workflow/workflow.spec.ts`.
- `core/account/account.service.ts`, `.spec.ts`; `core/booking/booking.service.ts`.

Earlier working-tree changes to dispatch, Accounts, payments, OTP providers, details, PDFs, resume, Master preferences and KYC history were retained. They are documented in the existing reports and are not presented here as newly implemented work.

## Verification and external limits

Automated regression suites, TypeScript checks, production builds and actual browser results are recorded below after final verification. Browser verification uses local, isolated fixtures and actual UI/API/database operations. Only SMS delivery is intercepted with a local hashed OTP challenge; OTP verification, token issuance and portal routing use the real backend. Cleanup is limited to explicitly tracked fixture IDs and does not reset the database.

No real SMS delivery, Google OAuth provider exchange, payment, transfer, refund, paid location-provider request or IDSPay production call is claimed as verified. IDSPay remains disabled pending the exact endpoint contract and complete approved configuration. No secrets were printed, committed or added to the client.

### Final results

- `nx run mera-driver-api:test`: **511 tests in 35 files passed**. Includes public validation, Master options, truthful incomplete creation, normalized/legacy contact conflicts, rate limiting, transaction lock checks, portal context, permission restrictions, ownership, and the existing payment/booking/KYC suites.
- `nx test mera-driver --watch=false`: **194 tests in 24 files passed**, including dialog success/error/loading and submission state, safe portal routing, role context and account-cache isolation. Rerun after the dashboard status-card change passed.
- `tsc --noEmit` with each app's `tsconfig.app.json`: both passed.
- Backend production build: passed, webpack hash `26de7f4da0fad84e`. Frontend production build: passed, latest `main-SOKFPQ2U.js`, initial bundle 983.82 kB. Existing Driver Details CSS budget warning (4.70 kB versus 4 kB warning threshold) and shared test setup type-check warning remain; no outside-scope files were changed to suppress them.
- `git diff --check -- apps/mera-driver apps/mera-driver-api`: passed.
- Actual Chromium browser at `http://localhost:4400`, real API at `http://localhost:3334`: passed the complete application → list → activation → OTP verification → own dashboard → prefilled onboarding → partial save/reload flow. Dashboard displays actual registration fee status and optional/required policy alongside profile completion, KYC and backend trip blockers.
- Concurrent application requests returned one 201 and one 409 with one Driver; concurrent same-record activation returned one 201 and one 409 with one User. Anonymous activation returned 401; driver staff APIs/activation/cross-driver detail returned 403. A supplied other driver ID did not change `/drivers/me` ownership.
- Customer password login, own-only booking data, other-customer booking/invoice denial, staff API denial, authorized return route, external return rejection, refresh, direct staff URL denial, mixed customer/staff explicit context selection, same-browser staff logout/customer login and 390px mobile layout passed. Existing customer and staff layouts were retained.
- Temporary fixtures were removed using tracked IDs. Final browser run before and after counts were identical: 14 Users, 7 Drivers, 3 Customers, 1 Booking, 0 MoneyMovements and 24 OTP challenges. Earlier original-user activity increased the starting counts while verification was underway; those unrelated records were preserved, not treated as test fixtures.

Machine-readable evidence: `verification/artifacts/driver-application-portal-results.json`.

Screenshots:

- `verification/artifacts/driver-application-three-fields.png`: existing website dialog and validation.
- `verification/artifacts/driver-application-saved.png`: backend-confirmed application success.
- `verification/artifacts/driver-application-admin-list.png`: existing All Drivers DataTable and counts.
- `verification/artifacts/driver-application-activate-login.png`: authorized same-record account creation dialog.
- `verification/artifacts/driver-application-login-linked.png`: login linked and counts refreshed.
- `verification/artifacts/driver-application-own-dashboard-menu.png`: own driver sidebar/dashboard.
- `verification/artifacts/driver-application-prefilled-onboarding.png`, `driver-application-prefilled-phone.png`, `driver-application-prefilled-driver-type.png`: real saved basic fields in existing pills.
- `verification/artifacts/driver-admin-route-denied.png`: manually entered staff route resolves to driver portal.
- `verification/artifacts/customer-own-bookings-menu.png`, `customer-refresh-no-admin-menu.png`, `staff-logout-customer-no-stale-sidebar.png`, `customer-portal-mobile.png`: customer ownership/session/mobile checks.
- `verification/artifacts/explicit-staff-context-dispatch.png`: existing staff access requires explicit context for a mixed account.

There is no remaining blocker for the local application/activation/portal workflow. External SMS delivery to a real device still requires a controlled check of the existing provider; local OTP delivery was deliberately isolated. Production provider/payment operations were not run.
