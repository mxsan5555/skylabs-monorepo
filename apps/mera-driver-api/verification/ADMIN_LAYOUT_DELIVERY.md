# Admin layout delivery and remaining requirements

The existing shell, sidebar, Material controls, shared DataTable, role/menu/bootstrap services and driver routes were reused. The requested admin work is substantially implemented but is not fully complete: unsupported staff record scopes, unavailable destinations and actual-login validation remain outstanding below. The subsequent document task is reported in DOCUMENT_TYPES_DELIVERY.md.

## Implemented

- Ordered app-owned sidebar, recursive search, accessible-child headings, active/query highlighting, direct-URL ancestor expansion and profile/logout footer. Desktop/tablet sidebar and accessible mobile drawer were checked on the running UI.
- Vehicles/Attendance removed from application menu/default seed configuration; APIs/shared functionality/data retained. Vehicle Types retained. Distinct driver verification-status and account-status masters remain separately labeled; data was not merged. General and financial Reports remain distinct.
- Add/Edit Role metadata and four independent View/Create/Edit/Delete matrix using existing grouped accordions; unsupported actions disabled, protected action IDs preserved. Immutable key, backend duplicates/delegated authority, atomic main save with audit, Super Admin/portal core protections, role-copy restrictions and draft/error/cancel/late-response handling. Existing dashboard-widget choices preserved.
- User Management uses existing DataTable, server search/role/status filters, edit/contact/status/role fields and immutable backend-derived Created By. Multiple saved roles remain explicit selections. Customer/Driver accounts stay in dedicated workflows. Per-user extra grant UI removed; historical grant overrides no longer confer privileges and new override writes return 410. Legacy deny restrictions remain active to avoid silently broadening access.
- Registry real backend cards, server filters/pagination, full width, default name/phone, city/type, KYC/verifier, fee/readiness, existing View/Edit/assignment actions with accessible labels. Existing Driver Details route retained. Verifier dialog loads saved stable ID, preserves inactive/unavailable current assignee, avoids autosave/no-change audit, handles cancel/failure/stale-driver response, uses existing assignment API compare-and-set and transactional audit.
- Sensitive KYC approval requires administrative review authority in addition to ordinary edit; financial movement requires separate create/edit authority and preserves existing workflow guards. Consentless DL provider flow was not replaced. Backend role/status resolution remains current; navigation/focus/periodic bootstrap refresh prevents stale menu/action caches.
- Repeated seeds only provision missing defaults and do not overwrite existing customized role metadata/grants/widgets/user assignments. Historical roles are retained.

## Actual route and permission mapping

Routes below are existing admin-child destinations; prepend `/account` for the browser URL. Parent headings do not grant access. View is the menu gate; sensitive action checks remain separate.

| Entry | Route | Existing module permission key |
| --- | --- | --- |
| Dashboard | `/dashboard` | `dashboard` |
| Driver Register | `/drivers` | `drivers` |
| KYC Assignments | `/kyc-assignments` | `kyc-assignments` |
| Customers | `/customers` | `customers` |
| Bookings | `/trips/bookings` | `trips.bookings` |
| Pricing | `/pricing` | `trips.pricing` |
| Promo Codes | `/promotions/promo-codes` | `promotions.promo-codes` |
| Promo Usage | `/promotions/promo-usage` | `promotions.promo-usage` |
| FAQs | `/faqs` | `faqs` |
| Feedback | `/feedback` | `feedback` |
| Reports | `/reports` | `reports` |
| Driver Types | `/masters/driver-types` | `masters.driver-types` |
| Driver Verification Status | `/masters/statuses` | `masters.statuses` |
| Document Type | `/masters/personal-docs` | `masters.personal-docs` |
| Education Document | `/masters/education` | `masters.education` |
| Eye Vision | `/masters/eye-visions` | `masters.eye-visions` |
| Health Document | `/masters/health-docs` | `masters.health-docs` |
| Police Verification Documents | `/masters/police-docs` | `masters.police-docs` |
| Vehicle Types | `/masters/vehicle-types` | `masters.vehicle-types` |
| Service Zones | `/masters/zones` | `masters.zones` |
| Source Type | `/masters/source-types` | `masters.source-types` |
| Languages | `/masters/languages` | `masters.languages` |
| Settings | `/settings` | `settings` |
| Driver Users | `/drivers?view=users` | `drivers` |
| Admin Dispatch | `/dispatch` | `trips.bookings` |
| Overview | `/accounts/overview` | `payments.overview` |
| Booking Payments | `/accounts/booking-payments` | `payments.overview` |
| Registration Fees | `/accounts/registration-fees` | `payments.overview` |
| Commissions | `/accounts/commissions` | `payments.overview` |
| Driver Payouts | `/accounts/driver-payouts` | `payments.overview` |
| Refunds & Adjustments | `/accounts/refunds-adjustments` | `payments.overview` |
| Financial Reports | `/accounts/reports` | `payments.overview` |
| Driver Account Statuses | `/masters/driver-account-statuses` | `masters.source-types` |
| Job Types | `/masters/job-types` | `masters.source-types` |
| Job Choices | `/masters/job-choices` | `masters.source-types` |
| Work States | `/masters/states` | `masters.source-types` |
| Role Management | `/administration/roles` | `rbac.roles` |
| User Management | `/administration/users` | `rbac.users` |
| Audit Logs | `/administration/audit-logs` | `rbac.audit-logs` |

Driver details remains `/account/drivers/:id/details`; resume remains `/account/drivers/:id/resume`. KYC assignment uses `drivers:assign` and current record scope; generic matrix Edit does not grant assignment. Final KYC approval additionally checks `drivers:assign`, DL checks retain existing assigned-reviewer/admin authorization, and driver PDF/export checks retain their existing protected routes. No new deletion/archive endpoint exists.

## Data/seed effects and remaining requirements

No schema migration was introduced. Normal seed ran twice and preserved hashes for customized roles, permissions, user roles/overrides, drivers/documents/KYC, bookings, money movements and customers immediately around those runs. Later concurrent updates to driver/DL records by another process were observed; the entire database is not claimed unchanged throughout the session. No unrelated source files were modified. The concurrently supplied `apps/mera-driver-api/MERA_DRIVER_ROLE.md` was read and left untouched.

- There is no existing linked/assigned Vendor, Marketing, Sales, Company, Data Operator or Support record-scope infrastructure for all requested responsibilities. New unsupported defaults therefore remain minimal rather than granting unrestricted driver/customer/booking lists. Existing customized broad role grants are preserved. Implementing the full requested scopes needs supported assignment/company-link policies and is unfinished; this change does not establish universal staff own-record isolation.
- No supported general admin Trips page was found. It was not replaced with a placeholder or invented route. Existing driver/customer trip portals remain intact.
- Driver DELETE previously permanently removed records and had no soft-delete/archive policy. It now rejects with `DRIVER_ARCHIVE_UNAVAILABLE`; the registry does not expose an enabled Trash action. A supported archive workflow with linked-record/history restrictions is needed before enabling it.
- Existing marketing/content destinations only have supported View actions in the current API; unsupported CRUD is Not applicable in the matrix. Existing limited destination functionality was not rewritten.
- A strict role-only transition of historical per-user denies is still pending a reviewed role mapping. Legacy grants are inert and audit rows remain; silently dropping denies would expand access, so it was avoided.
- Actual OTP/password login and live role/assignment revocation through authenticated existing browser sessions were not exercised. Signed real-account session fixtures were used. Two active linked customer accounts and a foreign unassigned KYC review were unavailable for extra real-database isolation probes. No approved example screenshot was attached in the conversation; styling follows existing components.

## Verification and screenshots

After the final document change: 227 frontend tests, 566 backend tests, both type checks and both production builds passed. Relevant backend tests cover delegation, last-owner/portal boundaries, view-only denials, creator preservation, assignment race/no-change guards, onboarding/KYC/DL, PDF/resume, booking/dispatch and money/provider workflows. Existing providers are mocked in tests; no actual provider call was made by verification.

Running real UI/API checks passed for sidebar search/Vehicle Types, role Add/Edit/Cancel matrix, user list/Edit, registry and desktop/tablet/mobile drawer behavior, with no page errors and no API writes. A real linked driver scope probe denied foreign admin details/PDF; a real KYC verifier received assigned-only records and was denied general administrative search/assignment picker access. Full live role-creation/save/relogin, reassignment revocation, financial posting and customer cross-account mutation scenarios remain unrun.

- [Desktop sidebar](artifacts/admin-sidebar-desktop.png), [mobile drawer](artifacts/admin-sidebar-mobile.png)
- [Driver Registry](artifacts/admin-driver-registry-desktop.png), [tablet](artifacts/admin-driver-registry-tablet.png), [mobile](artifacts/admin-driver-registry-mobile.png)
- [Add Role matrix](artifacts/admin-add-role-matrix.png), [Edit Role matrix](artifacts/admin-edit-role-matrix.png)
- [User Management](artifacts/admin-user-management.png), [Edit User](artifacts/admin-edit-user.png)

## Changed source files and verification artifacts

- `apps/mera-driver-api/prisma/seed.ts`
- `apps/mera-driver-api/src/routes/driverSelf.routes.ts`
- `apps/mera-driver-api/src/routes/drivers.routes.test.ts`
- `apps/mera-driver-api/src/routes/drivers.routes.ts`
- `apps/mera-driver-api/src/routes/rbac.routes.test.ts`
- `apps/mera-driver-api/src/routes/rbac.routes.ts`
- `apps/mera-driver-api/src/routes/workflow.routes.test.ts`
- `apps/mera-driver-api/src/routes/workflow.routes.ts`
- `apps/mera-driver-api/src/schemas/business.schema.ts`
- `apps/mera-driver-api/src/schemas/rbac.schema.ts`
- `apps/mera-driver-api/src/services/audit.service.ts`
- `apps/mera-driver-api/src/services/bootstrap.service.ts`
- `apps/mera-driver-api/src/services/document-history.service.test.ts`
- `apps/mera-driver-api/src/services/driver.service.test.ts`
- `apps/mera-driver-api/src/services/driver.service.ts`
- `apps/mera-driver-api/src/services/permission.service.test.ts`
- `apps/mera-driver-api/src/services/permission.service.ts`
- `apps/mera-driver-api/src/services/registration-form.service.test.ts`
- `apps/mera-driver-api/src/services/role.service.ts`
- `apps/mera-driver-api/src/services/user.service.test.ts`
- `apps/mera-driver-api/src/services/user.service.ts`
- `apps/mera-driver-api/src/services/workflow-menu.ts`
- `apps/mera-driver/public/data/drivers-registry.json`
- `apps/mera-driver/src/app/admin/admin-page/admin-page.ts`
- `apps/mera-driver/src/app/admin/sidebar/sidebar.html`
- `apps/mera-driver/src/app/admin/sidebar/sidebar.ts`
- `apps/mera-driver/src/app/core/drivers/driver-self-api.service.ts`
- `apps/mera-driver/src/app/core/drivers/drivers-api.service.ts`
- `apps/mera-driver/src/app/core/rbac/rbac-api.service.ts`
- `apps/mera-driver/src/app/layouts/admin-layout/admin-layout.html`
- `apps/mera-driver/src/app/layouts/admin-layout/admin-layout.ts`
- `apps/mera-driver/src/app/pages/account/administration/roles/roles.html`
- `apps/mera-driver/src/app/pages/account/administration/roles/roles.spec.ts`
- `apps/mera-driver/src/app/pages/account/administration/roles/roles.ts`
- `apps/mera-driver/src/app/pages/account/administration/users/users.html`
- `apps/mera-driver/src/app/pages/account/administration/users/users.spec.ts`
- `apps/mera-driver/src/app/pages/account/administration/users/users.ts`
- `apps/mera-driver/src/app/pages/account/drivers/driver-details.html`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.html`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.spec.ts`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.ts`
- `apps/mera-driver/src/app/pages/driver/documents/documents.html`
- `apps/mera-driver/src/app/pages/driver/documents/documents.ts`
- `apps/mera-driver/src/app/pages/workflow/workflow.html`
- `apps/mera-driver/src/styles.css`

Additional new files: shared document taxonomy/filter/helper tests and portal document tests; role/workflow-menu tests; verification scripts, the two delivery reports, screenshot PNGs and result JSONs under this verification directory. Build outputs/logs are generated verification artifacts, not source. The supplied MERA_DRIVER_ROLE.md is not an assistant-authored change.

Exact tracked/new file inventory: [changed-files.txt](changed-files.txt). Generated build outputs and logs are excluded.
