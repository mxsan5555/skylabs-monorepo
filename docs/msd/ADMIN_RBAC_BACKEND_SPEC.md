# Admin RBAC Backend Spec (msd-api)

Status: draft for backend developer handoff (2026-10-12).
Source of truth for business rules: `docs/msd/ADMIN_USER_ROLES_AND_PERMISSIONS.md`.
Scope: `apps/msd-api` only (Express + Prisma + Zod + zod-to-openapi). `mera-driver-api` is untouched.

Purpose: tell the backend developer what exists, what to create, what to change, and which security and validation rules apply, so work can start without further discovery.

---

## 1. Current state vs required

| Area | Today | Required |
|---|---|---|
| Roles | 6 seeded: super_admin, admin, customer, `vendor`, marketing, sales | 7: add `support`, rename `vendor` to `member` |
| "Own" rule | Convention only: `/vendors/me/*` gated by `vendors:custom`, plus order service scoping. Reports, dashboard, customers, products unscoped | Server-enforced `own` scope on every route, driven by role grants |
| Permission model | Boolean `menuKey:action`, no scope | Add `scope` (ALL / OWN) per grant |
| Member status | `PROFILE_INCOMPLETE, PENDING_VERIFICATION, APPROVED, REJECTED, ACTIVE, INACTIVE, SUSPENDED`; hard delete; suspended owner can still log in | `ACTIVE, INACTIVE, SUSPENDED, ARCHIVED` (+ delete), suspended cannot log in, sessions revoked |
| Documents | One file per type, vendor-level `kycStatus`, public R2 bucket, no number, no expiry | Per-document state, masked numbers, private bucket + expiring links, reminders |
| Scheduler | None | Daily reminder job |
| Refund / payout | No Refund, no Payout model | `RefundRequest`, `Payout` |
| Support role | No staff-facing support routes | View-only routes + raise refund request |
| Security headers | No helmet, no `trust proxy`, no global rate limit, no body limit | Add all four |
| OpenAPI | ~100 paths, error wrapper not modelled, KYC routes missing | Every route documented with envelope, permission and scope |

Key existing files: `prisma/schema.prisma`, `prisma/seed.ts`, `src/middleware/{requirePermission,authenticate,validate,rateLimiter,errorHandler}.ts`, `src/routes/*.routes.ts`, `src/services/vendor.service.ts`, `src/services/vendor-document.service.ts`, `src/openapi/registry.ts`, `src/lib/media-storage.ts`, `src/config/env.ts`, `packages/shared-menu/src/msd-menu.json`.

---

## 2. Roles, resources, actions

### 2.1 Permission keys (collapse ~40 rows to 14)

| # | Key | Replaces (current menu keys) |
|---|---|---|
| 1 | `members` | `vendors`, `vendors.group` |
| 2 | `branches` | `vendors.branches`, `vendor-portal.branches` |
| 3 | `deals` | `vendors.deals`, `vendor-portal.deals` |
| 4 | `therapists` | `vendors.therapists`, `vendor-portal.therapists` |
| 5 | `products` | `vendors.products`, `products`, `vendor-portal.products` |
| 6 | `orders` | `orders`, `vendor-portal.orders` |
| 7 | `customers` | `customers`, `vendor-portal.customers` |
| 8 | `content` | all `cms.*` |
| 9 | `payments` | new (payments + payouts) |
| 10 | `reports` | `reports` |
| 11 | `staff-users` | `rbac.users` (staff only) |
| 12 | `settings` | `settings` |
| 13 | `logs` | `rbac.audit-logs`, login history |
| 14 | `profile` | `vendor-portal.profile`, `settings` profile |

Keep `masters.*` and `dashboard` as they are (not in the 14 but used by the console). Dashboard widgets must respect scope.

### 2.2 Extra actions mapped onto the 16 fixed `PermissionAction` kinds (no new kinds)

| Business action | Permission | Granted to |
|---|---|---|
| Member status (activate / deactivate / suspend) | `members:status_change` | super_admin, admin |
| Document approve | `members:approve` | super_admin, admin |
| Document reject | `members:reject` | super_admin, admin |
| Member delete | `members:delete` | super_admin only |
| Order cancel | `orders:status_change` | super_admin, admin |
| Refund issue | `orders:approve` | super_admin, admin |
| Refund request raise | `orders:custom` | support (also admin, super_admin) |
| Customer block / unblock | `customers:status_change` | super_admin, admin |
| Payout release | `payments:approve` | super_admin only |
| Report export | `reports:export` | super_admin, admin |

### 2.3 Seed matrix (V view, C create, E edit, D delete; scope A = ALL, O = OWN)

| Resource | super_admin | admin | marketing | sales | member | support |
|---|---|---|---|---|---|---|
| members | VCED (A) | VCE (A) | V (A) | VCE (A) | VE (O) | V (A) |
| branches / deals / therapists / products | VCED (A) | VCE (A) | V (A) | VCE (A) | VCE (O) | V (A) |
| orders | V | V | none | V | V (O) | V + custom |
| customers | V | V | none | V | none | V |
| content | VCED | VCE | VCE | V | none | V |
| payments | V + approve | V | none | none | V (O) | none |
| reports | V + export | V + export | none | none | V (O) | none |
| staff-users | VCED | V | none | none | none | none |
| settings | VE | V | none | none | none | none |
| logs | V (A) | V (O) | V (O) | V (O) | V (O) | V (O) |
| profile | VE (O) | VE (O) | VE (O) | VE (O) | VE (O) | VE (O) |

The `customer` role gets storefront access only, no admin grants (see open decision 5).

---

## 3. Database changes (`apps/msd-api/prisma/schema.prisma`)

Keep physical table names with `@@map` to avoid a destructive rename. One migration per numbered item, each reversible.

1. **RolePermission.scope**: `enum PermissionScope { ALL OWN }`, column `scope PermissionScope @default(ALL)`.
2. **Role data migration**: update `Role.key` `vendor` to `member`; insert `support`. Replace hardcoded `'vendor'` in `vendor.service.ts` (~L236), `'customer'` in `auth.service.ts`, `customer.service.ts` (~L26), `dashboard.service.ts` (~L80) with constants from one `lib/role-keys.ts`.
3. **Member** (rename model `Vendor`, keep `@@map("Vendor")`, rename relations gradually):
   - `enum MemberStatus { ACTIVE INACTIVE SUSPENDED ARCHIVED }`. Data map: `PROFILE_INCOMPLETE, PENDING_VERIFICATION, APPROVED, ACTIVE` become `ACTIVE`; `REJECTED` becomes `SUSPENDED` with reason "Migrated from rejected" (confirm, open decision 1).
   - New columns: `statusChangedAt`, `statusChangedByUserId`, `archivedAt`, `documentsDueAt` (createdAt + 14 days), `reviewFlaggedAt` (ready for suspension review), `welcomeSentAt`.
   - Remove `kycStatus`, `kycRejectionReason` once documents are per-row (derive "Documents complete" from rows).
   - Drop legacy `gstNumber`, `panNumber`, `kycDocuments Json` after copying into `MemberDocument`.
   - Bank fields (`bankAccountNumber`): encrypt at rest (AES-256-GCM, key from env), return masked.
4. **MemberDocument** (from `VendorDocument`): keep `@@unique([memberId, documentType])`. Add:
   - `status DocumentStatus { SUBMITTED APPROVED REJECTED EXPIRED }` (Missing = no row).
   - `numberMasked String` (Aadhaar `XXXX XXXX 1234`, PAN `ABXXXXX34F`), `numberHash String` (HMAC-SHA256 with `DOC_HASH_PEPPER`, for duplicate detection). Full Aadhaar and PAN are never stored. GST is stored in full (public business identifier).
   - `rejectionReason`, `reviewedByUserId`, `reviewedAt`, `expiresAt`, `uploadedByUserId`, `uploadedOnBehalf Boolean`.
   - Index `(status, expiresAt)` for the expiry job.
5. **MemberStatusHistory**: `id, memberId, fromStatus, toStatus, reason, actorUserId, createdAt`. Index `(memberId, createdAt)`. Written in the same transaction as the status change.
6. **MemberDocumentReminder**: `id, memberId, sequence (1..3), channel (SMS|EMAIL), missingTypes String[], sentAt, status (SENT|FAILED), providerRef`. `@@unique([memberId, sequence, channel])` makes the job idempotent.
7. **RefundRequest**: `id, orderId, requestedByUserId, reason, amount, status (REQUESTED|APPROVED|REJECTED|REFUNDED|FAILED), decidedByUserId, decidedAt, decisionNote, providerRefundId`. Add `REFUNDED`, `PARTIALLY_REFUNDED` to `PaymentStatus`.
8. **Payout**: `id, memberId, periodStart, periodEnd, grossAmount, commissionAmount, netAmount, status (PENDING|RELEASED|FAILED), releasedByUserId, releasedAt, reference`. `@@unique([memberId, periodStart, periodEnd])`. Amounts as `Decimal(12,2)`.
9. **SystemSetting**: `key @id, value Json, updatedByUserId, updatedAt`.
10. **User**: add `statusReason`, `statusChangedAt` (customer block reason). Keep `UserStatus`; suspension lives on Member and is checked at login.
11. **Soft delete** (`deletedAt`) on Branch, Deal, Therapist, Product. Delete is allowed only when no OrderItem references the row, otherwise 409 and the caller uses status.
12. **Notification**: rename recipient type `VENDOR` to `MEMBER`, add `ADMIN`. Add types `DOCUMENT_SUBMITTED, DOCUMENT_REVIEWED, DOCUMENT_REMINDER, MEMBER_SUSPENDED, REFUND_REQUESTED, PAYOUT_RELEASED`.
13. **Indexes**: `AuditLog(actorUserId, createdAt)`, `AuditLog(targetType, targetId)`, `LoginHistory(userId, createdAt)`, `Order(vendorId, createdAt)`, `OrderItem(vendorId)`.
14. **Seed** (`prisma/seed.ts`): rebuild grants from section 2.3 including `scope`; remove the `vendor-portal.*` special case; keep delete-then-recreate for super_admin only.
15. **Menu** (`packages/shared-menu/src/msd-menu.json`): add nodes for `payments`, `logs`, `profile`; rename `vendors*` keys; remove the `business` parent mismatch. Permissions are generated only from menu nodes, so every new key needs a node.

---

## 4. Authorization design (the core change)

1. `requirePermission(menuKey, action)` resolves grants with scope and sets `req.access = { scope: 'all' | 'own', memberId?: string }`. Highest scope wins across multiple roles (ALL beats OWN).
2. New `lib/scope.ts`: `scopedWhere(req, resource)` returns the Prisma `where` fragment (`{ memberId }` for branches/deals/therapists/products, `OrderItem.vendorId` for orders, `ownerUserId` for members, `userId` for logs and profile). Every list, get, update and delete query for the 14 resources goes through it. No route builds its own filter.
3. **Own-record miss returns 404, not 403** (no existence leak).
4. When scope is OWN, any `memberId` in body or query is ignored and replaced from the token.
5. `authenticate` also loads `Member.status` for member-role users: `SUSPENDED` or `ARCHIVED` gives 403 `MEMBER_SUSPENDED`; `INACTIVE` sets `req.readOnly = true`.
6. `blockWhenReadOnly` middleware on all non-GET routes except `PATCH /me` and logout: inactive members can view, not create or edit.
7. Suspending a member revokes every `RefreshSession` of the owner in the same transaction.
8. Access tokens carry `roles`; roles are re-read from the DB (30 s cache) on each request so a role change applies immediately, not at token expiry.
9. Preview (impersonation) tokens are read-only: rejected on payout release, delete, status change, refund and staff-user routes. A super admin cannot be impersonated.
10. Bootstrap (`GET /rbac/bootstrap`) returns `permissions: string[]` plus `scopes: Record<permissionKey, 'all'|'own'>` (update `packages/shared-types` and `packages/shared-permissions`).
11. Role management: `POST /rbac/roles`, `/clone` and `DELETE` return 403 `ROLE_MANAGEMENT_LOCKED`. Role permission edit stays super_admin only and cannot grant scope ALL on `members` or `orders` to the member role (guards against self-escalation).

### Member status state machine (reject any other transition with 409)

| From | To | Who | Reason required | Side effects |
|---|---|---|---|---|
| ACTIVE | INACTIVE | super_admin, admin | yes | hide from storefront, writes blocked |
| ACTIVE / INACTIVE | SUSPENDED | super_admin, admin | yes (min 10 chars) | revoke sessions, hide from storefront, notify |
| INACTIVE / SUSPENDED | ACTIVE | super_admin, admin | yes | restore exactly as before |
| any | ARCHIVED | system, on delete when orders exist | n/a | hidden everywhere, rows kept |
| any | deleted (hard) | super_admin | yes | only when zero orders, else ARCHIVED |

Storefront visibility: one shared `publicVisibleWhere()` in `services/catalog-visibility.ts` requiring member ACTIVE, branch active, deal ACTIVE and not soft-deleted. Every `/catalog` query uses it, so reactivation restores everything.

---

## 5. API endpoints (all under `/api/v1`)

Legend: NEW, CHG (existing, change gate or scope), KEEP. Every route returns the `{ data, error, meta }` envelope.

### 5.1 Members and documents

| Method + path | Permission | Scope | Status |
|---|---|---|---|
| GET `/members` (filters: status, documents=incomplete, reviewFlag=true, q, page) | members:view | own returns self | CHG (from `/vendors`) |
| POST `/members` (creates User + Member, sends welcome SMS/email) | members:create | all | CHG |
| GET `/members/:id` | members:view | own = self | CHG |
| PATCH `/members/:id` | members:edit | own = self | CHG |
| PATCH `/members/:id/status` `{status, reason}` | members:status_change | all | CHG |
| DELETE `/members/:id` `{reason}` | members:delete | all | CHG (hard delete rule) |
| GET `/members/:id/status-history`, GET `/members/:id/activity` | members:view | own = self | NEW |
| GET `/members/me`, PATCH `/members/me` | profile:view / edit | own | CHG (alias of `/vendors/me`) |
| GET `/members/:id/documents` (type, status, masked number, due date; no file URL for support) | members:view | own = self | NEW |
| PUT `/members/:id/documents/:type` (multipart, number + file) | members:edit | own = self; admin on behalf sets `uploadedOnBehalf` | CHG |
| DELETE `/members/:id/documents/:type` (only SUBMITTED or REJECTED) | members:edit | own = self | CHG |
| GET `/members/:id/documents/:type/download-url` (5 min signed URL, not support) | members:view | own = self | NEW |
| PATCH `/members/:id/documents/:type/review` `{decision, reason?}` | members:approve / members:reject | all | CHG (replaces `kyc-review`) |
| POST `/members/:id/documents/reminders` (manual send) | members:status_change | all | NEW |
| POST `/internal/jobs/document-reminders` (header `x-cron-secret`, timing-safe compare, not in public docs) | secret | n/a | NEW |

Keep `/vendors/*` and `/vendors/me/*` as deprecated aliases for one release (log their use), then remove.

### 5.2 Branches, deals, therapists, products (same shape each)

| Method + path | Permission | Scope |
|---|---|---|
| GET `/branches`, `/deals`, `/therapists`, `/products` | `<res>:view` | own = member's rows |
| POST (same paths) | `<res>:create` | own: memberId from token; all: `memberId` required in body |
| GET `/<res>/:id` | `<res>:view` | own |
| PATCH `/<res>/:id` | `<res>:edit` | own |
| PATCH `/<res>/:id/status` (pause / unpublish) | `<res>:edit` | own |
| DELETE `/<res>/:id` | `<res>:delete` | all (super_admin only) |
| PUT `/deals/:id/therapists` `{therapistIds}` | deals:edit | own; each therapist must share the deal's branch and member |

Cross-checks on create and edit: `branchId` must belong to the same `memberId`; `therapistId` must belong to the same branch; category access must be granted to that member.

### 5.3 Orders, refunds, customers

| Method + path | Permission | Scope |
|---|---|---|
| GET `/orders`, GET `/orders/:id` (member sees only own items) | orders:view | own |
| POST `/orders/:id/cancel` `{reason}` | orders:status_change | all |
| POST `/orders/:id/refund-requests` `{reason, amount?}` | orders:custom | all |
| GET `/refund-requests` | orders:view | all |
| POST `/refund-requests/:id/approve` (Razorpay refund, idempotent) and `/reject` | orders:approve | all |
| GET `/customers`, GET `/customers/:id` | customers:view | all |
| PATCH `/customers/:id/status` `{status: active\|blocked, reason}` | customers:status_change | all |

Orders, payments and customers have no DELETE route.

### 5.4 Content

Existing `cms.*` routes (blog, FAQ, pages, about, contact, careers, social, legal) keep their paths. Swap every gate to `content:<action>`. DELETE routes need `content:delete` (super_admin only).

### 5.5 Payments, payouts, reports

| Method + path | Permission | Scope |
|---|---|---|
| GET `/payments` | payments:view | own |
| GET `/payouts`, GET `/payouts/:id` | payments:view | own |
| POST `/payouts/:id/release` (header `Idempotency-Key`) | payments:approve | all, not preview token |
| GET `/reports/overview` (revenue) | reports:view | own forces memberId |
| GET `/reports/online-payment-waiting` | reports:view | own |
| GET `/reports/member-payouts` | reports:view | own |
| GET `/reports/deals`, `/reports/therapists`, `/reports/products` (ordered + canceled + refunded) | reports:view | own |
| GET `/reports/:type/export?format=csv` | reports:export | all |

All report routes accept `from`, `to` (max 366 days) and `memberId` (ignored under OWN scope).

### 5.6 Staff, settings, logs, profile

| Method + path | Permission | Notes |
|---|---|---|
| GET/POST `/staff-users`, GET/PATCH `/staff-users/:id` | staff-users:view/create/edit | Role set limited to super_admin, admin, marketing, sales, support. Cannot create member or customer here |
| PATCH `/staff-users/:id/status` | staff-users:edit | Cannot deactivate the last active super_admin |
| DELETE `/staff-users/:id` | staff-users:delete | super_admin only, soft |
| POST `/staff-users/:id/revoke-sessions`, `/reset-otp` | staff-users:edit | CHG from `/rbac/users/*` |
| GET `/settings`, PATCH `/settings/:key` | settings:view / edit | NEW (`SystemSetting`) |
| GET `/logs/login-history` | logs:view | all or own |
| GET `/logs/audit` (filters: actorUserId, action, targetType, targetId, from, to) | logs:view | super_admin all; others own actions |
| GET `/me`, PATCH `/me` | profile:view / edit | own. Allowlist: name, phone, email, avatar. Never roles or status |

---

## 6. Validation rules (Zod, `.strict()` on every body so unknown keys are rejected)

| Field | Rule |
|---|---|
| ids | Match the existing Prisma id type (uuid or cuid) |
| phone | `^\+91[6-9]\d{9}$` (normalise before validating) |
| email | RFC email, max 254, lowercase |
| PAN | `^[A-Z]{5}[0-9]{4}[A-Z]$`, uppercase before check |
| GST | `^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` plus state code 01..38 |
| Aadhaar | 12 digits, first digit 2-9, Verhoeff checksum; accepted once, then only the masked form is kept |
| IFSC | `^[A-Z]{4}0[A-Z0-9]{6}$` |
| UPI | `^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$` |
| status reason | trimmed, 10 to 500 chars |
| document file | PDF, JPG or PNG, 5 MB max, magic-byte check (exists), one file |
| pagination | `page >= 1`, `pageSize` 1..100 (default 20) |
| sort | allowlist enum per resource, never a raw field name to Prisma `orderBy` |
| dates | ISO 8601, `from <= to`, range max 366 days |
| money | non-negative, 2 decimals, `Decimal`, never float |
| refund amount | `<= paid amount - already refunded` (computed server side) |

Business validations (service layer, 409 or 422): status transitions per section 4; delete blocked when orders exist; therapist and deal share a branch; a member cannot get a second owner; duplicate document number (by `numberHash`) across members returns 409 `DOCUMENT_NUMBER_IN_USE`.

---

## 7. Security requirements

**Access control**
- Server-side scope on every route (section 4). Add a table-driven test over every role x resource x action x own/other record.
- 404 on foreign records; 403 only for a missing permission.
- Mass assignment blocked by `.strict()` schemas plus explicit field allowlists on update.
- Super_admin-only actions (member delete, payout release, staff delete, settings edit) are enforced in code as well as in the seed, so a role edit cannot grant them to another role.

**Documents and PII**
- Move documents to a **private** R2 bucket (`R2_PRIVATE_BUCKET`); media stays public. Serve through presigned GET (5 min) with `Content-Disposition: attachment`. Fix the ContentType map for `.pdf` in `lib/media-storage.ts`.
- Never store, log or return a full Aadhaar or PAN. Redact `documentNumber`, `bankAccountNumber`, `otp`, `authorization` in the request logger.
- Support role: no download-url, no file keys in responses, only type and status.
- Encrypt the bank account number at rest; key in env, never in the repo.

**Transport and hardening**
- Add `helmet`, `app.set('trust proxy', 1)` (Railway), `express.json({ limit: '100kb' })`.
- Global rate limit (for example 300 per 15 min per IP) plus stricter limiters on login/OTP (exists), upload (20 per hour per user), status change, payout release and export.
- Production boot fails if `JWT_SECRET` is under 32 chars or `CORS_ORIGIN` contains `*`.
- Razorpay webhook: verify HMAC on the raw body with a timing-safe compare; store the event id and ignore replays.
- Cron endpoint: secret from `CRON_SECRET`, timing-safe compare, optional IP allow-list.

**Auditing**
- Every mutation writes `AuditLog` with actor, action (dotted constants such as `member.status.changed`), target, before, after, reason, ip, user agent. Status changes also write `MemberStatusHistory` in the same transaction.
- Exports and document downloads are audited.
- Money-moving routes (refund approve, payout release) require `Idempotency-Key`, run in a transaction, and return the original result on replay.

**Repo hygiene**
- `apps/msd-api/.env.example` line 10 holds what looks like a real Neon connection string. Remove it and rotate that credential.
- CSV export: prefix cells starting with `=`, `+`, `-`, `@` to block formula injection.

---

## 8. OpenAPI (`apps/msd-api/src/openapi`)

1. Split `registry.ts` (2554 lines) into `openapi/paths/<domain>.ts`; keep one `buildOpenApiDocument()`.
2. Add an `envelope(schema)` helper so every success response is `{ data, error: null, meta? }` and every error is `{ data: null, error: { code, message, details? } }`. Current docs show only the bare error object.
3. Shared components: `Error`, `Pagination`, `MemberStatus`, `DocumentStatus`, `DocumentType`, `PermissionScope`, `IdempotencyKey` header, standard 401/403/404/409/422/429 responses.
4. Per operation: `security: bearerAuth`, plus extensions `x-required-permission: "members:status_change"` and `x-scope: "all|own"` so the doc doubles as the permission map.
5. New schemas: `MemberCreate`, `MemberUpdate`, `MemberStatusChange`, `MemberDetail`, `MemberDocument`, `DocumentUpload`, `DocumentReview`, `StatusHistoryItem`, `RefundRequest` (+ Create, Decision), `Payout`, `PayoutRelease`, `ReportQuery`, `ReportOverview`, `StaffUserCreate`, `SystemSetting`, `LoginHistoryItem`, `AuditLogItem`, `Bootstrap` (with `scopes`).
6. Add the missing KYC document routes.
7. CI check: a script compares the Express router stack to the registry and fails on any undocumented route. Serve `/docs` only when `NODE_ENV !== 'production'` or behind basic auth.

---

## 9. Open decisions (owner answer needed before build)

1. **Old onboarding states**: map `REJECTED` to SUSPENDED or ACTIVE? Recommendation: SUSPENDED with reason.
2. **Deal approval**: the current flow has `PENDING/APPROVED/REJECTED`; the role doc lets members publish freely. Recommendation: remove the gate and keep unpublish by admin through `deals:edit`.
3. **"Ready for suspension review" timing**: day 28 (when warning 3 sends) or day 35 (one week after). Recommendation: day 35.
4. **Refund model**: `orders:approve` to issue and `orders:custom` to request is a mapping choice. Alternative: a dedicated `refunds` key. Recommendation: keep the mapping, avoids a 15th resource.
5. **Customer role**: keep `dashboard:view` or no admin grants. Recommendation: none.
6. **Scheduler**: Railway cron hitting the secured endpoint (recommended, safe with several instances) or in-process `node-cron`.
7. **Payout calculation**: commission rule and payout cadence are not in the role doc. A business rule is needed before `Payout` rows can be generated.

---

## 10. Build order (maps to section 6 of the role doc)

1. Roles, `scope` column, seed matrix, menu cleanup, role-key constants (migrations 1, 2, 14, 15).
2. Authorization core: `req.access`, `scopedWhere`, member-status checks, read-only guard, helmet and limits (sections 4 and 7).
3. Vendor to member rename with aliases (migration 3), status machine, `MemberStatusHistory`.
4. Own-scope retrofit on branches, deals, therapists, products, orders, reports, dashboard, logs.
5. Documents: private bucket, `MemberDocument` changes, review, signed URLs, validators.
6. Reminders: `MemberDocumentReminder`, cron endpoint, SMS/email templates, notification types.
7. Refunds, payouts, report endpoints, settings, staff-users.
8. OpenAPI split and CI route-coverage check.

## 11. Verification

- `npx prisma validate --schema=apps/msd-api/prisma/schema.prisma`, then `npx prisma migrate dev` on a copy of the Neon data; confirm vendor-to-member and status mapping row counts match.
- `npx nx run msd-api:test`: permission matrix test (7 roles x 14 resources x actions x own/other), IDOR tests (member A reads member B's branch gets 404), status machine tests, suspended-login test, inactive read-only test, document masking test, duplicate number test, cron idempotency test, refund and payout idempotency tests.
- `npx nx serve msd-api`, open `/docs`, confirm every route shows `x-required-permission`; run the route-coverage script.
- Manual: log in as each of the 7 seeded users and hit one route per resource; confirm 403, 404 and 200 match the matrix.
- Confirm storefront `/catalog/*` hides a suspended member's deals and restores them on reactivation.
