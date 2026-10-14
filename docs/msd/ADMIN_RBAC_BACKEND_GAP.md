# MSD Admin RBAC Backend Spec — Existing Code Gap Analysis

Review date: 2026-10-13  
Scope: compare [`ADMIN_RBAC_BACKEND_SPEC.md`](./ADMIN_RBAC_BACKEND_SPEC.md) with the current MSD backend and the directly related shared RBAC files. This is a read-only code review; no application code was changed and no tests or database commands were run.

## Executive summary

The spec describes a broad redesign, not a small extension. Some foundations already exist—most notably the `RolePermission.scope` database field and API support for editing it, an established `{ data, error, meta }` response envelope, real KYC file upload with magic-byte and 5 MB checks, and partial vendor/order ownership checks.

The core behavior is still missing: permission scopes do not affect authorization, ownership is not enforced uniformly across resources, and the member lifecycle, private document handling, support role, refund/payout, staff/settings/log APIs, and route-to-OpenAPI coverage required by the spec are not implemented.

**Important correction to the spec/task checklist:** `PermissionScope { ALL, OWN }`, `RolePermission.scope`, and its migration already exist. Do not create a duplicate migration. The related `ADMIN_RBAC_TASKS.md` still marks all work as not started, so its status needs reconciliation before implementation tracking is relied on.

## What already exists

| Area | Existing implementation | What that does—and does not—cover |
|---|---|---|
| Permission scope storage | Prisma enum and `RolePermission.scope` defaulting to `ALL`; migration `20261008104219_add_permission_scope`. | Storage only. `requirePermission` still checks a flat permission-key list and does not return or enforce a scope. |
| Role permission editing | RBAC schemas accept `ALL`/`OWN`; role service reads, clones, and replaces grants including their scope. | The requested self-escalation restrictions and super-admin-only route rules are not applied by this general assignment path. Role create/clone/delete routes are enabled today. |
| Authentication and permission foundation | Shared `authenticate`, `requirePermission`, permission resolution/cache, and `/rbac/bootstrap` already exist. Bootstrap returns roles, flat permissions, filtered menu, and dashboard widgets. | It has no `req.access`, `req.readOnly`, member-status gate, or `scopes` map. The request identity's roles originate in the access token. |
| Existing role/menu model | Seed currently creates six system roles: `super_admin`, `admin`, `customer`, `vendor`, `marketing`, `sales`. Menu and route keys include `vendors*`, `vendor-portal.*`, and `cms.*`. | `support`, the `member` name/key, the 14-resource key consolidation, and the requested seed matrix are not in place. |
| Vendor and order ownership | `/vendors/me/*` resolves the vendor from the authenticated user. Order services force vendor-owned filtering and remove other vendors' items from a multi-vendor order response; a foreign order returns 404. | This is useful prior art, not a shared scope system. Other resource, report, dashboard, customer, and member queries still need explicit review and consistent enforcement. |
| Current member/vendor lifecycle | Vendor status, KYC status/review, hard delete, and status-reason fields exist. Vendor deletion can conflict where related order records prevent deletion. | Current statuses also include onboarding states; transitions are simple updates without the requested transition matrix, status history, archive behavior, atomic session revocation, or member-specific login/read-only rules. |
| KYC upload and validation | One `VendorDocument` row per document type; upload checks actual magic bytes and allows PDF/JPG/PNG up to 5 MB. Upload, delete, and review have current endpoints. | Documents have no per-document status/number/expiry/reviewer fields. The KYC file goes through the general R2 bucket/storage helper, and returned document records include storage metadata. There is no private-bucket signed-download flow or document reminder job. |
| Input validation | Zod schemas and validation middleware exist. Current vendor fields normalize Indian phone numbers and validate PAN/GST shape. Pagination defaults to page 1 / size 20 and caps size at 100. | Vendor schemas use ordinary `z.object()` behavior (unknown keys are stripped, not rejected); some fields such as IFSC/UPI have only length checks. Aadhaar checksum, reason bounds, GST state-code validation, date-range bounds, allowlisted sorts, and the complete spec-wide strict-body policy need implementation/coverage. |
| Responses and auditing | Runtime helpers produce `{ data, error, meta? }`; many mutating routes call `writeAuditLog`. | Audit writes are explicitly best-effort and can be lost after a successful mutation. The spec requires mutation/status-history consistency, broader audit coverage, and audit of exports/downloads. |
| Payments | Razorpay webhook verifies an HMAC of captured raw request bytes with a timing-safe comparison. Payment processing treats terminal payment states as no-ops on retry. | There is no refund request or payout model/API. The webhook has no separate persisted provider-event-id replay record. No money-movement `Idempotency-Key` flow exists for the new operations. |
| Public catalog visibility | Existing predicates require an active vendor, active branch, and active deal; product/therapist predicates also check vendor/branch state. | There is no single shared `publicVisibleWhere()` helper or requested soft-delete fields. Deals additionally require `approvalStatus: APPROVED`; the spec's recommendation to remove that gate is an unresolved behavior change. |
| OpenAPI | A single registry builds `/docs`; bearer security is used in registered operations. | The registry remains a single large file, and no `x-required-permission` / `x-scope` extensions or route-coverage check were found. Runtime envelopes exist, but the spec says their schemas are not modeled consistently. |

## Changes required, in practical order

### 1. Resolve decisions and reconcile the plan

Before schema/API work, record the seven owner decisions in spec section 9, define payout commission and cadence, and complete the compliance review for Aadhaar/PAN handling. Check the commented database URL in `apps/msd-api/.env.example` privately; do not copy credentials into notes or reports, and rotate them if they were ever real.

Reconcile `ADMIN_RBAC_TASKS.md`: its P1-01 migration is already present, while the rest of its unchecked status should be confirmed against the repository before being treated as a verified progress baseline.

### 2. Complete RBAC migration and authorization

- Keep the existing `PermissionScope` schema/migration; add tests and change the permission resolver/guard to resolve grants as `{ key, scope }`, choosing `ALL` over `OWN` across a user's roles.
- Add request access context and one reusable `scopedWhere` policy for each resource. A caller-provided `memberId` must not widen an OWN-scoped query. Return 404 for a foreign record where the spec requires existence concealment.
- Add `scopes` to `/rbac/bootstrap` and to `shared-types` (and any permission helper used by either frontend).
- Add the `member` and `support` roles, replace seeded grants with the agreed matrix, migrate old role/menu grants safely, and update menu nodes and server permission keys together.
- Enforce restricted operations in server code, not only through seed grants. Decide whether dynamic role creation is intentionally being disabled: the current RBAC API exposes create/clone/delete, while the spec/business-role document says these operations should be locked.
- Re-read role assignment/status from the database or invalidate role/permission caches on all relevant changes; verify how user-role revocation affects already-issued tokens.

### 3. Implement member lifecycle and resource scoping

- Migrate vendor names/keys and existing data without changing physical tables destructively; keep deprecated `/vendors/*` aliases for the agreed transition window.
- Implement the four-state member lifecycle, validated transition table, reason rules, status history, archive-vs-hard-delete behavior, and session revocation in the same transaction where required.
- Change authentication behavior specifically for member status: suspended/archived blocked; inactive remains read-only except approved profile/logout operations. Do not replace this with the current blanket `User.status !== active` rule without resolving the difference for staff and customers.
- Apply own-scope enforcement to branches, deals, therapists, products, orders, reports, dashboard, logs, and member records. Preserve the existing multi-vendor order item filtering.
- Centralize public storefront visibility and decide the deal approval behavior before removing the current `APPROVED` condition.

### 4. Add document privacy, lifecycle, and reminders

- Extend the document model with row-level state, masked number, keyed hash for duplicate detection, expiry/review/uploader metadata, and status/expiry index. Never persist or expose full Aadhaar/PAN.
- Keep the existing byte-sniff and 5 MB checks, but add the exact required number validators, database-backed duplicate-number conflict behavior, review rules, and permitted deletion states.
- Separate private KYC objects from public media; implement a private bucket setting and short-lived, attachment-only signed download URLs. Ensure support responses contain no storage key or download URL. Add `.pdf` MIME mapping.
- Add document due dates, reminder history/idempotency, notifications, manual reminder endpoint, and an authenticated-by-secret scheduled job with timing-safe secret comparison.

### 5. Add the missing business APIs

Implement models, migrations, services, routes, strict schemas, audit behavior, and OpenAPI entries for:

- Refund requests and decisions; compute allowable refund amount server-side and make provider calls idempotent.
- Payout generation/release; do not build payout calculations until commission/cadence rules are approved. Release must reject preview tokens and use a transaction plus idempotency key.
- Reports required by the spec, including member-scoped views and CSV export.
- Staff users, settings, login history, audit-log filters, and `/me` profile routes.
- Member status/activity/document/reminder endpoints and the new resource route aliases.

Current reports expose overall/vendor/branch/month/product-service summaries and top lists behind `reports:view`; there is no CSV export route in the current report router.

### 6. Harden runtime and complete API contract

- Add production-validated JWT/CORS settings, `helmet`, Railway `trust proxy`, a bounded JSON body size, and global plus endpoint-specific rate limits.
- Keep the existing raw-body Razorpay signature verification; add durable event-id replay protection if required by the final webhook design.
- Keep the runtime response envelope, but model it consistently in OpenAPI. Split the registry by domain, add required-permission/scope metadata and standard response schemas, and add a CI route-to-registry coverage check.
- Restrict `/docs` in production as specified.
- Make critical audit/status-history writes transactional with their mutation; audit exports and document downloads. Add a request logger only with explicit redaction and ensure sensitive values never enter logs.
- Add CSV formula-injection protection when CSV export is added.

## What to validate

### Database and migration safety

- Run Prisma validation and generate the client after schema work.
- Rehearse migrations on a restorable database copy; compare pre/post row counts and sampled mappings for vendor-to-member keys, all old statuses, document metadata, role grants, and existing refresh sessions.
- Confirm migrations are reversible where promised, and that cascade/restrict behavior matches the archive/delete policy.
- Run the seed twice and verify stable roles, menu-derived permission rows, exact role/action/scope matrix, and preserved custom-role grants.

### Authorization and lifecycle tests

- Table-drive all roles × resources × actions × ALL/OWN × own/foreign records; check allowed response, 403 for missing permission, and 404 for an inaccessible foreign record.
- Attempt scope escalation through query/body `memberId`, nested branch/deal/therapist relationships, multi-vendor orders, updates, deletes, and role-permission editing.
- Test multi-role scope precedence, role disable/revocation propagation, bootstrap scopes, and preview-token denials.
- Exercise every allowed and rejected status transition, reason bounds, concurrent transitions, session revocation, inactive read-only exceptions, and restoration of storefront visibility.
- Confirm active public catalog responses hide inactive/suspended/archived members and restore eligible deals/products/therapists after reactivation without changing their individual statuses.

### Validation, privacy, and reliability tests

- Test valid/invalid and normalized phone, PAN, GST (including state code), Aadhaar checksum, IFSC, UPI, strict unknown-key rejection, pagination, sort allowlists, date order/range, Decimal precision, and refund ceiling.
- Test upload size/MIME/magic bytes, private object storage, PDF content type, signed-link expiry/content disposition, support-role response redaction, masked number formatting, duplicate-number conflicts, and no PII in logs.
- Test reminder retries and idempotency, webhook replay behavior, refund/payout idempotency under repeated and concurrent requests, and atomic audit/status-history persistence.
- Test CSV formula-prefix handling for each dangerous leading character and the OpenAPI route-coverage script.
- Run the targeted `msd-api` tests and lint/build, then the full affected project suite; finish with manual role-by-role API checks and a storefront smoke test.

## Improvement notes for the spec before implementation

1. **Avoid duplicate work:** mark the scope enum/column migration as already landed, then track scope enforcement and its tests as incomplete.
2. **Make the contract precise:** define exact scope representation in bootstrap (per permission key vs resource key), precedence across multiple roles, and handling where a user has multiple member ownership records.
3. **Resolve inconsistencies before coding:** role-creation lockdown vs the shipped dynamic-role model; role matrix says support can view orders but endpoint table currently describes support refund raising; delete semantics and status-history behavior; and the deal-approval gate.
4. **Clarify existing input behavior:** the spec says every request body rejects unknown fields, while current schemas deliberately strip them in places. Decide whether to migrate all existing clients atomically or stage strictness by API version.
5. **Define privacy and retention:** document retention/deletion, hash-pepper rotation, encryption-key rotation/recovery, private-bucket access policy, and handling of legacy full PAN/GST/Aadhaar fields before designing the data migration.
6. **Define operational failure policy:** whether a business mutation must fail if its audit write fails, and how retries/compensation work when an SMS/email provider or Razorpay succeeds but the database transaction fails.
7. **Keep compatibility measurable:** specify alias deprecation telemetry and removal date; identify all frontend/shared-package consumers before changing menu keys or bootstrap shapes.

## Source files reviewed

- Backend spec and role source: `ADMIN_RBAC_BACKEND_SPEC.md`, `ADMIN_USER_ROLES_AND_PERMISSIONS.md`, `ADMIN_RBAC_TASKS.md`.
- Database and seed: `apps/msd-api/prisma/schema.prisma`, migrations, `apps/msd-api/prisma/seed.ts`.
- Authorization/API foundation: `src/middleware/{authenticate,requirePermission,validate,rateLimiter}.ts`, `src/services/{permission-resolver,role,bootstrap,permission-migration,order,reports,vendor,vendor-document,audit,payment}.service.ts`, and related routes/schemas.
- Runtime and contract: `src/app.ts`, `src/config/env.ts`, `src/lib/{http,media-storage,media-upload.middleware}.ts`, `src/openapi/registry.ts`.
- Shared permission/menu types: `packages/shared-types/src/index.ts`, `packages/shared-menu/src/msd-menu.json`.
