# Admin RBAC: Implementation Task List

Source specs: `docs/msd/ADMIN_USER_ROLES_AND_PERMISSIONS.md` (business rules) and `docs/msd/ADMIN_RBAC_MASTER_PLAN.md` (technical design; its section 13 lists corrections to this list).
Created: 2026-10-12. Status: in progress (staff member management slice built 2026-10-15).

## How to use this list

- Tick `[x]` in the first column when a task meets its "Done when" condition. Progress is `ticked / total`, per phase and overall.
- IDs are stable. Never renumber; add new tasks at the end of a phase with the next number.
- **Area** tags: `DB` database/migration, `BE` backend, `FE` frontend, `SH` shared package, `SEC` security, `QA` testing, `OPS` deploy/infra, `DOC` documentation, `BIZ` owner decision.
- **Size**: S under half a day, M half to 2 days, L 2 to 5 days.
- **Depends** lists task IDs that must be done first. `-` means none.
- Branch flow: `feature/*` off `develop`, never `main`. One commit per finished piece of work, one-line `type(scope): Title`.

## Definition of done (applies to every task)

1. Code written, lint clean, no `any` added, no hex colours in app code (M3 tokens only).
2. Unit tests added or updated; `npx nx run-many -t lint test build --projects=...` green for touched projects. Known pre-existing failures (msd `app.spec.tsx` 1, `otp.test.tsx` 2; mera-driver 12) must not grow.
3. Server routes: `requirePermission`, scope applied through `scopedWhere`, Zod `.strict()` validation, audit log entry, OpenAPI entry with `x-required-permission` and `x-scope`.
4. Migrations: have a `down.sql`, rehearsed on a copy of the Neon data.
5. No secrets, full Aadhaar/PAN, OTPs or tokens in code, logs, URLs or test fixtures.
6. UI: WCAG 2.2 AA, keyboard reachable, copy in `content.json`, no page-specific CSS on storefront pages.

## Progress summary

Total: **193 tasks**. Update the Done column as work lands.

| Phase | Scope | Tasks | Done | % |
|---|---|---|---|---|
| P0 | Decisions and setup | 10 | 0 | 0 |
| P1 | Roles, scope, seed, menu | 10 | 1 | 10 |
| P2 | Authorization core and hardening | 17 | 2 | 12 |
| P3 | Member rename and lifecycle | 22 | 12 | 55 |
| P4 | Own-scope retrofit | 13 | 0 | 0 |
| P5 | Member documents | 15 | 3 | 20 |
| P6 | Reminders and scheduler | 8 | 0 | 0 |
| P7 | Orders, refunds, payments, payouts, reports | 13 | 0 | 0 |
| P8 | Staff, settings, logs, profile, content | 8 | 0 | 0 |
| P9 | OpenAPI and contract | 8 | 0 | 0 |
| P10 | Frontend | 46 | 4 | 9 |
| P11 | Security and QA | 13 | 0 | 0 |
| P12 | Release, ops, docs | 10 | 0 | 0 |
| **Total** | | **193** | **22** | **11** |

By area: BE 82, FE 36, SEC 20, QA 17, DB 14, OPS 13, SH 4, BIZ 4, DOC 3.
By size: S 60, M 115, L 18.

Suggested order: P0, then P1 and P2 in parallel with P10-07 (design spec), then P3 to P8 (backend), with P10 frontend tasks starting as each backend phase lands. P9 runs alongside P4 to P8. P11 and P12 close the release.

### Current slice: staff member management (spec `docs/superpowers/specs/2026-10-15-staff-member-management-design.md`)

Status: built 2026-10-15, plan `docs/superpowers/plans/2026-10-15-staff-member-management.md`.

- Done (21): P2-03, P2-04, P3-04, P3-06 to P3-11, P3-13, P3-17, P3-18, P3-20, P3-21, P5-05, P5-07, P5-11, P10-13 to P10-16.
- Partly done (24, each "Done when" says what is left): P1-02, P1-03, P1-05, P1-06, P1-07, P3-01, P3-02, P3-03, P3-12, P3-19, P5-01, P5-02, P5-06, P5-08, P5-09, P6-03, P10-03, P10-04, P10-05, P10-11, P10-12, P10-17, P10-18, P10-19.
- Not done (4): P3-05 (service files keep `vendor` names, see P3-22), P10-02 (validators stay local to the form), P10-07 (no separate design spec), P10-39 (member copy is inline, not in `content.json`).
- Follow-ups added (10): P3-22, P3-23, P4-13, P5-14, P5-15, P6-08, P10-43 to P10-46. Before production: P10-43, P10-44, P10-45.
- Deferred: P3-15, P3-16, P5-03, P5-04, P5-10, P5-12, P5-13, P6-01, P6-02, P6-04 to P6-07, all of P4, P7 and P8.
- Removed: P3-14 (superseded by the FK 409 guard and branch delete C-08).

---

## Phase 0: Decisions and setup

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P0-01 | BIZ | Owner answers the open decisions in master plan section 11 (D4, D5, D14 to D16) | S | - | Answers recorded in the master plan |
| [ ] | P0-02 | BIZ | Define payout commission rule and payout cadence | M | - | Written rule with example calculation |
| [ ] | P0-03 | BIZ | Legal review of Aadhaar/PAN handling (Aadhaar Act, DPDP Act): what may be collected, stored, retained, and how long | M | - | Written approval or required changes |
| [ ] | P0-04 | OPS | Create working branch off `develop` | S | - | Branch exists, clean tree |
| [ ] | P0-05 | DB | Snapshot Neon (prod and staging); create a restorable copy for migration rehearsal | M | - | Restore tested once |
| [ ] | P0-06 | QA | Run baseline lint, test, build for msd, msd-api, shared-* and record failures | S | P0-04 | Baseline numbers saved in TASK.md |
| [ ] | P0-07 | SEC | Check the commented Neon URL on `apps/msd-api/.env.example` line 7 for a live password; rotate the Neon credential if it ever was real | S | - | Confirmed placeholder or credential rotated |
| [ ] | P0-08 | SEC | Add secret scanning (gitleaks) to CI | S | - | CI fails on a planted fake secret |
| [ ] | P0-09 | DOC | Inventory every use of role key `vendor` and permission keys `vendors*`, `vendor-portal.*`, `cms.*` across api, frontend and shared packages | S | - | Checklist file attached to this list |
| [ ] | P0-10 | DOC | Add a pointer to this list in `TASK.md` | S | - | Link present |

## Phase 1: Roles, scope, seed, menu

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [x] | P1-01 | DB | Migration: `PermissionScope` enum and `RolePermission.scope` (default ALL) | S | P0-05 | Merged: migration `20261008104219_add_permission_scope` |
| [ ] | P1-02 | DB | Migration: rename role key `vendor` to `member`, insert `support`, update `UserRole` links | S | P1-01 | Row counts equal before and after; partly: role rename written in migration `20261015100000_member_lifecycle`, `support` added by the seed; row counts not checked yet (P10-45) |
| [ ] | P1-03 | BE | Create `lib/role-keys.ts`; replace hardcoded `'vendor'`, `'customer'` in vendor, auth, customer, dashboard services | S | P1-02 | No string literal role key left (grep); partly: `lib/role-keys.ts` added and used for member checks; `'customer'` literals remain in auth, customer and dashboard services |
| [ ] | P1-04 | BE | Permission resolver returns `{key, scope}`; highest scope wins across roles | M | P1-01 | Unit tests: ALL beats OWN, multi-role |
| [ ] | P1-05 | SH | Restructure `msd-menu.json` to the 14 keys plus masters and dashboard; add `payments`, `logs`, `profile` nodes; remove `business` parent mismatch | M | P0-09 | Menu test passes, no orphan parent; partly: `vendors` key renamed to `members` only |
| [ ] | P1-06 | BE | Extend `permission-migration.service` to map old keys to new keys on existing `RolePermission` rows | M | P1-05 | Old custom grants preserved in rehearsal; partly: the migration SQL copies `vendors:*` grants to `members:*`; other key moves still open |
| [ ] | P1-07 | BE | Rewrite `prisma/seed.ts` from spec matrix 2.3 including scope and extra actions; drop `vendor-portal.*` special case | M | P1-05, P1-04 | Seed idempotent, runs twice cleanly; partly: 7 roles and the `members` row seeded; other rows still open |
| [ ] | P1-08 | QA | Matrix snapshot test: 7 roles x 14 resources x actions x scope equals spec | M | P1-07 | Test fails on any drift |
| [ ] | P1-09 | SH | `shared-types`: `PermissionScope`, `Bootstrap.scopes`, role key union. `shared-permissions`: `can()` plus `scopeFor()` | M | P1-04 | Package tests green |
| [ ] | P1-10 | BE | Guard: role permission edit cannot give `members`/`orders` scope ALL to member role; super-admin-only actions enforced in code | M | P1-04 | Negative tests return 403 |

## Phase 2: Authorization core and platform hardening

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P2-01 | BE | `requirePermission` sets `req.access = {scope, memberId}` | S | P1-04 | Unit test |
| [ ] | P2-02 | BE | `lib/scope.ts` with `scopedWhere(req, resource)` per resource | M | P2-01 | Unit test per resource |
| [x] | P2-03 | BE | `authenticate`: load `Member.status`; SUSPENDED/ARCHIVED gives 403 `MEMBER_SUSPENDED`; INACTIVE sets `req.readOnly` | M | P3-01 | Tests for each status |
| [x] | P2-04 | BE | `blockWhenReadOnly` middleware on non-GET routes, logout and token refresh the only exceptions (no `/me`, no document or media upload) | S | P2-03 | Inactive member write returns 403 `MEMBER_INACTIVE_READ_ONLY`; GET orders, customers and catalog still 200 |
| [ ] | P2-05 | BE | Read roles from DB (30 s cache) not the token; clear cache on role, permission and user-role change | M | P2-01 | Role change effective within one request after cache clear |
| [ ] | P2-06 | BE | `denyPreview` middleware for payout, delete, status, refund, staff routes; block impersonating super_admin | S | P2-01 | Preview token gets 403 on listed routes |
| [ ] | P2-07 | SEC | Add `helmet`, `trust proxy`, JSON and urlencoded body limit 100 kb | S | - | Response headers verified, oversize gets 413 |
| [ ] | P2-08 | SEC | Global rate limit plus limiters for upload, status change, payout, refund, export, document download | M | P2-07 | Limit tests return 429 with `RATE_LIMITED` |
| [ ] | P2-09 | SEC | `env.ts`: production fails on JWT secret under 32 chars, `*` in CORS, missing `R2_PRIVATE_BUCKET`, `DOC_HASH_PEPPER`, `FIELD_ENCRYPTION_KEY`, `CRON_SECRET` | S | - | Boot test fails fast |
| [ ] | P2-10 | SEC | Request logger with request id and PII redaction (`documentNumber`, `bankAccountNumber`, `otp`, `authorization`); no stack traces in production responses | M | - | Log snapshot test has no PII |
| [ ] | P2-11 | BE | `lib/audit.ts` helper with dotted action constants (`member.status.changed`) | S | - | Used by every mutation in later tasks |
| [ ] | P2-12 | BE | Idempotency-Key middleware and table (24 h TTL, replay returns stored response) | M | - | Replay and conflict tests |
| [ ] | P2-13 | SEC | AES-256-GCM field encryption util with key id prefix for rotation | M | P2-09 | Round-trip and tamper tests |
| [ ] | P2-14 | BE | Shared Zod primitives: pagination, sort allowlist, reason, date range, money, phone, email; lint rule or test that every body schema is `.strict()` | M | - | Test scans schemas |
| [ ] | P2-15 | BE | `ROLE_MANAGEMENT_LOCKED` on role create, clone and delete | S | - | Test |
| [ ] | P2-16 | SEC | Confirm token transport (bearer only or cookie); if any cookie is used set `HttpOnly`, `Secure`, `SameSite` and add CSRF protection; document decision | S | - | Written note in spec |
| [ ] | P2-17 | SEC | `npm audit` gate and Dependabot for api and shared packages | S | - | CI step exists |

## Phase 3: Member rename and lifecycle

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
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
| [ ] | P3-15 | BE | Remove deal approval gate if decision 2 says so (migration plus code) | M | P0-01 | Deals publish without approval |
| [ ] | P3-16 | DB | Contract migration: drop `kycStatus`, `kycRejectionReason`, legacy GST/PAN/`kycDocuments` | M | P5-02, P12-03 | Done only after one release without readers |
| [x] | P3-17 | BE | On suspend: send email and SMS to the member with the reason, support contact and steps to return to active; send "active again" message on reactivation | M | P3-07, P6-03 | Message sent once per change; provider failure recorded and retried, suspension kept |
| [x] | P3-18 | BE | Suspended member login and OTP request return 403 `MEMBER_SUSPENDED` with reason and steps; no OTP sent | S | P2-03 | Test: suspended phone gets the message, no OTP row created |
| [ ] | P3-19 | DB | Status backfill report: counts per old `VendorStatus` and per new `MemberStatus`, reviewed before the migration runs | S | P3-01 | Report saved, owner signs off on the REJECTED to SUSPENDED count; partly: `prisma/member-status-report.ts` written; report run and owner sign-off open (P10-45) |
| [x] | P3-20 | BE | Support contact for the suspension notice from env vars `SUPPORT_EMAIL` and `SUPPORT_PHONE` (`SystemSetting` keys wait for P8-02) | S | - | Notice shows the configured contact |
| [x] | P3-21 | BE | Remove `POST /vendors/me` and `POST /vendors/me/submit` and the vendor approve and reject routes (master plan C-11) | M | P3-12 | Routes return 404, OpenAPI updated |
| [ ] | P3-22 | BE | Rename `vendor.service.ts`, `vendors.routes.ts` and the `Vendor*` Zod schemas to member names | S | P3-12 | No `vendor` in those file or schema names; existing tests green |
| [ ] | P3-23 | FE | Move the member detail page and self-service calls in msd from `/vendors/:id` and `/vendors/me` to `/members/*` before the alias is removed | S | P3-12 | No `/vendors` request left in `apps/msd/src/api` (grep) |

## Phase 4: Own-scope retrofit

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P4-01 | BE | Members list, get, update through `scopedWhere` | M | P2-02, P3-05 | Member A cannot read B (404) |
| [ ] | P4-02 | BE | Branches: flat routes plus scope plus status endpoint | M | P4-01 | IDOR test |
| [ ] | P4-03 | BE | Deals: scope, status, `PUT /deals/:id/therapists` with branch and member checks | L | P4-02 | Cross-branch assignment returns 422 |
| [ ] | P4-04 | BE | Therapists: scope and branch checks | M | P4-02 | IDOR test |
| [ ] | P4-05 | BE | Products: scope; remove duplicate unscoped list | M | P4-01 | IDOR test |
| [ ] | P4-06 | BE | Orders: scope on `OrderItem.vendorId`; strip other members' items | M | P2-02 | Mixed-vendor order test |
| [ ] | P4-07 | BE | Customers: support and sales view-only, member no access | S | P1-07 | Matrix test |
| [ ] | P4-08 | BE | Dashboard widgets and counts respect scope | M | P2-02 | Member sees own counts only |
| [ ] | P4-09 | BE | Notifications: recipient type `MEMBER`/`ADMIN`; new types | S | P3-04 | Migration and test |
| [ ] | P4-10 | BE | Logs and profile scoped to own for non-super-admin | S | P2-02 | Test |
| [ ] | P4-11 | BE | Cross-resource ownership validators (branch to member, therapist to branch, category access) in one shared service | M | P4-02 | Unit tests |
| [ ] | P4-12 | QA | Route inventory test: every route has `requirePermission` or is on a documented public allowlist | M | P4-01 | CI fails on an unguarded route |
| [ ] | P4-13 | BE | Grant `members:view` and `members:edit` with own scope to role `member`, then retire `members:custom` | M | P4-01 | Member reads and edits only their own record; `members:custom` gone from the seed |

## Phase 5: Member documents

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P5-01 | DB | `MemberDocument` migration: status, masked number, hash, reviewer, expiry, uploader fields | M | P3-01 | Up and down tested; partly: columns in the migration; up and down rehearsal open (P10-45) |
| [ ] | P5-02 | DB | Copy legacy GST, PAN and `kycDocuments` into `MemberDocument`; verify counts | M | P5-01 | Count and checksum report; partly: existing `VendorDocument` rows become SUBMITTED; legacy GST, PAN and `kycDocuments` columns not copied yet |
| [ ] | P5-03 | BE | Private R2 bucket client, presigned GET (5 min), `.pdf` ContentType fix | M | P2-09 | Presigned link expires (test) |
| [ ] | P5-04 | OPS | Script to move existing files from public to private bucket, verify checksums, then remove public copies | M | P5-03 | Run on staging, public URLs return 403/404 |
| [x] | P5-05 | BE | Validators: PAN, GST with state code, Aadhaar with Verhoeff; masking functions | M | P2-14 | Table tests with valid and invalid samples |
| [ ] | P5-06 | BE | Upload endpoint: magic bytes, 5 MB, duplicate-number check by hash, store masked, `uploadedOnBehalf` | L | P5-03, P5-05 | Upload tests incl. polyglot and wrong type; partly: type sniffing, duplicate check by hash, masked and encrypted number and `uploadedOnBehalf` on existing storage; private bucket open (P5-03) |
| [x] | P5-07 | BE | Checklist endpoint; support gets type and status only | S | P5-01 | Support response has no file key |
| [ ] | P5-08 | BE | `download-url` endpoint with audit and rate limit; blocked for support | S | P5-03 | Test per role; partly: approvers get the file key on the list, support gets none; no `download-url` endpoint, audit or rate limit (P5-14) |
| [ ] | P5-09 | BE | Review endpoint approve/reject; reason required on reject; notify member | M | P5-01 | State tests; partly: approve and reject with a 10 to 500 character reason, state tests pass; member notification open |
| [ ] | P5-10 | BE | Expiry job sets EXPIRED when `expiresAt` passed | S | P6-04 | Time-travel test |
| [x] | P5-11 | BE | Derive "Documents complete / incomplete" and due date for list and detail | S | P5-01 | Unit test |
| [ ] | P5-12 | SEC | Decide and add malware scanning for uploads (provider or ClamAV) | M | P5-06 | Infected sample rejected |
| [ ] | P5-13 | BE | Encrypt and mask bank account number at rest | M | P2-13 | Raw DB value is ciphertext |
| [ ] | P5-14 | BE | Signed URL download for member documents, replacing the `storageKey` in list responses | M | P5-03 | List has no file key; link expires (test) |
| [ ] | P5-15 | BE | Documents list returns the uploader name, and the row shows "uploaded by <name> for member" | S | P5-07 | Test shows the name |

## Phase 6: Reminders and scheduler

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P6-01 | DB | `MemberDocumentReminder` table with unique (member, sequence, channel) | S | P3-01 | Migration tested |
| [ ] | P6-02 | BE | Reminder schedule service (due +0, +7, +14 days, listing exact missing documents) | M | P6-01 | Unit tests with fake clock |
| [ ] | P6-03 | BE | Notification template service for SMS and email (generic, replaces OTP-only sender) | M | - | Provider failure recorded, no crash; partly: minimal: welcome, suspension and reactivation notices by email and SMS with one inline retry; OTP sender not replaced |
| [ ] | P6-04 | BE | Secured cron endpoint (`x-cron-secret`, timing-safe), run lock, idempotent | M | P6-02, P2-09 | Double run sends once |
| [ ] | P6-05 | BE | Set `reviewFlaggedAt` after final warning; never auto-suspend | S | P6-02 | Test confirms status unchanged |
| [ ] | P6-06 | BE | Manual remind endpoint | S | P6-03 | Audit entry written |
| [ ] | P6-07 | OPS | Railway cron schedule and failure alert | S | P6-04 | Alert fires on forced failure |
| [ ] | P6-08 | BE | Durable retry for failed member notices (welcome, suspension, reactivation) | S | P6-04 | Failed notice retried by the job until sent; test |

## Phase 7: Orders, refunds, payments, payouts, reports

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P7-01 | DB | `RefundRequest` table; `REFUNDED`, `PARTIALLY_REFUNDED` payment statuses | M | P0-01 | Migration tested |
| [ ] | P7-02 | BE | `POST /orders/:id/cancel` with reason, state rules, notifications | M | P4-06 | Invalid state returns 409 |
| [ ] | P7-03 | BE | Refund request create (support) | S | P7-01 | Support can raise, cannot approve |
| [ ] | P7-04 | BE | Refund approve: Razorpay refund API, amount cap, idempotent, reconcile via webhook | L | P7-03, P2-12 | Double click refunds once |
| [ ] | P7-05 | BE | Refund reject with note | S | P7-03 | Test |
| [ ] | P7-06 | DB | `Payout` table with unique period per member, `Decimal(12,2)` | M | P0-02 | Migration tested |
| [ ] | P7-07 | BE | Payout generation job | L | P7-06, P6-04 | Totals reconcile with orders in test |
| [ ] | P7-08 | BE | Payouts and payments list/get with scope | M | P7-06, P2-02 | Member sees own only |
| [ ] | P7-09 | BE | Payout release: super_admin only, idempotent, not preview, audit, step-up OTP | L | P7-08, P2-06, P2-12 | Concurrency test |
| [ ] | P7-10 | BE | Reports: overview, online payment waiting, member payouts, deals/therapists/products ordered+canceled+refunded | L | P4-06 | Figures match fixture data |
| [ ] | P7-11 | BE | Report query validation (range max 366 days) and indexes; check `EXPLAIN` | M | P7-10 | Under 1 s on 100k orders |
| [ ] | P7-12 | BE | CSV export with formula-injection protection, size cap, audit | M | P7-10 | Test with `=cmd` cell |
| [ ] | P7-13 | SEC | Razorpay webhook: raw-body HMAC, timing-safe compare, event id replay table | M | - | Replay ignored |

## Phase 8: Staff, settings, logs, profile, content

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P8-01 | BE | `/staff-users` routes with role allowlist and last-super-admin guard | M | P1-07 | Negative tests |
| [ ] | P8-02 | DB | `SystemSetting` table | S | - | Migration tested |
| [ ] | P8-03 | BE | `/settings` routes with per-key Zod schema allowlist | M | P8-02 | Unknown key returns 422 |
| [ ] | P8-04 | BE | `/logs/login-history` across users with scope; index | M | P2-02 | Scope test |
| [ ] | P8-05 | BE | `/logs/audit` filters (actor, action, target, date) and indexes | M | P2-11 | Filter tests |
| [ ] | P8-06 | BE | `/me` allowlist: name, phone, email, avatar; phone/email change goes through OTP | M | - | Role or status in body returns 422 |
| [ ] | P8-07 | BE | Swap every `cms.*` gate to `content:<action>` | M | P1-05 | Matrix test for content |
| [ ] | P8-08 | BE | Bootstrap returns `scopes` | S | P1-09 | Contract test |

## Phase 9: OpenAPI and contract

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P9-01 | BE | Split `registry.ts` into `openapi/paths/<domain>.ts` | M | - | Output document identical |
| [ ] | P9-02 | BE | `envelope(schema)` helper; fix error response docs | M | P9-01 | All paths use it |
| [ ] | P9-03 | BE | Shared components: errors, pagination, enums, idempotency header | S | P9-01 | Referenced via `$ref` |
| [ ] | P9-04 | BE | Single route metadata source drives `requirePermission`, `x-required-permission`, `x-scope` | L | P9-01, P4-12 | No drift possible (test) |
| [ ] | P9-05 | BE | Document all new and changed routes including missing KYC routes | L | P9-04 | Coverage script passes |
| [ ] | P9-06 | QA | CI script: router stack vs registry | M | P9-05 | Fails on undocumented route |
| [ ] | P9-07 | SEC | `/docs` hidden or basic-auth in production | S | - | Prod returns 404 or 401 |
| [ ] | P9-08 | FE | Generate typed API client from OpenAPI for msd | M | P9-05 | Build uses generated types |

## Phase 10: Frontend (apps/msd, packages/shared-*)

### 10a. Foundations

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-01 | SH | `shared-auth/react`: expose `scopeFor()`, scope-aware `can()` and `PermissionButton`; refetch bootstrap after role change | M | P1-09, P8-08 | Component tests |
| [ ] | P10-02 | SH | Pure validators (PAN, GST, Aadhaar, IFSC, phone, reason) in `shared-utils`, reused by forms and tests; server stays authoritative | M | P5-05 | Same fixtures as backend pass |
| [ ] | P10-03 | FE | API client error mapping: `MEMBER_SUSPENDED`, `ROLE_MANAGEMENT_LOCKED`, 422 field errors, 429 retry-after | M | P9-08 | Unit tests; partly: 409 and 422 field errors mapped on the add member form; no `MEMBER_SUSPENDED`, `ROLE_MANAGEMENT_LOCKED` or 429 mapping |
| [ ] | P10-04 | FE | Global states: suspended screen, read-only banner for inactive, session-expired, 403 and 404 pages, preview banner disables sensitive actions | M | P10-03 | Component tests; partly: inactive read-only banner in the admin layout and suspended note on the detail page; other global states open |
| [ ] | P10-05 | FE | Rename Vendor to Member in UI copy (`content.json`), menu, and routes `/account/members/*` with redirects from `/account/vendors/*` | M | P1-05 | Old URLs redirect; partly: routes `/account/members/*`, menu and redirects from `/account/vendors/*` done; role chooser copy in `content.json` still says Vendor |
| [ ] | P10-06 | FE | Sidebar renders the new menu per role; test each of 7 roles | M | P1-05 | Snapshot per role |
| [ ] | P10-07 | FE | Design spec for member detail, documents and review screens (60/30/10, M3 tokens) via skylabs-neha | M | - | Spec approved |

### 10b. Role management and staff

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-08 | FE | Role Management: 14-row matrix with V/C/E/D, extra actions, scope badge; hide New role and Clone; system roles marked | L | P10-01 | `roles/permission-matrix.tsx` tests updated |
| [ ] | P10-09 | FE | Super-admin-only edit, unsaved-change guard, show the self-escalation error | S | P10-08 | Test |
| [ ] | P10-10 | FE | Staff users page: create, edit, status, delete rules; role dropdown limited; last super admin message | M | P8-01 | `users/` tests updated |

### 10c. Member console (admin side, `pages/account/vendors` becomes `members`)

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-11 | FE | Members list: status filter, documents chip, review-flag filter, due date, server paging and sort | M | P3-12, P10-05 | Tests; partly: status, documents and review-flag filters, documents chip, due date and server paging done; no sort |
| [ ] | P10-12 | FE | Create member form with shared validators and duplicate phone/email handling | M | P10-02 | Tests; partly: short form with duplicate phone and email errors on the field; validators are local copies of the server schema until P10-02 |
| [x] | P10-13 | FE | Member detail header: name, status, documents chip, due date, only the actions the viewer may use | M | P10-07 | Tests per role |
| [x] | P10-14 | FE | Tabs: Profile, Documents, Branches/Deals/Therapists, Activity | M | P10-13 | Keyboard and ARIA tab pattern |
| [x] | P10-15 | FE | Status change with inline confirm and reason (10 to 500 chars), history list | M | P3-07 | Tests |
| [x] | P10-16 | FE | Delete member (super admin only) with inline confirm; message for the ARCHIVED outcome | S | P3-09 | Tests |
| [ ] | P10-17 | FE | Documents tab: per-document status chips, masked number input, upload, approve, reject with reason, "uploaded by X for member", view via signed URL in new tab | L | P5-06, P5-09 | Tests; support sees status only; partly: status chips, masked number, upload on behalf, approve and reject done; uploader name (P5-15) and signed URL view (P5-14) open |
| [ ] | P10-18 | FE | Activity tab: reminders, warnings, status timeline | M | P3-13, P6-01 | Tests; partly: status timeline and document events done; reminders and warnings wait for P6-01 |
| [ ] | P10-19 | FE | "Ready for suspension review" badge with reason prefilled "Documents not completed" | S | P6-05, P10-15 | Test; partly: badge and prefilled reason only; the flag is set by the deferred reminder job |

### 10d. Member self-service (own scope)

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-20 | FE | My profile and business profile (own view/edit) | M | P8-06 | Tests |
| [ ] | P10-21 | FE | Own documents: upload, state, reasons, "documents due in N days" banner | M | P10-17 | Tests |
| [ ] | P10-22 | FE | Own branches, deals, therapists, products: no delete control, pause/unpublish toggle; inactive member sees everything view only, with no edit, add or toggle controls | L | P4-02 to P4-05, P10-04 | Tests |
| [ ] | P10-23 | FE | Deal form: branch required, therapist picker filtered to branch, validation messages | M | P4-03 | Tests |
| [ ] | P10-24 | FE | Own orders, payments, payouts, reports | M | P7-08, P7-10 | Tests |

### 10e. Operations screens

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-25 | FE | Orders: cancel with inline confirm; support raises refund request; admin refund queue approve/reject | L | P7-02 to P7-05 | Tests per role |
| [ ] | P10-26 | FE | Customers: view, block/unblock with reason; support view only | M | P4-07 | Tests |
| [ ] | P10-27 | FE | Payments and payouts pages; release payout (super admin) with confirm and step-up OTP | L | P7-09 | Tests |
| [ ] | P10-28 | FE | Reports: 6 reports, date range limit 366 days, export for admin, own vs overall | L | P7-10, P7-12 | Tests |
| [ ] | P10-29 | FE | System settings page (super admin edit, admin view) | M | P8-03 | Tests |
| [ ] | P10-30 | FE | Logs page: login history (all or own) and audit filters | M | P8-04, P8-05 | Tests |
| [ ] | P10-31 | FE | Content pages gated by `content` permission; hide delete for admin | M | P8-07 | Tests |
| [ ] | P10-32 | FE | Dashboard widgets per scope | M | P4-08 | Tests |
| [ ] | P10-33 | FE | Storefront check: suspended member's deals, branches and therapists absent; deal URL returns not-found page; prerender and sitemap exclude them | M | P3-10 | Manual and `hydration.test.tsx` |

### 10f. Frontend quality and security

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-34 | FE | Form UX: inline errors with `aria-describedby`, 422 mapped to fields, focus first error, live region for status | M | P10-03 | Axe has 0 violations |
| [ ] | P10-35 | SEC | No PII in console, URLs, localStorage or error reports; masked values only; Sentry scrubbing rules | M | - | Test and manual review |
| [ ] | P10-36 | SEC | Sanitize rich-text output (DOMPurify) wherever `sky-rich-text-editor` content renders | S | - | XSS payload test |
| [ ] | P10-37 | SEC | Upload inputs: `accept`, size pre-check (UX only), filename display escaped; open links with `rel="noopener noreferrer"` | S | P10-17 | Test |
| [ ] | P10-38 | SEC | Logout clears tokens and bootstrap; preview token never persisted past tab; no open redirects after sign-in | S | - | Tests |
| [ ] | P10-39 | FE | Copy for statuses, warnings, empty and error states in `content.json` via skylabs-reena | M | P10-07 | Reviewed, banned-word check |
| [ ] | P10-40 | FE | `noindex` on all `/account/*`; 301 redirects for renamed public vendor routes decided with SEO owner | S | P10-05 | Meta test |
| [ ] | P10-41 | QA | Accessibility audit WCAG 2.2 AA on every new page (keyboard, focus, contrast, target size) via sahaj | L | P10-30 | Report with 0 blockers |
| [ ] | P10-42 | QA | Playwright e2e per role (7 roles): login, allowed action works, forbidden action hidden and server-rejected | L | P10-33 | Suite green in CI |

### 10g. Follow-ups from the staff member management slice

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P10-43 | OPS | Register DLT-approved SMS templates for the welcome, suspension and reactivation texts in `apps/msd-api/src/lib/member-messages.ts` before production | S | - | Template IDs approved and recorded |
| [ ] | P10-44 | OPS | Set `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `FIELD_ENCRYPTION_KEY` and `DOC_HASH_PEPPER` on Railway before this slice ships | S | - | Staging and production boot with all 4 set |
| [ ] | P10-45 | OPS | Run `prisma/member-status-report.ts` and get owner sign-off before applying the `member_lifecycle` migration; rehearse migration up and down on a Neon copy | M | P0-05 | Report saved, sign-off recorded, rehearsal log with row counts |
| [ ] | P10-46 | QA | Fix pre-existing lint and test drift: eslint ignore error in shared-* packages and 31 msd lint errors; 26 msd tests in 15 files (permission-matrix, roles, widget-registry, settings, home, wishlist, become-vendor, india-locations, deal-card, sky-product-card-wc, media-uploader, site-footer, contact-us, app.spec, entry-server); msd-api `rbac.routes` and orders image tests; shared-menu `index.test.ts` | M | - | `nx run-many -t lint test` green for msd, msd-api and shared-* |

## Phase 11: Security and quality assurance

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P11-01 | QA | IDOR suite across all 14 resources (member A vs B, support, sales) | M | P4-12 | All foreign reads return 404 |
| [ ] | P11-02 | QA | Mass-assignment suite: extra keys on every write return 422 | M | P2-14 | Test generated from schemas |
| [ ] | P11-03 | SEC | Review all raw SQL and `$queryRaw`; no string concatenation | S | - | Review note |
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

## Phase 12: Release, operations, documentation

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P12-01 | OPS | Document and set new env vars on Railway and Vercel; update `.env.example` and `DEPLOYMENT.md` | S | P2-09 | Staging boots from docs only |
| [ ] | P12-02 | OPS | CI: `nx affected -t lint test build`, route coverage, secret scan, audit | M | P9-06, P0-08 | PR gate active |
| [ ] | P12-03 | OPS | Rollout plan: develop, release, main; expand migrations first, code second, contract last | M | P11-08 | Written plan approved |
| [ ] | P12-04 | OPS | Monitoring: Sentry on API, alerts for cron failure, 5xx and 429 spikes, role changes, payout releases | M | P6-07 | Alerts tested |
| [ ] | P12-05 | OPS | Runbooks: suspend and restore member, rotate keys, cron failure, rollback migration | M | P12-03 | Reviewed by a second person |
| [ ] | P12-06 | BIZ | Data retention policy for audit logs, login history, documents, plus member data deletion request flow | M | P0-03 | Policy approved |
| [ ] | P12-07 | DOC | Update `ARCHITECTURE.md`, `CLAUDE.md` role keys and menu keys, `TASK.md`, `docs/msd/*` | S | P10-42 | Docs match code |
| [ ] | P12-08 | QA | UAT with 7 role accounts using the matrix as the checklist | M | P10-42 | Signed UAT sheet |
| [ ] | P12-09 | OPS | Production release and smoke test | M | P12-08 | Smoke list passes |
| [ ] | P12-10 | OPS | One release later: remove `/vendors*` aliases, old menu keys and legacy columns (P3-16) | M | P12-09 | No traffic on aliases for 14 days |
