# msd tasks

The only task list for msd. Business rules: `PLANNING.md`; design: `ARCHITECTURE.md`.
Merged on 2026-10-17 from `docs/msd/ADMIN_RBAC_TASKS.md` (all 201 RBAC tasks, IDs unchanged) and
the open msd items of the root `TASK.md` (new IDs `ST-`, `CO-`, `CT-`, `SL-`, `MA-`, `AN-`, `SO-`,
`X-`).

## How to use

- Tick `[x]` when the task meets its "Done when" condition, in the same commit as the work.
- IDs are stable. Never renumber; add a new task at the end of its module with the next number
  (`P*` for RBAC phases, the module prefix for everything else).
- **Area:** `DB` database, `BE` backend, `FE` frontend, `SH` shared package, `SEC` security, `QA`
  testing, `OPS` deploy and infra, `DOC` documentation, `BIZ` owner decision.
- **Size:** S under half a day, M half to 2 days, L 2 to 5 days. **Depends:** task IDs that must
  be done first.
- Branch flow `feature/*` off `develop`; one commit per finished piece of work, one-line
  `type(scope): Title`.
- Suggested order for RBAC: P0, then P1 and P2 with P10-07, then P3 to P8 with P10 frontend tasks
  as each backend phase lands, P9 alongside P4 to P8, P11 and P12 to close the release.

## Definition of done (every task)

1. Code written, lint clean, no `any` added, no hex colours in app code (M3 tokens only).
2. Unit tests added or updated; `npx nx run-many -t lint test build --projects=...` green for the
   touched projects. The known failures in `TESTING.md` §3 must not grow.
3. Server routes: `requirePermission`, scope through `scopedWhere` (once P2-02 exists), Zod
   `.strict()` validation, audit entry, OpenAPI entry.
4. Migrations: a `down.sql`, rehearsed on a copy of the Neon data.
5. No secrets, full Aadhaar or PAN, OTPs or tokens in code, logs, URLs or test fixtures.
6. UI: WCAG 2.2 AA, keyboard reachable, copy in `content.json`, no page CSS on storefront pages.
7. **Docs match the code:** the module's sections in `PLANNING.md`, `DATABASE.md`, `API.md` and
   `TESTING.md` are updated in the same commit (generated tables regenerated or edited for the
   changed rows).

## Progress

| # | Module | Done | Total | % |
|---|---|---|---|---|
| 1 | Admin and staff | 4 | 31 | 13 |
| 2 | Members | 54 | 101 | 53 |
| 3 | Customers and orders | 2 | 12 | 17 |
| 4 | Storefront | 29 | 42 | 69 |
| 5 | Static content | 2 | 5 | 40 |
| 6 | CTA banners | 4 | 5 | 80 |
| 7 | Home slider | 7 | 8 | 88 |
| 8 | Masters | 0 | 1 | 0 |
| 9 | Payments, payouts and reports | 0 | 11 | 0 |
| 10 | Analytics | 0 | 3 | 0 |
| 11 | Social media | 0 | 1 | 0 |
| 12 | Platform, security and release | 15 | 70 | 21 |
| | **Total** | **117** | **290** | **40** |

Pending before production (member release): P10-43 (DLT SMS templates), P10-44 (Railway env
vars), P10-45 (status report sign-off and migration rehearsal), P6-07 (Railway cron service).

Removed: P3-14 (superseded by the FK 409 guard and branch delete C-08). Not carried over from the
root `TASK.md` because the work shipped or another task covers it: the vendor console redesign
steps (replaced by the member detail tabs, 2026-10-15), console logout (in the sidebar), static
role switcher removal and auth wiring (dynamic RBAC), Playwright and Sentry (P10-42, P12-04),
`.env.example` files (exist), msd lint and tsc drift (P10-46).

## 1. Admin and staff

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [x] | P1-01 | DB | Migration: `PermissionScope` enum and `RolePermission.scope` (default ALL) | S | P0-05 | Merged: migration `20261008104219_add_permission_scope` |
| [ ] | P1-02 | DB | Migration: rename role key `vendor` to `member`, insert `support`, update `UserRole` links | S | P1-01 | Row counts equal before and after; partly: role rename written in migration `20261015100000_member_lifecycle`, `support` added by the seed; row counts not checked yet (P10-45) |
| [ ] | P1-03 | BE | Create `lib/role-keys.ts`; replace hardcoded `'vendor'`, `'customer'` in vendor, auth, customer, dashboard services | S | P1-02 | No string literal role key left (grep); partly: `lib/role-keys.ts` added and used for member checks; `'customer'` literals remain in auth, customer and dashboard services |
| [ ] | P1-04 | BE | Permission resolver returns `{key, scope}`; highest scope wins across roles | M | P1-01 | Unit tests: ALL beats OWN, multi-role |
| [ ] | P1-05 | SH | Restructure `msd-menu.json` to the 14 keys plus masters and dashboard; add `payments`, `logs`, `profile` nodes; remove `business` parent mismatch | M | P0-09 | Menu test passes, no orphan parent; partly: `vendors` key renamed to `members` only |
| [ ] | P1-06 | BE | Extend `permission-migration.service` to map old keys to new keys on existing `RolePermission` rows | M | P1-05 | Old custom grants preserved in rehearsal; partly: the migration SQL copies `vendors:*` grants to `members:*`; other key moves still open |
| [ ] | P1-07 | BE | Rewrite `prisma/seed.ts` from the PLANNING.md §1.2 matrix including scope and extra actions; drop `vendor-portal.*` special case | M | P1-05, P1-04 | Seed idempotent, runs twice cleanly; partly: 7 roles and the `members` row seeded; other rows still open |
| [ ] | P1-08 | QA | Matrix snapshot test: 7 roles x 14 resources x actions x scope equals spec | M | P1-07 | Test fails on any drift |
| [ ] | P1-09 | SH | `shared-types`: `PermissionScope`, `Bootstrap.scopes`, role key union. `shared-permissions`: `can()` plus `scopeFor()` | M | P1-04 | Package tests green |
| [ ] | P1-10 | BE | Guard: role permission edit cannot give `members`/`orders` scope ALL to member role; super-admin-only actions enforced in code | M | P1-04 | Negative tests return 403; partly: Super Admin role and accounts protected (P1-11); the §1.3 rule 3 action lock is open |
| [x] | P1-11 | SEC | Super Admin protection on `/rbac`: only a Super Admin manages a Super Admin account or gives/removes the role; no editing a role you hold; last active Super Admin cannot lose the role, be blocked or deleted; a Super Admin cannot be impersonated | M | - | Merged: `services/super-admin-guard.service.ts`, 7 tests in `rbac.routes.test.ts` |
| [ ] | P2-05 | BE | Read roles from DB (30 s cache) not the token; clear cache on role, permission and user-role change | M | P2-01 | Role change effective within one request after cache clear |
| [ ] | P2-06 | BE | `denyPreview` middleware for payout, delete, status, refund, staff routes; block impersonating super_admin | S | P2-01 | Preview token gets 403 on listed routes; partly: impersonating a Super Admin returns 403 (P1-11); `denyPreview` open |
| [x] | P2-15 | BE | `ROLE_MANAGEMENT_LOCKED` on role create, clone and delete | S | - | Test; done 2026-10-28: the three routes keep their permission check and return 403 `ROLE_MANAGEMENT_LOCKED`; their service functions and the clone schema removed; Role Management drops New role, Clone and Delete (part of P10-08) |
| [ ] | P4-09 | BE | Notifications: recipient type `MEMBER`/`ADMIN`; new types | S | P3-04 | Migration and test |
| [ ] | P4-10 | BE | Logs and profile scoped to own for non-super-admin | S | P2-02 | Test |
| [ ] | P8-01 | BE | `/staff-users` routes with role allowlist and last-super-admin guard | M | P1-07 | Negative tests; partly: last-active-Super-Admin guard on the current `/rbac/users` routes (P1-11) |
| [ ] | P8-02 | DB | `SystemSetting` table | S | - | Migration tested |
| [ ] | P8-03 | BE | `/settings` routes with per-key Zod schema allowlist | M | P8-02 | Unknown key returns 422 |
| [ ] | P8-04 | BE | `/logs/login-history` across users with scope; index | M | P2-02 | Scope test |
| [ ] | P8-05 | BE | `/logs/audit` filters (actor, action, target, date) and indexes | M | P2-11 | Filter tests |
| [ ] | P8-06 | BE | `/me` allowlist: name, phone, email, avatar; phone/email change goes through OTP | M | - | Role or status in body returns 422 |
| [ ] | P8-08 | BE | Bootstrap returns `scopes` | S | P1-09 | Contract test |
| [ ] | P10-01 | SH | `shared-auth/react`: expose `scopeFor()`, scope-aware `can()` and `PermissionButton`; refetch bootstrap after role change | M | P1-09, P8-08 | Component tests |
| [ ] | P10-06 | FE | Sidebar renders the new menu per role; test each of 7 roles | M | P1-05 | Snapshot per role |
| [ ] | P10-08 | FE | Role Management: 14-row matrix with V/C/E/D, extra actions, scope badge; hide New role and Clone; system roles marked | L | P10-01 | `roles/permission-matrix.tsx` tests updated; partly 2026-10-28: New role, Clone and Delete removed with P2-15; 2026-10-29: tests follow the checkbox matrix (P10-46). Open: `getScope` in `permission-matrix.tsx` decides Own/All from role keys (`member`, `super_admin`), against the no-role-name rule; scope must come from the server (P10-01, `Bootstrap.scopes`) |
| [ ] | P10-09 | FE | Super-admin-only edit, unsaved-change guard, show the self-escalation error | S | P10-08 | Test |
| [ ] | P10-10 | FE | Staff users page: create, edit, status, delete rules; role dropdown limited; last super admin message | M | P8-01 | `users/` tests updated |
| [ ] | P10-29 | FE | System settings page (super admin edit, admin view) | M | P8-03 | Tests |
| [ ] | P10-30 | FE | Logs page: login history (all or own) and audit filters | M | P8-04, P8-05 | Tests |
| [x] | P10-38 | SEC | Logout clears tokens and bootstrap; preview token never persisted past tab; no open redirects after sign-in | S | - | Tests; done 2026-10-28: `shared-auth` sign-out revokes the refresh token and clears everything, preview token in `sessionStorage` only (older localStorage previews migrated), `sanitizeReturnUrl` refuses backslash, control-character and encoded `//` paths. mera-driver's Angular `AuthService` follows the same rules since mera-driver X-06 |

## 2. Members

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [x] | P2-03 | BE | `authenticate`: load `Member.status`; SUSPENDED/ARCHIVED gives 403 `MEMBER_SUSPENDED`; INACTIVE sets `req.readOnly` | M | P3-01 | Tests for each status |
| [x] | P2-04 | BE | `blockWhenReadOnly` middleware on non-GET routes, logout and token refresh the only exceptions (no `/me`, no document or media upload) | S | P2-03 | Inactive member write returns 403 `MEMBER_INACTIVE_READ_ONLY`; GET orders, customers and catalog still 200 |
| [ ] | P3-01 | DB | Migration (expand): `MemberStatus` enum, new status columns, `documentsDueAt`, `reviewFlaggedAt`, `welcomeSentAt` | M | P0-01 | Up and down tested; partly: migration and `down.sql` written; up and down rehearsal open (P10-45) |
| [ ] | P3-02 | DB | Backfill status mapping and `documentsDueAt` for existing members | S | P3-01 | Counts per status match mapping table; partly: backfill SQL written; counts not checked on real data yet (P10-45) |
| [ ] | P3-03 | DB | `MemberStatusHistory` table and indexes | S | P3-01 | Migration tested; partly: table and index in the migration; rehearsal open (P10-45) |
| [x] | P3-04 | BE | Rename Prisma model `Vendor` to `Member` with `@@map("Vendor")`; regenerate client; fix types | L | P3-01 | `nx build msd-api` green |
| [ ] | P3-05 | BE | Rename `vendor.service`, schemas and routes internally to member; keep behaviour | L | P3-04 | Existing tests green |
| [x] | P3-06 | BE | Member status state machine service (transitions, reason rules, side effects in one transaction) | M | P3-03 | Table-driven tests for all transitions |
| [x] | P3-07 | BE | `PATCH /members/:id/status` with history, audit, notification | M | P3-06, P2-11 | Integration test |
| [x] | P3-08 | BE | On suspend: revoke all `RefreshSession`, clear permission cache | S | P3-07 | Refresh after suspend returns 401/403 |
| [x] | P3-09 | BE | `DELETE /members/:id`: hard delete if zero orders, else ARCHIVED; super_admin only; reason required | M | P3-06 | Both outcomes tested |
| [x] | P3-10 | BE | `publicVisibleWhere()` in `catalog-visibility.ts`; apply to every `/catalog` query | M | P3-04 | Suspend hides, reactivate restores (test) |
| [x] | P3-11 | BE | Welcome SMS/email on member create via a template service | M | P6-03 | Message logged once, no duplicate on retry |
| [ ] | P3-12 | BE | `/members` routes; `/vendors*` kept as aliases with `Deprecation` header and usage log | M | P3-05 | Both paths work; partly: `/members` routes and `/vendors` aliases with `Deprecation` and `Link` headers work; no alias usage log yet |
| [x] | P3-13 | BE | `GET /members/:id/status-history` and `/activity` | S | P3-03 | Scoped test |
| [x] | P3-15 | BE | Remove deal approval gate if decision 2 says so (migration plus code) | M | P0-01 | Deals publish without approval; done 2026-10-27 with DL-03: no approval routes, every deal APPROVED by the migration, visibility no longer reads it |
| [ ] | P3-16 | DB | Contract migration: drop `kycStatus`, `kycRejectionReason`, legacy GST/PAN/`kycDocuments` | M | P5-02, P12-03 | Done only after one release without readers |
| [x] | P3-17 | BE | On suspend: send email and SMS to the member with the reason, support contact and steps to return to active; send "active again" message on reactivation | M | P3-07, P6-03 | Message sent once per change; provider failure recorded and retried, suspension kept |
| [x] | P3-18 | BE | Suspended member login and OTP request return 403 `MEMBER_SUSPENDED` with reason and steps; no OTP sent | S | P2-03 | Test: suspended phone gets the message, no OTP row created |
| [ ] | P3-19 | DB | Status backfill report: counts per old `VendorStatus` and per new `MemberStatus`, reviewed before the migration runs | S | P3-01 | Report saved, owner signs off on the REJECTED to SUSPENDED count; partly: `prisma/member-status-report.ts` written; report run and owner sign-off open (P10-45) |
| [x] | P3-20 | BE | Support contact for the suspension notice from env vars `SUPPORT_EMAIL` and `SUPPORT_PHONE` (`SystemSetting` keys wait for P8-02) | S | - | Notice shows the configured contact |
| [x] | P3-21 | BE | Remove `POST /vendors/me` and `POST /vendors/me/submit` and the vendor approve and reject routes (ARCHITECTURE.md C-11) | M | P3-12 | Routes return 404, OpenAPI updated |
| [ ] | P3-22 | BE | Rename `vendor.service.ts`, `vendors.routes.ts` and the `Vendor*` Zod schemas to member names | S | P3-12 | No `vendor` in those file or schema names; existing tests green |
| [ ] | P3-23 | FE | Move the member detail page and self-service calls in msd from `/vendors/:id` and `/vendors/me` to `/members/*` before the alias is removed | S | P3-12 | No `/vendors` request left in `apps/msd/src/api` (grep) |
| [x] | P3-24 | BE | Return structured fields (from status, to status, document type, actor id) from the member activity API so the client stops parsing summary sentences | S | P3-13 | Activity items carry the fields; `readableActivitySummary` removed from `apps/msd`; tests; done 2026-10-28: typed fields per kind (status, document, reminder) next to `summary`; console `activityText` builds the sentence, `readableActivitySummary` removed |
| [x] | P3-25 | BE | Hard delete of a member also removes the media files of its deals, products and therapists from R2, not only its own documents, images and video | S | P3-09 | Test: every storage key of the cascaded rows is deleted after commit; archive keeps all files; done 2026-10-27: `memberStorageKeys` also reads deal, product and therapist images and videos before the delete |
| [ ] | P4-01 | BE | Members list, get, update through `scopedWhere` | M | P2-02, P3-05 | Member A cannot read B (404) |
| [ ] | P4-02 | BE | Branches: flat routes plus scope plus status endpoint | M | P4-01 | IDOR test |
| [ ] | P4-03 | BE | Deals: scope, status, `PUT /deals/:id/therapists` with branch and member checks | L | P4-02 | Cross-branch assignment returns 422 |
| [ ] | P4-04 | BE | Therapists: scope and branch checks | M | P4-02 | IDOR test |
| [ ] | P4-05 | BE | Products: scope; remove duplicate unscoped list | M | P4-01 | IDOR test |
| [ ] | P4-11 | BE | Cross-resource ownership validators (branch to member, therapist to branch, category access) in one shared service | M | P4-02 | Unit tests |
| [ ] | P4-13 | BE | Grant `members:view` and `members:edit` with own scope to role `member`, then retire `members:custom` | M | P4-01 | Member reads and edits only their own record; `members:custom` gone from the seed |
| [x] | P4-14 | BE | Product category without per-member grants (D10, C-07, C-12 for products): `createProduct` and `updateProduct` check only active `PRODUCT` type and subcategory parentage | S | - | Member with no `VendorCategoryAccess` row creates a product; a `SERVICE` category is rejected; tests |
| [x] | P4-15 | BE | Finish C-12 for deals and therapists: drop vendor and branch category grant checks, retire the `PUT .../category-access` routes and the onboarding grant step | M | P4-14 | Deal and therapist create work with no grants; grant routes return 404; tests; done 2026-10-27: no grant checks or grant routes (404), branch and therapist forms have no grant step, dashboard counts used categories; grant tables and `offers*` flags dropped in the contract step |
| [x] | P4-16 | BE | Member customers view (C-16, D9, D19): `GET /customers` own scope, customers with an order item from the member, name, city, order count, last order date | S | P4-01 | Member sees only own customers; no phone or email unless an order is open; done 2026-10-28: `GET /vendors/me/customers` returns city and `hasOpenOrder`, phone and email only with a CONFIRMED order; staff route keeps full contact; console shows City and "Hidden until an order is open"; flat `GET /customers` own scope moves to P4-01 |
| [ ] | P5-01 | DB | `MemberDocument` migration: status, masked number, hash, reviewer, expiry, uploader fields | M | P3-01 | Up and down tested; partly: columns in the migration; up and down rehearsal open (P10-45) |
| [ ] | P5-02 | DB | Copy legacy GST, PAN and `kycDocuments` into `MemberDocument`; verify counts | M | P5-01 | Count and checksum report; partly: existing `VendorDocument` rows become SUBMITTED; legacy GST, PAN and `kycDocuments` columns not copied yet |
| [x] | P5-03 | BE | Private R2 bucket client, presigned GET (5 min), `.pdf` ContentType fix | M | P2-09 | Merged: `R2_PRIVATE_BUCKET`, `signedFileUrl` (300 s), `.pdf` content type; no fallback to the public bucket |
| [ ] | P5-04 | OPS | Script to move existing files from public to private bucket, verify checksums, then remove public copies | M | P5-03 | Run on staging, public URLs return 403/404 |
| [x] | P5-05 | BE | Validators: PAN, GST with state code, Aadhaar with Verhoeff; masking functions | M | P2-14 | Table tests with valid and invalid samples |
| [ ] | P5-06 | BE | Upload endpoint: magic bytes, 5 MB, duplicate-number check by hash, store masked, `uploadedOnBehalf` | L | P5-03, P5-05 | Upload tests incl. polyglot and wrong type; partly: type sniffing, duplicate check by hash, masked and encrypted number and `uploadedOnBehalf`; stored in the private bucket since P5-03 |
| [x] | P5-07 | BE | Checklist endpoint; support gets type and status only | S | P5-01 | Support response has no file key |
| [ ] | P5-08 | BE | `download-url` endpoint with audit and rate limit; blocked for support | S | P5-03 | Test per role; partly: approvers get the file key on the list, support gets none; no `download-url` endpoint, audit or rate limit (P5-14) |
| [ ] | P5-09 | BE | Review endpoint approve/reject; reason required on reject; notify member | M | P5-01 | State tests; partly: approve and reject with a 10 to 500 character reason, state tests pass; member notification open |
| [ ] | P5-10 | BE | Expiry job sets EXPIRED when `expiresAt` passed | S | P6-04 | Time-travel test |
| [x] | P5-11 | BE | Derive "Documents complete / incomplete" and due date for list and detail | S | P5-01 | Unit test |
| [ ] | P5-12 | SEC | Decide and add malware scanning for uploads (provider or ClamAV) | M | P5-06 | Infected sample rejected |
| [ ] | P5-13 | BE | Encrypt and mask bank account number at rest | M | P2-13 | Raw DB value is ciphertext |
| [x] | P5-14 | BE | Signed URL download for member documents, replacing the `storageKey` in list responses | M | P5-03 | Merged: `fileUrl` replaces `storageKey`; tests assert no key in responses |
| [x] | P5-15 | BE | Documents list returns the uploader name, and the row shows "uploaded by <name> for member" | S | P5-07 | Test shows the name; done 2026-10-28: `uploadedByName` on every documents list row (staff uploads only, one lookup); the Documents tab shows "Uploaded by <name> for the member" |
| [x] | P6-01 | DB | `MemberDocumentReminder` table with unique (member, sequence, channel) | S | P3-01 | Merged: migration `20261017100000_member_document_reminders` (one row per reminder with per-channel status; unique member + sequence) |
| [x] | P6-02 | BE | Reminder schedule service (due +0, +7, +14 days, listing exact missing documents) | M | P6-01 | Merged: `member-reminder-policy.ts` with fake-clock tests; missing list stored per reminder |
| [ ] | P6-03 | BE | Notification template service for SMS and email (generic, replaces OTP-only sender) | M | - | Provider failure recorded, no crash; partly: minimal: welcome, suspension and reactivation notices by email and SMS with one inline retry; OTP sender not replaced |
| [x] | P6-04 | BE | Secured cron endpoint (`x-cron-secret`, timing-safe), run lock, idempotent | M | P6-02, P2-09 | Merged: `POST /internal/jobs/document-reminders`, timing-safe `x-cron-secret`, conditional claim instead of a lock; double run sends once (test) |
| [x] | P6-05 | BE | Set `reviewFlaggedAt` after final warning; never auto-suspend | S | P6-02 | Merged: flag one week after warning 3 (D4 = day 35), bell to `members:status_change` holders, flag cleared when documents complete; status never changes (test) |
| [x] | P6-06 | BE | Manual remind endpoint | S | P6-03 | Merged: `POST /members/:id/documents/reminders` and the header "Remind now" button; once per 24 hours; audit `member.reminder.sent` |
| [ ] | P6-07 | OPS | Railway cron schedule and failure alert | S | P6-04 | Steps written in `docs/msd/DEPLOYMENT.md`; Railway cron service and failure alert not created yet |
| [ ] | P6-08 | BE | Durable retry for failed member notices (welcome, suspension, reactivation) | S | P6-04 | Partly: reminders retry failed channels on later runs (5 attempts); welcome, suspension and reactivation notices still retry inline only |
| [ ] | P10-02 | SH | Pure validators (PAN, GST, Aadhaar, IFSC, phone, reason) in `shared-utils`, reused by forms and tests; server stays authoritative | M | P5-05 | Same fixtures as backend pass |
| [ ] | P10-03 | FE | API client error mapping: `MEMBER_SUSPENDED`, `ROLE_MANAGEMENT_LOCKED`, 422 field errors, 429 retry-after | M | P9-08 | Unit tests; partly: 409 and 422 field errors mapped on the add member form; no `MEMBER_SUSPENDED`, `ROLE_MANAGEMENT_LOCKED` or 429 mapping |
| [ ] | P10-04 | FE | Global states: suspended screen, read-only banner for inactive, session-expired, 403 and 404 pages, preview banner disables sensitive actions | M | P10-03 | Component tests; partly: inactive read-only banner in the admin layout and suspended note on the detail page; other global states open |
| [ ] | P10-05 | FE | Rename Vendor to Member in UI copy (`content.json`), menu, and routes `/account/members/*` with redirects from `/account/vendors/*` | M | P1-05 | Old URLs redirect; partly: routes `/account/members/*`, menu and redirects from `/account/vendors/*` done; role chooser copy in `content.json` still says Vendor |
| [ ] | P10-07 | FE | Design spec for member detail, documents and review screens (60/30/10, M3 tokens) via skylabs-neha | M | - | Spec approved |
| [ ] | P10-11 | FE | Members list: status filter, documents chip, review-flag filter, due date, server paging and sort | M | P3-12, P10-05 | Tests; partly: status, documents and review-flag filters, documents chip, due date and server paging done; no sort |
| [ ] | P10-12 | FE | Create member form with shared validators and duplicate phone/email handling | M | P10-02 | Tests; partly: short form with duplicate phone and email errors on the field; validators are local copies of the server schema until P10-02 |
| [x] | P10-13 | FE | Member detail header: name, status, documents chip, due date, only the actions the viewer may use | M | P10-07 | Tests per role |
| [x] | P10-14 | FE | Tabs: Profile, Documents, Branches/Deals/Therapists, Activity | M | P10-13 | Keyboard and ARIA tab pattern |
| [x] | P10-15 | FE | Status change with inline confirm and reason (10 to 500 chars), history list | M | P3-07 | Tests |
| [x] | P10-16 | FE | Delete member (super admin only) with inline confirm; message for the ARCHIVED outcome | S | P3-09 | Tests |
| [x] | P10-17 | FE | Documents tab: per-document status chips, masked number input, upload, approve, reject with reason, "uploaded by X for member", view via signed URL in new tab | L | P5-06, P5-09 | Tests; support sees status only; partly: status chips, masked number, upload on behalf, approve and reject done; uploader name done (P5-15); signed URL from P5-14 (server only); done 2026-10-28: "View <document> file" link added with P10-37, every part now built and tested |
| [x] | P10-18 | FE | Activity tab: reminders, warnings, status timeline | M | P3-13, P6-01 | Merged: reminders, manual reminders and the review flag in the Activity tab |
| [x] | P10-19 | FE | "Ready for suspension review" badge with reason prefilled "Documents not completed" | S | P6-05, P10-15 | Merged: the flag is now set by the reminder job; badge, filter and prefilled reason read it |
| [ ] | P10-20 | FE | My profile and business profile (own view/edit) | M | P8-06 | Tests |
| [ ] | P10-21 | FE | Own documents: upload, state, reasons, "documents due in N days" banner | M | P10-17 | Tests |
| [ ] | P10-22 | FE | Own branches, deals, therapists, products: no delete control, pause/unpublish toggle; inactive member sees everything view only, with no edit, add or toggle controls | L | P4-02 to P4-05, P10-04 | Tests |
| [x] | P10-23 | FE | Deal form: branch required, therapist picker filtered to branch, validation messages (folded into DL-10) | M | P4-03 | Tests; done 2026-10-27 as DL-10 |
| [ ] | P10-24 | FE | Own orders, payments, payouts, reports | M | P7-08, P7-10 | Tests |
| [ ] | P10-39 | FE | Copy for statuses, warnings, empty and error states in `content.json` via skylabs-reena | M | P10-07 | Reviewed, banned-word check |
| [ ] | P10-43 | OPS | Register DLT-approved SMS templates for the welcome, suspension and reactivation texts in `apps/msd-api/src/lib/member-messages.ts` before production | S | - | Template IDs approved and recorded |
| [ ] | P10-44 | OPS | Set `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `FIELD_ENCRYPTION_KEY` and `DOC_HASH_PEPPER` on Railway before this slice ships | S | - | Staging and production boot with all 4 set |
| [ ] | P10-45 | OPS | Run `prisma/member-status-report.ts` and get owner sign-off before applying the `member_lifecycle` migration; rehearse migration up and down on a Neon copy | M | P0-05 | Report saved, sign-off recorded, rehearsal log with row counts |
| [ ] | P10-46 | QA | Fix pre-existing lint and test drift: eslint ignore error in shared-* packages and 31 msd lint errors; 26 msd tests in 15 files (permission-matrix, roles, widget-registry, settings, home, wishlist, become-vendor, india-locations, deal-card, sky-product-card-wc, media-uploader, site-footer, contact-us, app.spec, entry-server); msd-api `rbac.routes` and orders image tests; shared-menu `index.test.ts` | M | - | `nx run-many -t lint test` green for msd, msd-api and shared-* (partly, 2026-10-29: msd-api tests green; shared-* lint and tests green; msd lint 0 errors; msd tests down to 5 failures in 2 files: `home` 4, `category` 1) |
| [x] | P10-47 | FE | Rename "All Member" to "All members" in the sidebar title (`packages/shared-menu/src/msd-menu.json`) and the breadcrumbs of the branch, deal, product and therapist form pages | S | - | grep finds no "All Member" in `apps/msd/src` or `packages/shared-menu`; tests updated; done 2026-10-28: sidebar title renamed; the six member pages build the trail from one `member-crumbs.ts` (`MEMBERS_TRAIL`, `memberTrail`) |
| [x] | P10-48 | FE | Product form (member detail Products and member self-service): Category (required), Subcategory and Type (optional) list all active `PRODUCT` categories, not per-member grants; "New" and "Featured" checkboxes stay on the form | S | P4-14 | Member with no grants sees the category list; both checkboxes save `isNew` and `isFeatured`; tests |
| [x] | P10-49 | FE | Member detail page shows total customers and total orders (counts linking to the filtered lists) | S | P4-16 | Counts match the lists; support sees counts only; done 2026-10-28: `customerCount` and `orderCount` on the member detail API; header counts link to a new Customers tab (`customers:view`) and to `/account/orders?vendorId=` (`orders:view`), plain numbers otherwise. "Support sees counts only" replaced by these permission checks (owner decision 2026-10-28: Support holds both views, D12) |
| [ ] | P5-16 | SEC | Switch `STORE_FULL_DOCUMENT_NUMBER` (default true in development): when false, write only the masked number and hash; production boot warns while it is true (D3) | S | P2-13 | Both modes tested; no full number stored when false |
| [ ] | DL-01 | DB | Deal schema S18 to S21 and backfill S23 (PLANNING §2.7, DATABASE §2) with `down.sql` | M | owner approval of §2.7 | Migration up and down on a Neon copy; counts of backfilled rows recorded; partly 2026-10-27: migration `20261026100000_deal_page_fields` + `down.sql` written, client generated, applied locally 2026-10-27 (empty `migrate diff`, 38 deals backfilled); Neon rehearsal open |
| [x] | DL-02 | SH | India location list to `packages/shared-utils`; branch `state` and `city` required from it, `addressLine2` (C-03, S22) | M | - | Unknown state or city returns 422; msd form and API use the one list; report of existing bad rows; partly 2026-10-27: list in `@skylabs-monorepo/shared-utils`, API and both branch forms require state + city, `addressLine2` added; done 2026-10-27: report script `npm run msd-api:prisma:report-branch-locations` (0 bad rows locally), `state`/`city` `NOT NULL` migration; Neon run with DL-01 |
| [x] | DL-03 | BE | Deal create/update `.strict()` schemas, slug rule, server-derived prices (C-04, C-05), single-deal GET, Active readiness check, Super Admin-only delete, seed grants per §2.7 matrix (C-18) | L | DL-01, P3-15 | TESTING §4.2 deal cases green; done 2026-10-27 |
| [x] | DL-04 | BE | Package routes: add, edit, delete, reorder (staff and `/me`) | M | DL-03 | 409 rules tested; done 2026-10-27 |
| [x] | DL-05 | BE | Staff deal media routes and image alt text | S | DL-01 | Staff upload, reorder, alt text; member route unchanged; done 2026-10-27 |
| [x] | DL-06 | BE | Copy deal to another branch of the same member as Draft | S | DL-03 | Copy test; done 2026-10-27 |
| [x] | DL-07 | BE | `GET /catalog/deals/:idOrSlug` and the full detail response (API §4) | M | DL-03 | Route tests for UUID, slug, old slug, hidden deal; done 2026-10-27 |
| [x] | DL-08 | BE | Cart and checkout: per-customer limit and stock (409 `DEAL_LIMIT_REACHED`, `DEAL_SOLD_OUT`) | S | DL-01 | Cart tests; done 2026-10-27 |
| [x] | DL-09 | BE | Deal search over title, member, category, subcategory and city with ranking; S24 trigram indexes | M | DL-01 | Search tests; EXPLAIN shows the GIN index; done 2026-10-27: search over title, member, category, subcategory, city with title-first ranking and tests; EXPLAIN uses `Deal_title_trgm_idx` |
| [x] | DL-10 | FE | One deal form for staff and members (C-17): sections in §2.7 order, branch-first empty state, package cards, inline therapist, FAQs, readiness checklist; delete `DealDialog` | L | DL-03, DL-04, DL-05 | Form tests per role; checked at 1366 and 390 px; partly 2026-10-27: form, package cards, inline therapist, FAQs, checklist, Copy to branch, `DealDialog` deleted, `deal-form-page.test.tsx` 18 tests; done 2026-10-27: console create, packages, images, Go live, copy, Sales edit and Admin no-delete checked by the owner |
| [x] | DL-11 | FE | Branch form: State, then City from the shared list | S | DL-02 | Form test; done 2026-10-27 |
| [x] | DL-12 | FE | Deal page sections in §2.7 order (packages, buy box limits, accordions, therapists, about the business, FAQs) on existing `detail-page` blocks (C-19) | L | DL-07 | `deal-detail.test.tsx`; checked at 1366 and 390 px; done 2026-10-27: all sections and `deal-detail.test.tsx`, checked at 1366 and phone width; single-branch map stays ST-26 |
| [x] | DL-13 | FE | Deal gallery: thumbnails, phone swipe, full-screen view with keyboard and counter | M | DL-07 | Gallery tests; axe clean; partly 2026-10-27: thumbnails, arrows, swipe, dots, full-screen dialog with keys and counter, tested; done 2026-10-27: Lighthouse accessibility 100 |
| [ ] | DL-14 | FE | Deal SEO: `/deal/:slug` route with UUID and old-slug replace, canonical, title and meta rules, JSON-LD, prerender and sitemap of Active slugs | M | DL-07 | TESTING §4.4 deal page cases; Rich Results test passes; partly 2026-10-27: slug route with old-slug replace, canonical, title/meta rules, JSON-LD, deal prerender + sitemap; Rich Results test open (needs a public URL) |

## 3. Customers and orders

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P4-06 | BE | Orders: scope on `OrderItem.vendorId`; strip other members' items | M | P2-02 | Mixed-vendor order test; partly: member scope fixed in P4-17 |
| [ ] | P4-07 | BE | Customers: support and sales view-only, member view own (D9, PLANNING.md §1.2 matrix) | S | P1-07 | Matrix test |
| [ ] | P7-01 | DB | `RefundRequest` table; `REFUNDED`, `PARTIALLY_REFUNDED` payment statuses | M | P0-01 | Migration tested |
| [ ] | P7-02 | BE | `POST /orders/:id/cancel` with reason, state rules, notifications | M | P4-06 | Invalid state returns 409 |
| [ ] | P7-03 | BE | Refund request create (support) | S | P7-01 | Support can raise, cannot approve |
| [ ] | P7-04 | BE | Refund approve: Razorpay refund API, amount cap, idempotent, reconcile via webhook | L | P7-03, P2-12 | Double click refunds once |
| [ ] | P7-05 | BE | Refund reject with note | S | P7-03 | Test |
| [ ] | P7-13 | SEC | Razorpay webhook: raw-body HMAC, timing-safe compare, event id replay table | M | - | Replay ignored |
| [ ] | P10-25 | FE | Orders: cancel with inline confirm; support raises refund request; admin refund queue approve/reject | L | P7-02 to P7-05 | Tests per role |
| [ ] | P10-26 | FE | Customers: view, block/unblock with reason; support view only | M | P4-07 | Tests |
| [x] | P4-18 | SEC | Members never change order status: `PATCH /orders/:id/status` needs `orders:status_change`; status actions hidden for members (D27) | S | - | Merged: route and screen tests |
| [x] | P4-17 | SEC | Member order scope: a member with no business record gets an empty Orders and Customers list (was: every order); a `branchId` filter narrows the member's own orders, never replaces the scope | S | - | Merged: 4 tests in `orders.routes.test.ts`, 1 in `vendors.routes.test.ts` |

## 4. Storefront

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-33 | FE | Storefront check: suspended member's deals, branches and therapists absent; deal URL returns not-found page; prerender and sitemap exclude them | M | P3-10 | Manual and `hydration.test.tsx` |
| [x] | ST-01 | FE | Create the `/member` page that the header "Become a Member" link opens | S | - | Done: the link opens `/become-member` (member sign-up, `become-vendor.tsx`); `header-actions.test.tsx` checks the link and its route |
| [ ] | ST-02 | FE | Transparent and dark-mode logo asset (`logo.jpg` has a white background) | S | - | Logo reads on dark surfaces |
| [ ] | ST-03 | BIZ | Decide where staff land when they open "Account" on a phone (console has no bottom nav) | S | - | Decision recorded in PLANNING.md §4 |
| [x] | ST-04 | FE | 10 public pages render their own `<main>` inside the layout `<main>` (about, become-vendor, blog, blog-detail, careers, checkout, contact, how-it-works, showcase, website-page): change page roots to `div`/`article` | S | - | One `<main>` per page (test); done 2026-10-28: the last four (blog, blog detail, checkout, showcase) use `div`; `one-main-landmark.test.ts` fails on any `<main>` in `app/pages` |
| [x] | ST-05 | FE | Tell the visitor when "Use my current location" fails or is more than 75 km from any partner city | S | - | Done: `requestBrowser` resolves `far`; `CityPicker` shows the far or failed alert; `city-picker.test.tsx`, `location-context.test.tsx` |
| [x] | ST-06 | QA | Header and tab bar tests: search submit, signed-in account menu, `useAccountLinks` role branches | S | - | Done: `role-routing.test.ts` (landing per role), `shell-labels.test.tsx` (`useAccountLinks`); fixed the member check (`member`, not `vendor`) and support as staff |
| [x] | ST-07 | FE | `/help` and `/gifting` footer links have no routes (404) | S | - | Routes exist or links removed; done 2026-10-28: `/help` already pointed to `/help-center`; the "Gifting" link removed until a gift-card feature exists (owner decision) |
| [x] | ST-08 | FE | Public pages without a meta description (cart, sign-in, otp, orders, invoice, choose-experience) move to `Seo` | S | - | Every public route has a description; done 2026-10-28: cart, sign in, OTP, orders, invoice (and its not-found view, now noindex too) and choose experience render `Seo` with a `content.meta` description |
| [ ] | ST-09 | BIZ | Owner supplies footer brand contact details (phone, email) | S | - | Copy in `content.json` |
| [ ] | ST-10 | OPS | When the custom domain goes live, set `VITE_SITE_URL` (website origin, not the API) for Vercel Production and redeploy; until then canonicals, OG, most JSON-LD and sitemap/robots/llms are omitted. The Vercel build must reach the Railway msd-api (prerender data) | S | X-01 | Canonical tags and sitemap present on production |
| [ ] | ST-11 | OPS | On the first Vercel preview, verify `/api/geo`, that `/category/x/` and `/spa.html` 308 to `/category/x` and `/spa`, and that non-prerendered routes get the SPA shell | S | - | Checklist ticked |
| [ ] | ST-12 | OPS | Vercel deploy hook (cron or on catalog change) so prerendered pages rebuild when deals change | S | - | Hook fires, pages refresh |
| [x] | ST-13 | BIZ | Decide whether `/category/product` and `/category/therapy` are indexable or redirect to `/products` and `/therapists` | S | - | Done 2026-10-24: D31, both indexable; chips link listing and category pages |
| [x] | ST-14 | FE | Add `prerender/` to a tsconfig so it is type-checked | S | - | `tsc` covers prerender; done 2026-10-28: `apps/msd/tsconfig.prerender.json` (bundler resolution for Vite 8 types, app element typings included); `nx run msd:typecheck` runs it beside the app config; 0 errors in `prerender/` |
| [x] | ST-15 | FE | `showcase.tsx` and unused `product-card.tsx` pass camelCase props to raw custom elements; fix, and delete `product-card.tsx` if unused | S | - | Done 2026-10-24: 80 props in 9 files moved to kebab-case (incl. `OfferCard` `price-first`, `image-alt`, `badge-color`/`badge-tone`, `original-price`, header `clear-label`), `product-card.tsx`/`.css` deleted, `SkyProductCardWC` writes `favorite`/`favorite-active` as attributes; guard `src/sky-element-props.test.ts`, hydration case in `offer-card.test.tsx` |
| [x] | ST-16 | FE | Audit app-level CSS in the dark theme (the footer theme switch exposes it) | S | - | Done: removed light hex fallbacks from `var()` (styles, blog, blog post, my account, not found), video backgrounds use `scrim`, checkout card uses `--sky-elevation-1`, Razorpay colour comes from the theme seed; `theme-colours.test.ts` guards it |
| [x] | ST-18 | FE | Popular searches render only on the client until the catalog is seeded into the prerender | S | - | Done: the shell payload already seeds categories and locations, so the footer renders them on the server; `hydration.test.tsx` guards the links and a clean hydration when a saved city reorders them |
| [x] | ST-19 | FE | Shared `--sky-content-max` token for the 1280px / 16px containers (header, footer, home) | S | - | One token, no repeated values; done 2026-10-28: `--sky-content-max` and `--sky-content-gutter` on `:root` in `styles.css`, used by page sections, header, footer, breadcrumb and the product "related" band; `content-width.test.ts` fails on any other 1280px |
| [x] | ST-20 | FE | Move the remaining `useCurrentLocation` callers (category, search, therapists, vendor) to `useVisitorLocation` | S | - | `useCurrentLocation` deleted (category, search and therapists move with ST-41 to ST-43); done 2026-10-28: the member page was the last caller; it reads `useVisitorLocation()` and `hooks/useCurrentLocation.ts` is deleted; `resolveBranch` tested (`vendor.test.tsx`) |
| [x] | ST-21 | FE | Move `/categories`, therapists, orders, invoices and payments off `category.css` onto `PageSection`/`CardGrid`, then delete `category.css` | M | - | Done 2026-10-22: pages migrated, `category.css` deleted |
| [ ] | ST-22 | BIZ | Reviews system (customers rate completed orders) so the category page can add a rating sort, rating filter and card ratings | L | - | Module rules written in PLANNING.md |
| [x] | ST-25 | FE | Filter panel polish: keep selected Business/Branch options visible outside the facet list or past "Show more"; clamp URL min/max into the slider bounds when facets narrow | S | - | Done: `CheckboxFacet` pins selected options (all facets), `PriceRangeField` clamps shown values; `checkbox-facet.test.tsx`, `price-range-field.test.tsx` |
| [x] | ST-26 | FE | Deal page single-location map using `DealMap` | S | - | Map shows the branch; done 2026-10-27: compact `DealMap` (one plain marker) in the deal page Location panel after hydration, only when the branch has coordinates; fixed `GET /catalog/locations` 500 (null filters on the now-required state/city) |
| [ ] | ST-27 | OPS | Before traffic grows, move `VITE_MAP_TILE_URL` off `tile.openstreetmap.org` to a free-tier tile provider (OSM tile policy) | S | - | Env changed on Vercel |
| [ ] | ST-28 | BE | Newsletter backend (msd-api table and endpoint) for the footer signup, which is UI only today | M | - | Signup stored; footer copy updated |
| [x] | ST-29 | SEC | JSON-LD on deal, product, products and member pages goes through `<JsonLd>` (escapes `</script>`); a member-supplied name could run script before | S | - | Merged: guard test `seo/json-ld-usage.test.ts` fails on any raw `application/ld+json` |
| [x] | ST-30 | FE | Offer card (`OfferCard` in `app/components/offer-card`, used by the home hero with `color="surface-high"` `variant="plain"` and the showcase): `sky-product-card` `price-first`, `description`, `badge-color`/`badge-tone` (theme-role tags), `color` (M3 roles, shared `actionRoles` for slotted buttons), shared `lineClamp` and `mediaCorner` styles; real deal and product with Add to cart (`showCartAdded`), wishlist and the shared `useRequireSignIn` guard; grid and list | M | - | Merged: `sky-product-card.test.ts`, `offer-card.test.tsx`, `home.test.tsx` hero, `use-require-sign-in.test.tsx`; checked at 1440 and 390 px |
| [ ] | ST-31 | FE | Replace listing cards with the offer card page by page (home, category, explore, search, member, wishlist) and move the ~40 inline sign-in redirects onto `useRequireSignIn` | L | ST-30 | Each page's tests; no visual regressions (done 2026-10-22: home, hero, category, explore/search, products, wishlist, deal and product "You May Also Like"; left: member page, remaining inline redirects) |
| [ ] | ST-33 | BE | Public contact message endpoint (`POST /catalog/contact-messages`, table, console list) so the Contact form stores messages instead of opening the email app | M | - | Message stored; form posts; tests |
| [ ] | ST-34 | BIZ | Owner supplies the real office address, phone and email (CMS Contact Us), replacing the `content.contact.defaults` placeholders | S | - | CMS row filled. Decide too: the CMS Contact Us form accepts only a 10-digit mobile (`validatePhone`), so a landline office number is refused today |
| [x] | ST-35 | FE | Static page headers show the brand logo in the right column; Contact gets details + form + map; Become a member uses the same layout; 8 default FAQs; About copy describes a marketplace | M | - | Tests in contact, become-vendor, section-head |
| [x] | ST-36 | FE | Offer card for services: title only, `divided` (hairline, then member and place on one line each; shared-ui `sky-product-card` option); `slider` prop (image slider with previous / next and dots via `ProductCardGallery fill`, on every listing); `TherapistCard` + `lowestPackagePrice` / `formatDistance` replace four hand-built therapist cards; list-layout images no longer stretch the row | M | ST-30 | Merged: `sky-product-card.test.ts` (divided), `offer-card.test.tsx` (slider), `search.test.tsx`; checked at 1366 and 390 px |
| [x] | ST-37 | FE | Therapist detail laid out like the deal page: shared `components/detail-page` (gallery, price, quantity + total + Add to cart + share, location and hours, not found), one generic `DurationPackageSelector` (therapist selector removed), therapist cart line from the page, "More therapists at {member}" rail; deal page moved onto the same blocks | M | - | Merged: `therapist-detail.test.tsx`; deal and therapist pages checked at 1366 and 390 px |
| [x] | ST-38 | FE | Header search panel: location row (Near {city} / set location), inline location step (`CityPicker`, shared with `CityPickerDialog`: city filter, current location, refused-location error), rich Deals / Therapists / Products rows, Show all with total; `sky-action-field` gains `clearable` and combobox wiring (`expanded`, `controlsElement`, `activeOption`) | M | - | `site-header.test.tsx`, `use-search-suggestions.test.ts`, `city-picker.test.tsx`, `sky-action-field.test.ts`; checked at 1366 and 390 px |
| [x] | ST-39 | BIZ | Decide how a card gets its tag | S | - | Done 2026-10-24: D30, computed by the API (PLANNING §4 tag rule) |
| [x] | ST-40 | BE | Catalog API for the listing pages: `tag` on deals/products + `tags` filter + tag facet counts; `GET /catalog/products/facets` and `categoryIds`; therapists sort, price, radius, city, member/branch filters and `GET /catalog/therapists/facets` | L | ST-39 | Done 2026-10-24: `offer-tag.test.ts`, `therapist-ranking.test.ts`, `product-facets.test.ts`, `deal-ranking.test.ts` tag facet, 13 new `catalog.routes.test.ts` cases; checked live on :3333 |
| [x] | ST-41 | FE | One listing shell from the category page (count on the chip row, per-kind `FilterPanel` with Category and Tags facets, card tags); category page moved onto it | M | ST-40 | Done 2026-10-24: `components/listing/`, `filter-panel.test.tsx`, `chip-nav.test.tsx`, `category.test.tsx` (tag filter, server-side therapist sort); checked at 1366 and 390 px |
| [x] | ST-42 | FE | `/deals`, `/deals/:city`, `/products`, `/therapists`, `/therapists/:city` on the shell, category chips as links, prerender + JSON-LD + sitemap | L | ST-41 | Done 2026-10-24: `ListingPage` (`listing-page.test.tsx`), prerender routes + `loadListingData` (`routes.test.ts`); old products and therapists pages removed; checked at 1366 and 390 px |
| [x] | ST-43 | FE | `/explore` on the shell with kind chips and counts, `noindex, follow` | M | ST-41 | Done 2026-10-24: `search.test.tsx` rewritten (kind chips, counts, category param, `noindex, follow`, sign-in path); state/city dialogs replaced by the shared filter panel; checked at 1366 and 390 px |
| [x] | ST-44 | FE | Home "Shop by category" becomes "Deals by category" with all 10 categories in a 5x2 grid from 840px (2 columns below) | S | - | Done 2026-10-24 (b01a585) |
| [x] | ST-45 | FE | Category tiles get the M3 hover/press state layer (`sky-tile-card` with a slotted headline link); card rails and the home hero stop clipping card shadows and focus rings (padding inside Swiper's `::part(container)`) | S | - | Done 2026-10-24 (26981d8): `sky-tile-card.test.ts`; checked at 1280 px |

Removed 2026-10-24: ST-17 (therapist city filter is in ST-40; products are not location bound, D29), ST-23 (explore filter panel is ST-43), ST-24 (products have no Business filter, D29).

## 5. Static content

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P8-07 | BE | Swap every `cms.*` gate to `content:<action>` | M | P1-05 | Matrix test for content |
| [ ] | P10-31 | FE | Content pages gated by `content` permission; hide delete for admin | M | P8-07 | Tests |
| [x] | P10-36 | SEC | Sanitize rich-text output (DOMPurify) wherever `sky-rich-text-editor` content renders | S | - | Done without DOMPurify: the editor loads values through Quill's clipboard parser (inert document, registered formats only) instead of `innerHTML`; public pages render CMS blocks as escaped React text and never set HTML; `sky-rich-text-editor.test.ts` XSS payload tests |
| [ ] | CO-01 | FE | Public Contact page (both apps): check against the CMS Contact Us content and finish what is missing | S | - | Page renders CMS content (partly: msd done, every CMS field with per-field fallback and the SEO overrides, `contact.test.tsx`; social links come from the Social Media table, not this row. Left: mera-driver reads a static `/data/contact.json` because mera-driver-api has no CMS; it needs a Contact Us table and endpoint first, which is a schema and API change for review) |
| [x] | CO-02 | FE | Blog category page (filtered list) | S | - | Done: `/blog/category/:slug` (`BlogCategory` in `blog.tsx`), card category links; `blog.test.tsx` |

## 6. CTA banners

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [x] | CT-02 | DB | Migration: Promotion `state`, colour roles, `productId`, `PRODUCT` destination; `PromotionPlacement` and `BannerSlot` | S | - | Merged: migration `20261018100000_state_sliders_banners` + `down.sql` |
| [x] | CT-03 | BE | Banner create/update with state, roles, slots and in-state destination; one image; public `GET /catalog/banners` with Global fallback | M | CT-02, SL-02 | Merged: `promotion.service.ts`, 13 tests in `promotion.service.test.ts` |
| [x] | CT-04 | FE | CTA banner console: State first, form with colour roles, live preview, picker, slots | M | CT-03 | Merged: `masters/promotions.tsx`, `promotions.test.tsx` |
| [x] | CT-05 | FE | `<BannerSlot>` on home, category, explore, deal and product pages; remove `home-offers` | M | CT-03 | Merged: `components/banner-slot`, home, category, explore, deal and product pages; `home-offers` removed |
| [ ] | CT-01 | BIZ | Write the CTA banner rules in PLANNING.md §6 (placements, scheduling, who edits) and review the existing Promotions screen against them | S | - | Rules approved; gaps added here as tasks |

## 7. Home slider

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [x] | SL-02 | BE | `searchStateItems` (deals by branch state, products by member branch state) and `/search-items` routes | M | - | Merged: `state-catalog.service.ts`, 7 tests |
| [x] | SL-03 | DB | Migration: `HomeHeroSlide.productId`, nullable `dealId`, one-item CHECK | S | - | Merged: same migration as CT-02 |
| [x] | SL-04 | BE | Slides for deals and products: in-state check, duplicate 409, eligibility and public read for both | M | SL-02, SL-03 | Merged: `home-hero.service.ts`, 13 tests |
| [x] | SL-05 | FE | Home hero console: State first, `StateItemPicker`, Type column | M | SL-04 | Merged: `masters/home-hero.tsx`, `state-picker.tsx`, `state-item-picker.tsx` with tests |
| [x] | SL-06 | FE | Storefront hero: mixed deal and product card carousel, split layout kept | M | SL-04 | Merged: `pages/home/home-hero.tsx`, hero test in `home.test.tsx` |
| [x] | SL-07 | FE | Home hero console revamp (D28): overview table of every slider, then a two-pane builder (ordered slide cards with drag and move buttons, Undo on remove, inline browse-and-add panel); `GET /home-hero/overview`, `PUT /home-hero/slides/order`, `eligibleOnly` search | L | SL-05 | Merged: `home-hero.tsx`, `home-hero-builder.tsx`, `state-item-picker.tsx` with tests; service tests for overview and reorder |
| [x] | SL-08 | FE | Hero slider: two outlined feature cards at a time, no fill (container query, one and a peek on phones), action in the card slot (Book now / Add to cart), autoplay off for reduced motion; shared-ui `sky-product-card` media fills its frame and shows a placeholder for a broken image, `sky-feature-card` too (one shared `media-placeholder`), and the feature card tints slotted action buttons to its accent; one `useAddProductToCart` hook and `cartToast` copy for the hero and category cards; `fillTemplate` for content placeholders; Service / Product badge (`sky-feature-card` `badge`) and a wishlist toggle in each hero card's actions, equal-height slides with aligned buttons (`headline-lines`/`text-lines` clamp) (existing wishlist context through one `useWishlistToggle` hook, shared with the home cards) | S | SL-06 | Merged: `home.test.tsx` hero tests, `use-wishlist-toggle.test.tsx`, `sky-feature-card.test.ts` badge tests, `sky-product-card.test.ts` media tests; checked at 1440 and 390 px |
| [ ] | SL-01 | BIZ | Write the home slider rules in PLANNING.md §7 (slide count, schedule, image sizes, alt text) and review the existing Home Hero screen against them | S | - | Rules approved; gaps added here as tasks; partly: built behaviour written in PLANNING.md §7 (state picker, deal slides, 5-slide rule, Global fallback); own banner image, schedule and image rules open |

## 8. Masters

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | MA-01 | BIZ | Confirm the category tree in PLANNING.md §8 (6 groups) and load it through the Categories screen | S | - | Categories match the approved tree |

## 9. Payments, payouts and reports

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P4-08 | BE | Dashboard widgets and counts respect scope | M | P2-02 | Member sees own counts only |
| [ ] | P7-06 | DB | `Payout` table with unique period per member, `Decimal(12,2)` | M | P0-02 | Migration tested |
| [ ] | P7-07 | BE | Payout generation job | L | P7-06, P6-04 | Totals reconcile with orders in test |
| [ ] | P7-08 | BE | Payouts and payments list/get with scope | M | P7-06, P2-02 | Member sees own only |
| [ ] | P7-09 | BE | Payout release: super_admin only, idempotent, not preview, audit, step-up OTP | L | P7-08, P2-06, P2-12 | Concurrency test |
| [ ] | P7-10 | BE | Reports: overview, online payment waiting, member payouts, deals/therapists/products ordered+canceled+refunded | L | P4-06 | Figures match fixture data |
| [ ] | P7-11 | BE | Report query validation (range max 366 days) and indexes; check `EXPLAIN` | M | P7-10 | Under 1 s on 100k orders |
| [ ] | P7-12 | BE | CSV export with formula-injection protection, size cap, audit | M | P7-10 | Test with `=cmd` cell |
| [ ] | P10-27 | FE | Payments and payouts pages; release payout (super admin) with confirm and step-up OTP | L | P7-09 | Tests |
| [ ] | P10-28 | FE | Reports: 6 reports, date range limit 366 days, export for admin, own vs overall | L | P7-10, P7-12 | Tests |
| [ ] | P10-32 | FE | Dashboard widgets per scope | M | P4-08 | Tests |

## 10. Analytics

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | AN-01 | BIZ | Create the msd GA4 property and GTM container (never shared with mera-driver) | S | - | IDs recorded in DEPLOYMENT.md |
| [ ] | AN-02 | FE | Google Consent Mode v2 (default denied) and the GTM snippet in `index.html`; consent banner | M | AN-01 | No analytics cookie before consent (test) |
| [ ] | AN-03 | FE | `dataLayer` events with ids only, no PII: `view_deal`, `add_to_cart`, `begin_checkout`, `purchase`, `search`, `view_category` | M | AN-02 | Events visible in GTM preview; unit tests |

## 11. Social media

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | SO-01 | BIZ | Write the social media rules in PLANNING.md §11 (links beyond the footer, share buttons, Open Graph images, post copy) | S | - | Rules approved; gaps added here as tasks |

## 12. Platform, security and release

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P0-01 | BIZ | Owner answers the open decisions in PLANNING.md §13 (D5, D15, D16; D4 and D14 decided 2026-10-17) | S | - | Answers recorded in PLANNING.md §13 |
| [ ] | P0-02 | BIZ | Define payout commission rule and payout cadence | M | - | Written rule with example calculation |
| [ ] | P0-03 | BIZ | Legal review of Aadhaar/PAN handling (Aadhaar Act, DPDP Act): what may be collected, stored, retained, and how long | M | - | Written approval or required changes |
| [ ] | P0-04 | OPS | Create working branch off `develop` | S | - | Branch exists, clean tree |
| [ ] | P0-05 | DB | Snapshot Neon (prod and staging); create a restorable copy for migration rehearsal | M | - | Restore tested once |
| [ ] | P0-06 | QA | Run baseline lint, test, build for msd, msd-api, shared-* and record failures | S | P0-04 | Baseline numbers saved in TESTING.md §3 |
| [ ] | P0-07 | SEC | Check the commented Neon URL on `apps/msd-api/.env.example` line 7 for a live password; rotate the Neon credential if it ever was real | S | - | Confirmed placeholder or credential rotated |
| [ ] | P0-08 | SEC | Add secret scanning (gitleaks) to CI | S | - | CI fails on a planted fake secret |
| [ ] | P0-09 | DOC | Inventory every use of role key `vendor` and permission keys `vendors*`, `vendor-portal.*`, `cms.*` across api, frontend and shared packages | S | - | Checklist file attached to this list |
| [x] | P0-10 | DOC | Add a pointer to this list in `TASK.md` | S | - | Superseded 2026-10-17: `TASK.md` and `ADMIN_RBAC_TASKS.md` merged into this file, linked from `docs/msd/README.md` |
| [ ] | P2-01 | BE | `requirePermission` sets `req.access = {scope, memberId}` | S | P1-04 | Unit test |
| [ ] | P2-02 | BE | `lib/scope.ts` with `scopedWhere(req, resource)` per resource | M | P2-01 | Unit test per resource |
| [x] | P2-07 | SEC | Add `helmet`, `trust proxy`, JSON and urlencoded body limit 100 kb | S | - | Merged: `helmet` 8, `TRUST_PROXY_HOPS`, JSON limit 100 kb with 413 `PAYLOAD_TOO_LARGE`; no urlencoded parser is mounted; `app.security.test.ts` |
| [ ] | P2-08 | SEC | Global rate limit plus limiters for upload, status change, payout, refund, export, document download | M | P2-07 | Limit tests return 429 with `RATE_LIMITED` |
| [x] | P2-09 | SEC | `env.ts`: production fails on JWT secret under 32 chars, `*` in CORS, missing `R2_PRIVATE_BUCKET`, `DOC_HASH_PEPPER`, `FIELD_ENCRYPTION_KEY`, `CRON_SECRET` | S | - | Done: `config/env-checks.ts` (`productionEnvProblems`), thrown from `env.ts` in production; `env-checks.test.ts` incl. boot test; DEPLOYMENT §2 says set them before deploying |
| [x] | P2-10 | SEC | Request logger with request id and PII redaction (`documentNumber`, `bankAccountNumber`, `otp`, `authorization`); no stack traces in production responses | M | - | Done: `lib/logger.ts`, `middleware/requestLogger.ts`, error handler logs through it; `logger.test.ts`, `requestLogger.test.ts` (no token, OTP, body value or phone in any line). The ~40 older `console.*` calls in services move to `logger` as their modules are touched |
| [x] | P2-11 | BE | `lib/audit.ts` helper with dotted action constants (`member.status.changed`) | S | - | Done: `AUDIT_ACTIONS` (132 stored names kept as they are) and `AuditAction`, required by `writeAuditLog`/`auditLogData` so an unknown action fails to compile; `isAuditAction` for P8-05 filters; `lib/audit.test.ts` |
| [ ] | P2-12 | BE | Idempotency-Key middleware and table (24 h TTL, replay returns stored response) | M | - | Replay and conflict tests |
| [ ] | P2-13 | SEC | AES-256-GCM field encryption util with key id prefix for rotation | M | P2-09 | Round-trip and tamper tests |
| [x] | P2-14 | BE | Shared Zod primitives: pagination, sort allowlist, reason, date range, money, phone, email; lint rule or test that every body schema is `.strict()` | M | - | Done: primitives in `schemas/common.schema.ts` (+ `isStrictObject`), member reasons use `ReasonSchema`; `body-schemas-strict.test.ts` walks every route's `validateBody` schema, 95 older loose routes frozen in `body-schemas-loose.json` (making them strict is P11-02, per route, since a form sending extra keys would get 422) |
| [x] | P2-16 | SEC | Confirm token transport (bearer only or cookie); if any cookie is used set `HttpOnly`, `Secure`, `SameSite` and add CSRF protection; document decision | S | - | Done: bearer only, no cookies (ARCHITECTURE §12.2); `lib/token-transport.test.ts` fails on any cookie code |
| [ ] | P2-17 | SEC | `npm audit` gate and Dependabot for api and shared packages | S | - | CI step exists |
| [x] | P2-18 | SEC | OTP request limit per identifier from any IP (`OTP_IDENTIFIER_RATE_LIMIT_PER_HOUR`, default 10), on top of the per IP + identifier limit | S | - | Merged: `otpIdentifierRateLimiter` |
| [x] | P2-19 | SEC | Access tokens verified with `algorithms: ['HS256']` only | S | - | Merged: test refuses an HS512 token |
| [ ] | P2-22 | BE | Google sign-in ends on the API domain: `/auth/google/callback` sends the tokens as JSON, so the app never gets them. Redirect to the app with a one-time code it exchanges for tokens (never tokens in the URL) | M | - | Sign in with Google lands signed in; code single-use and short-lived (tests). Public API change: review first |
| [x] | P2-21 | BE | Storage layout: one folder per owner (`members/<id>/{profile,deals,therapists,products,documents}`, `customers/`, `home-slider/`, `cta-banners/`, `static-content/`, `masters/`), `bucketForKey`; ARCHITECTURE.md §12.3 | M | P5-03 | Merged: `lib/storage-layout.ts` tests, media service folder tests |
| [x] | P2-20 | SEC | `vendors` routes reject a non-UUID id with 422 (`router.param` hook `uuidParam`); role-assign routes validate both ids | S | - | Merged: test returns 422 with the field name |
| [ ] | P4-12 | QA | Route inventory test: every route has `requirePermission` or is on a documented public allowlist | M | P4-01 | CI fails on an unguarded route |
| [ ] | P9-01 | BE | Split `registry.ts` into `openapi/paths/<domain>.ts` | M | - | Output document identical |
| [ ] | P9-02 | BE | `envelope(schema)` helper; fix error response docs | M | P9-01 | All paths use it |
| [ ] | P9-03 | BE | Shared components: errors, pagination, enums, idempotency header | S | P9-01 | Referenced via `$ref` |
| [ ] | P9-04 | BE | Single route metadata source drives `requirePermission`, `x-required-permission`, `x-scope` | L | P9-01, P4-12 | No drift possible (test) |
| [ ] | P9-05 | BE | Document all new and changed routes including missing KYC routes | L | P9-04 | Coverage script passes |
| [ ] | P9-06 | QA | CI script: router stack vs registry | M | P9-05 | Fails on undocumented route |
| [x] | P9-07 | SEC | `/docs` hidden or basic-auth in production | S | - | Merged: off in production unless `API_DOCS=true` (then 404) |
| [ ] | P9-08 | FE | Generate typed API client from OpenAPI for msd | M | P9-05 | Build uses generated types |
| [ ] | P10-34 | FE | Form UX: inline errors with `aria-describedby`, 422 mapped to fields, focus first error, live region for status | M | P10-03 | Axe has 0 violations |
| [ ] | P10-35 | SEC | No PII in console, URLs, localStorage or error reports; masked values only; Sentry scrubbing rules | M | - | Test and manual review |
| [x] | P10-37 | SEC | Upload inputs: `accept`, size pre-check (UX only), filename display escaped; open links with `rel="noopener noreferrer"` | S | P10-17 | Test; done 2026-10-28: `DOCUMENT_ACCEPT` and the 5 MB limit shared from `shared-utils` (msd-api uses the same constant), pre-upload size check, file names render as text, file link opens with `rel="noopener noreferrer"` |
| [ ] | P10-40 | FE | `noindex` on all `/account/*`; 301 redirects for renamed public vendor routes decided with SEO owner | S | P10-05 | Meta test |
| [ ] | P10-41 | QA | Accessibility audit WCAG 2.2 AA on every new page (keyboard, focus, contrast, target size) via sahaj | L | P10-30 | Report with 0 blockers |
| [ ] | P10-42 | QA | Playwright e2e per role (7 roles): login, allowed action works, forbidden action hidden and server-rejected | L | P10-33 | Suite green in CI |
| [ ] | P11-01 | QA | IDOR suite across all 14 resources (member A vs B, support, sales) | M | P4-12 | All foreign reads return 404 |
| [ ] | P11-02 | QA | Mass-assignment suite: extra keys on every write return 422 | M | P2-14 | Test generated from schemas |
| [x] | P11-03 | SEC | Review all raw SQL and `$queryRaw`; no string concatenation | S | - | Done 2026-10-29: the API has no raw SQL; the only raw queries were two constant `$queryRawUnsafe` calls in `prisma/member-status-report.ts`, now tagged `$queryRaw`; `lib/raw-sql.test.ts` fails on any `*Unsafe` raw query or `Prisma.raw` in `src` or `prisma` |
| [ ] | P11-04 | QA | Auth suite: suspended login, token use after suspend, refresh after suspend, deactivated staff | M | P3-08 | Tests |
| [ ] | P11-05 | QA | Upload abuse: polyglot, wrong magic, oversize, path traversal filename, zip bomb | M | P5-06 | Tests |
| [ ] | P11-06 | QA | PII leak scan of logs and API responses for full Aadhaar/PAN | M | P2-10 | Zero matches |
| [ ] | P11-07 | QA | Concurrency: double refund, double payout release, parallel status changes | M | P7-09 | Row lock or unique guard proven |
| [ ] | P11-08 | QA | Migration and rollback rehearsal on Neon copy with row counts | M | P3-02, P5-02 | Signed rehearsal log |
| [ ] | P11-09 | QA | Performance: reports and list endpoints with 100k rows, p95 target | M | P7-11 | Under 500 ms list, under 1 s report |
| [ ] | P11-10 | SEC | SAST in CI (CodeQL or Semgrep) | S | - | Pipeline runs, findings triaged |
| [ ] | P11-11 | SEC | DAST baseline (OWASP ZAP) against staging | M | P12-03 | No high findings |
| [ ] | P11-12 | SEC | Threat model review: roles, impersonation, documents, payouts | M | P4-12 | Document with mitigations |
| [ ] | P11-13 | QA | Vivek security audit and Arya final review | M | P11-01 to P11-12 | APPROVE verdict |
| [ ] | P12-01 | OPS | Document and set new env vars on Railway and Vercel; update `.env.example` and `DEPLOYMENT.md` | S | P2-09 | Staging boots from docs only |
| [ ] | P12-02 | OPS | CI: `nx affected -t lint test build`, route coverage, secret scan, audit | M | P9-06, P0-08 | PR gate active |
| [ ] | P12-03 | OPS | Rollout plan: develop, release, main; expand migrations first, code second, contract last | M | P11-08 | Written plan approved |
| [ ] | P12-04 | OPS | Monitoring: Sentry on API, alerts for cron failure, 5xx and 429 spikes, role changes, payout releases | M | P6-07 | Alerts tested |
| [ ] | P12-05 | OPS | Runbooks: suspend and restore member, rotate keys, cron failure, rollback migration | M | P12-03 | Reviewed by a second person |
| [ ] | P12-06 | BIZ | Data retention policy for audit logs, login history, documents, plus member data deletion request flow | M | P0-03 | Policy approved |
| [ ] | P12-07 | DOC | Update `docs/msd/*`, `docs/ARCHITECTURE.md` and the `CLAUDE.md` role and menu keys | S | P10-42 | Docs match code |
| [ ] | P12-08 | QA | UAT with 7 role accounts using the matrix as the checklist | M | P10-42 | Signed UAT sheet |
| [ ] | P12-09 | OPS | Production release and smoke test | M | P12-08 | Smoke list passes |
| [ ] | P12-10 | OPS | One release later: remove `/vendors*` aliases, old menu keys and legacy columns (P3-16) | M | P12-09 | No traffic on aliases for 14 days |
| [ ] | X-01 | OPS | Attach the bought custom domain to each Vercel project Production (`main`) deploy | S | - | Domain serves production |
| [ ] | X-02 | OPS | Add the CI check as a required status check in branch protection | S | - | PR cannot merge red |
| [ ] | X-03 | SEC | Rotate the secrets that were once committed (Gmail app password, ConnectExpress SMS key, Razorpay keys, `JWT_SECRET`); they remain in git history | S | - | All rotated at the provider |
| [ ] | X-04 | OPS | Verify the msd-api production deploy end to end with the DEPLOYMENT.md checklist (health, /docs, sign-in, R2 upload survives a redeploy) | S | - | Checklist ticked |
| [x] | X-05 | BE | Remove the leftover `console.log` in `apps/msd-api/src/middleware/requirePermission.ts` (prints every permission when routes load) | S | - | No log line at boot; done 2026-10-28 (`requirePermission.test.ts` "at boot") |
