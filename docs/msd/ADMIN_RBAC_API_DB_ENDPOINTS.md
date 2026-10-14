# MSD Admin RBAC — API and Database Handoff

**Prepared:** 2026-10-13  
**Project scope:** `apps/msd-api` and the MSD RBAC shared contracts/menu only  
**Purpose:** what the repository currently implements, current endpoint request/response behavior where verified, target endpoints for missing/changed behavior, database gap, validation gaps, and decisions needed before implementation.  
**Code changes:** None. This document does not change application code, schemas, migrations, or tests.

> This handoff compares the backend specification and its role/business source with the checked-in MSD API. “Exists” means a route/model/behavior was found in the repository. It does not mean the implementation already meets the target authorization, privacy, or validation requirements. Proposed request/response bodies for new endpoints are draft contracts and should be confirmed with the TL before coding.

## 1.  summary

1. The project already has a Prisma `PermissionScope` enum (`ALL`, `OWN`), `RolePermission.scope`, and a database migration. **Do not create that migration a second time.**
2. The RBAC permission editor already saves and returns scope, including preserving it when cloning a role. But the runtime `requirePermission` check resolves only flat permission keys: **OWN/ALL is not enforced by that middleware**.
3. The project already has useful foundations: authenticated route middleware, Zod validation, UUID/pagination validation, a common `{data,error,meta}` response envelope, vendor-owned `/me` endpoints, order-item-level vendor filtering, and KYC file magic-byte/5 MB validation.
4. The target is not fully implemented. `member` lifecycle, `support` role, consistent resource scope, private KYC storage and signed URLs, document number protection/reminders, refund and payout APIs, report export, staff/settings/log/profile target routes, and permission/scope OpenAPI metadata are absent or incomplete.
5. Existing paths are not the same as several paths in the target spec. Keep the current routes working during an agreed migration window; add aliases or migrate clients deliberately rather than silently changing paths.
6. Important conflict to resolve: the shipped repository supports dynamic role create/clone/delete, while the proposed backend spec asks to lock these operations. The business role document says custom roles are not needed “for now,” but project-wide RBAC documentation describes dynamic roles. TL must choose the intended product behavior.

## 2. Reading guide and API conventions

- API base URL path is `/api/v1`.
- Protected API requests use `Authorization: Bearer <access-token>`.
- JSON successes use `{ "data": ..., "error": null, "meta"?: ... }`.
- JSON errors use `{ "data": null, "error": { "code": "...", "message": "...", "details"?: ... } }`.
- List endpoints generally return pagination in `meta: { total, page, pageSize }`.
- The current schemas commonly use ordinary `z.object()`: Zod strips unknown fields by default. That is **not** the target `.strict()` rejection behavior.
- Request/response examples marked **target draft** below describe an API design, not code already deployed.
- Current response payload properties vary by service. Where this document says “current DTO,” the envelope and route are verified, but the service decides the exact `data` fields.

## 3. Current implementation inventory — existing endpoints and contracts

### 3.1 Existing RBAC, users, and audit routes

All paths below are under `/api/v1/rbac`. The RBAC router applies authentication.

| Current endpoint | Status today | Request (verified) | Response (verified) | Gap against target |
|---|---|---|---|---|
| `GET /rbac/bootstrap` | Exists | Bearer token; no body | `data` has `user`, `roles`, flat `permissions`, filtered `menu`, `dashboardWidgets`, optional `preview` | No `scopes` map. |
| `GET /rbac/roles` | Exists | Bearer; `rbac.roles:view` | Role list in `data` | Keep only if role management remains enabled. |
| `POST /rbac/roles` | Exists | JSON role create schema: `key`, `name`, optional `description`, optional/defaulted `isActive` | Created role DTO, HTTP 201 | Target spec says deny with `403 ROLE_MANAGEMENT_LOCKED`; a change is needed only after product decision. |
| `PATCH /rbac/roles/:id` | Exists | UUID `id`; partial role fields from role schema | Updated role DTO | Not specified as removed in target, but target says permission editing remains super-admin-only. |
| `DELETE /rbac/roles/:id` | Exists | UUID `id`; `rbac.roles:delete` | `{ data: null, error: null }` | Target spec says deny with `ROLE_MANAGEMENT_LOCKED`. |
| `POST /rbac/roles/:id/clone` | Exists | UUID `id`; body `{ key, name }` | Created role DTO, HTTP 201 | Target spec says deny with `ROLE_MANAGEMENT_LOCKED`. |
| `GET /rbac/permissions/catalog` | Exists | Bearer; `rbac.roles:view` | Permission catalog rows | Permission catalog currently derives from old menu/resource keys. |
| `GET /rbac/roles/:id/permissions` | Exists | Bearer; role permission view | Grant rows include `permission` and `scope` | Scope is persisted/read, but is not a uniform route authorization rule. |
| `PUT /rbac/roles/:id/permissions` | Exists | `{ "permissions": [{ "permissionId": "<uuid>", "scope": "ALL" }] }` | Replaced grant rows | No guard found for member-role OWN-only limits; route uses `rbac.roles:edit`, not a verified super-admin-only code policy. |
| `GET /rbac/dashboard-widgets`, `POST /rbac/dashboard-widgets` | Exists | Dashboard widget catalog/create schema | Widget DTO/list | Target says dashboard widgets must respect scope; no scope data in bootstrap. |
| `GET /rbac/users` | Exists | Query: `page`, `pageSize`, optional `search`, optional `roleKey`; `rbac.users:view` | User list + pagination meta | Target separates staff accounts from Members/Customers; current role-key filtering allows existing general user management. |
| `POST /rbac/users` | Exists | `{ name, email?, phone?, roleIds? }`; `rbac.users:create` | User DTO, HTTP 201 | Target staff route is `/staff-users`; staff create roles need allowlist; do not create member/customer here. |
| `GET /rbac/users/me`, `PATCH /rbac/users/me` | Exists | Bearer; update body allowlist is `name?`, `email?`, `phone?` | Current user DTO | Target also proposes `/me`; target allowlist adds avatar and forbids role/status fields. Existing route has no `avatar`. |
| `GET/PATCH/DELETE /rbac/users/:id` | Exists | UUID; `PATCH` accepts user profile fields; permission-gated | User DTO or null on deletion | Target uses `/staff-users/:id`; target delete is soft and super-admin-only. |
| `PATCH /rbac/users/:id/status` | Exists | User status update schema; `rbac.users:status_change` | User DTO | No last-active-super-admin guard verified. Target staff route status uses `staff-users:edit`. |
| `POST/DELETE /rbac/users/:id/roles/:roleId` | Exists | IDs in path; `rbac.users:assign` | `{ assigned: true/false }` | Role changes must invalidate/reload authorization state. |
| `POST /rbac/users/:id/sessions/revoke-all`, `POST /rbac/users/:id/otp/reset` | Exists | UUID `id`; `rbac.users:edit` | `{ revoked: true }` / `{ reset: true }` | Target moves these to `/staff-users/:id/revoke-sessions` and `/reset-otp`. |
| `GET /rbac/users/:id/login-history`, `GET /rbac/users/:id/sessions` | Exists | UUID; login-history query has `page`, `pageSize` | Login history list + meta / session list | Target centralizes history under `/logs/login-history`; verify session DTO does not expose refresh secrets. |
| `GET /rbac/audit-logs` | Exists | `page`, `pageSize`, optional `targetUserId` query; `rbac.audit-logs:view` | Audit rows + pagination meta | Target path `/logs/audit` and broader actor/action/target/date filters; target OWN filtering is missing. |

### 3.2 Existing vendor/member, document, and resource endpoints

Current data model/API names use **Vendor**. “Member” routes below are therefore not yet a rename/alias; they are the target REST design.

| Current endpoint | Status today | Request (verified) | Response (verified) | Gap against target |
|---|---|---|---|---|
| `GET /vendors` | Exists | Query `page`, `pageSize`, optional `search`, `status`; `vendors:view` | Vendor DTO list with counts + `meta` | Target is `GET /members`; required filters `documents`, `reviewFlag`, search and own scope need adding. |
| `POST /vendors` | Exists | Vendor business/profile fields in `VendorCreateSchema`; `vendors:create` | Vendor DTO with completion data, HTTP 201 | Target `/members` must create linked User + Member and send welcome SMS/email. Existing exact welcome behavior must be checked/implemented. |
| `GET /vendors/:id`, `PATCH /vendors/:id` | Exists | UUID; `PATCH` uses partial vendor fields; view/edit permissions | Vendor DTO | Target `/members/:id`; response must avoid secrets/PII and include member status/document summary. |
| `PATCH /vendors/:id/approve`, `/reject` | Exists | Reject body `{ reason }`; approve has no body | Updated vendor DTO | Target uses status lifecycle and per-document review instead of this legacy onboarding/KYC flow. |
| `PATCH /vendors/:id/status` | Exists | `{ status: ACTIVE|INACTIVE|SUSPENDED, reason? }`; reason required for non-ACTIVE, max 1000 (not target 10–500) | Updated vendor DTO | No transition table validation, archive state, status-history row, or atomic session revocation verified. |
| `DELETE /vendors/:id` | Exists | UUID; `vendors:delete`; no reason body | Null data on success; conflict possible if referenced rows block deletion | Target requires reason, zero-order hard delete, otherwise archive, super-admin-only check in code. |
| `GET /vendors/me`, `PATCH`/other `/vendors/me/*` | Exists | Authenticated owner resolved from token; many endpoints use `vendors:custom` | Vendor/resource DTOs | These are useful own-record behavior but use old permission keys and are not the proposed canonical `/members/me` + scoped resources. |
| `GET /vendors/me/kyc-documents` | Exists | Bearer; no body; vendor resolved from owner | Array of `VendorDocument` rows | Contains document/storage metadata; target support response must redact keys and show only type/status. |
| `POST /vendors/me/kyc-documents/:documentType` | Exists | Multipart `file`; type `GST|PAN|AADHAAR`; max 5 MB + magic-byte validation | Document row, HTTP 201 | Target `PUT /members/:id/documents/:type` adds document number, status, private storage, uploader info, etc. |
| `DELETE /vendors/me/kyc-documents/:documentType` | Exists | Path document type; no body | `{ deleted: true }` | Target only permits deletion in `SUBMITTED` or `REJECTED`; current behavior deletes row/file without that state machine. |
| `GET /vendors/:id/kyc-documents` | Exists | UUID; `vendors:view` | Array of document rows | Target `GET /members/:id/documents` filters by type/status and returns masked number/due date; support cannot see file keys. |
| `POST/DELETE /vendors/:id/kyc-documents/:documentType` | Exists | Admin-on-behalf multipart upload or path-only delete; `vendors:edit` | Document row / `{ deleted: true }` | No `uploadedOnBehalf`, document number, row review status, or delete-state gate. |
| `PATCH /vendors/:id/kyc-review` | Exists | `{ kycStatus: VERIFIED|REJECTED, rejectionReason? }`; `vendors:approve` | Updated Vendor DTO | Target replaces vendor-wide KYC with `PATCH /members/:id/documents/:type/review` and separate approve/reject actions. |
| `/vendors/me/branches*`, `/vendors/:vendorId/branches*` | Exists | Nested vendor/branch paths; body schemas vary by operation | Branch DTO/list | Own behavior exists, but canonical `GET/POST/PATCH /branches` paths and common scope helper do not. |
| `/vendors/me/branches/:branchId/deals*`, `/vendors/:vendorId/branches/:branchId/deals*` | Exists | Nested branch/member context | Deal DTO/list; status/approval routes also exist | Target canonical `/deals` and therapist assignments; cross-member branch/deal validation needs central tests. |
| `/vendors/me/branches/:branchId/therapists*`, `/vendors/:vendorId/therapists*` | Exists | Nested vendor/branch paths | Therapist DTO/list | Target canonical `/therapists`; ensure branch and member ownership for every create/edit/assignment. |
| `/vendors/me/products*`, `/vendors/:vendorId/products*` | Exists | Nested paths; product query/body schemas | Product DTO/list | Target canonical `/products` CRUD; current cross-vendor `GET /products` and `GET /products/:id` also exist and force-scope callers with a Vendor profile. |

Media endpoints for vendor images/video are also present, but their public-media API is not the same as the target private KYC-document download API.

### 3.3 Existing orders, customers, payments, reports, dashboard

| Current endpoint | Status today | Request (verified) | Response (verified) | Gap against target |
|---|---|---|---|---|
| `GET /orders` | Exists | Query `page`, `pageSize`, `status`, `vendorId`, `branchId`, `customerId`, `paymentStatus`, `createdFrom`, `createdTo`, `search` | Order list + pagination meta; vendor-owned result filtering removes other vendors' order items | Partial OWN implementation for vendors; no grant-scope-based shared policy. Target filters include `memberId` and enforce scope regardless of query. |
| `GET /orders/:id` | Exists | UUID | Order DTO; vendor foreign-record access returns 404 | Current own check is based on vendor ownership, not `RolePermission.scope`. |
| `PATCH /orders/:id/status` | Exists | `{ status: PENDING_PAYMENT|CONFIRMED|COMPLETED|CANCELLED, cancellationReason? }` | Updated order DTO | Target asks `POST /orders/:id/cancel` `{ reason }` with `orders:status_change`; currently status endpoint can represent more than cancellation. |
| `POST /orders/checkout`, `/orders/me*`, payment/batch paths | Exists | Checkout contact fields optional; user-specific paths use authenticated user. Payment routes include Razorpay webhook | Order/payment DTOs or `{ received: true }` for valid webhook | Customer checkout/payment lifecycle is existing functionality; do not confuse it with staff/member order listing or refunds. |
| `GET /customers`, `GET /customers/:id` | Exists | List query `page`, `pageSize`, `search`, `status`; UUID for detail; `customers:view` | Customer DTO list/detail; list includes meta | Target keeps these routes. Scope for staff/customer data is not the target OWN member scope. |
| `PATCH /customers/:id/status` | Exists | `CustomerStatusUpdateSchema` accepts the current `UserStatus` representation (`active`, `inactive`, `blocked`); `customers:status_change` | Updated customer DTO | Target body is `{ status: active|blocked, reason }`; add reason/history and verify mapping from `inactive`/`blocked` to UI language. |
| `POST /payments/webhook/razorpay` | Exists | Raw-body HMAC signature header; provider JSON event | `{ received: true }` after valid signature/event handling | Signature uses captured raw bytes and timing-safe comparison; separate durable provider-event-id replay tracking is not present. |
| `GET /reports/summary` | Exists | `dateFrom?`, `dateTo?` (`YYYY-MM-DD`), `vendorId?`, `branchId?`, `orderStatus?`, `paymentStatus?` | Summary DTO from database aggregates | Target `/reports/overview` and own-scope forced member filtering differ. |
| `GET /reports/vendor-wise`, `/branch-wise`, `/month-wise`, `/service-vs-product`, `/top-vendors`, `/top-products`, `/top-services`, `/payment-method` | Exists | Same filter set; top lists add `limit` 1–50; top-vendors adds `by=revenue|orders` | Report-specific DTO/list | Report APIs exist but are gated by `reports:view` with no `req.access` scope. No target CSV export route found. |
| `GET /dashboard/stats` | Exists | Bearer; `dashboard:view` | Dashboard stats DTO | Target requires all dashboard widgets/figures to respect scope; must test data queries, not only menu visibility. |

### 3.4 Current database/security/validation baseline

| Concern | Verified current state | Target gap |
|---|---|---|
| Permission scope DB | `PermissionScope { ALL, OWN }`; `RolePermission.scope @default(ALL)`; migration `20261008104219_add_permission_scope` | Enforcement, scope-aware resolver and scope tests remain. |
| Roles | Seed: `super_admin`, `admin`, `customer`, `vendor`, `marketing`, `sales` | Add `support`; migrate `vendor` → `member`; reconcile target dynamic-role policy. |
| Member table | Prisma model is `Vendor`, physical table/model relations use Vendor terminology; current status enum has onboarding states plus ACTIVE/INACTIVE/SUSPENDED | New `MemberStatus`, safe migration map, archive fields/history, compatibility aliases. |
| KYC DB | `VendorDocument` stores type, storage key, filename, MIME, size and timestamps; one row/type | Per-document status, masked number, keyed hash, review/expiry/uploader fields, reminders. |
| Financial models | `Payment` exists; current `PaymentStatus` has CREATED/PAID/FAILED/CANCELLED | No `RefundRequest`, `Payout`, idempotency record or requested refund statuses found. |
| Settings/staff/audit history | Generic `User`, `Role`, `AuditLog`, `LoginHistory`, `RefreshSession` exist | No `SystemSetting`, `MemberStatusHistory`, `MemberDocumentReminder` models found; staff-user API boundary and filters need changes. |
| IDs/pagination | UUID param schema; pagination defaults page 1/size 20, max 100 | CUID acceptance (if any new table uses it) should match actual Prisma types; preserve/confirm defaults. |
| PAN/GST | Current vendor schema uppercases PAN/GST and checks shape | GST state code 01–38 is not checked; these fields are legacy vendor fields. |
| Aadhaar | Upload endpoint allows AADHAAR file type | No number format/Verhoeff validator or masked/hash number persistence found. |
| Document upload | PDF/JPG/PNG magic-byte sniffing; max 5 MB | Existing `writeMediaFile` writes through general configured R2 bucket; private bucket and presigned GET are absent. |
| Request body strictness | Many Zod object schemas strip unknown fields | Spec-wide `.strict()` not implemented; error instead of silent strip is a behavior change for existing clients. |
| Reason/date/money validation | Some operation-specific basic limits and date query regexes exist; Prisma uses Decimal for money fields | No universal 10–500 status reason rule, ISO date ordering/366-day limit, complete sort allowlist, or refund ceiling logic. |
| Audit | Audit model and route calls exist; audit service catches/logs failures and resolves successfully | Best-effort audit can lose evidence; target asks atomic status history/audit and download/export audit. |
| HTTP hardening | OTP and public vendor-registration limiters exist; webhook raw-body capture exists | No global limiter, `helmet`, explicit `trust proxy`, JSON 100 KB limit, or listed sensitive-action limits found. |
| Environment guard | `JWT_SECRET` is required; CORS origins are parsed | No production minimum-secret/wildcard-CORS boot guard or private-storage/hash/encryption/cron settings found. |
| OpenAPI | One `src/openapi/registry.ts` builds Swagger UI at `/docs`; runtime envelope exists | No `x-required-permission`/`x-scope` metadata or router-vs-registry CI coverage check found. `/docs` is mounted without the target production restriction. |

## 4. Target API design — existing endpoints to retain/change

The rows below are the target contract from the backend spec, aligned to current route behavior. **“Change” means implementation and/or permission/scope/schema updates are required, not necessarily a path rename.**

| Target method + path | Exists? / change | Proposed request | Proposed response (`data`) | Why this endpoint / permission and scope |
|---|---|---|---|---|
| `GET /members` | Change from `GET /vendors` | Query: `status?`, `documents=incomplete?`, `reviewFlag?`, `q?`, `page?`, `pageSize?` | Paginated Member summaries; `meta.total/page/pageSize` | One canonical member directory; `members:view`; OWN member sees self only. |
| `POST /members` | Change from `POST /vendors` | JSON MemberCreate; proposed minimum `{ name, email?, phone?, businessName, ...allowlisted profile fields }`; server assigns member role (no client `roleIds`) | Created member summary, HTTP 201; welcome delivery state should be explicit | One operation creates/links User + Member and sends welcome SMS/email; `members:create`, ALL only. Exact field set needs approval. |
| `GET /members/:id` | Change from `GET /vendors/:id` | UUID `id` | Member detail with status, due date, document completion summary and safe profile fields | Standard member detail; `members:view`; OWN must be self. |
| `PATCH /members/:id` | Change from `PATCH /vendors/:id` | Strict allowlisted editable member fields only | Updated safe Member detail | Prevent role/status/owner ID mass assignment; `members:edit`; OWN self only. |
| `PATCH /members/:id/status` | Change from current status/approve/reject routes | `{ "status": "ACTIVE|INACTIVE|SUSPENDED", "reason": "10–500 chars" }` | `{ id, previousStatus, status, statusChangedAt }` | Explicit state-machine action; `members:status_change`, ALL; reject invalid transition with 409. |
| `DELETE /members/:id` | Change from `DELETE /vendors/:id` | `{ "reason": "10–500 chars" }` | `{ id, deleted: true }` or `{ id, status: "ARCHIVED" }` where business rule selects archive | Hard delete only super_admin/zero orders; otherwise archive. `members:delete`, ALL; decide response semantics. |
| `GET /members/:id/status-history` | Missing | UUID `id`, optional pagination if history can grow | Array of `{ fromStatus, toStatus, reason, actor, createdAt }` + meta if paginated | Explain status changes and satisfy auditability; `members:view`, OWN=self. |
| `GET /members/:id/activity` | Missing | UUID `id`, pagination/date filters to be confirmed | Activity timeline items (status changes, reminders, document review) | Member-detail Activity tab; `members:view`, OWN=self. Define allowed event types/data before implementation. |
| `GET /members/me`, `PATCH /members/me` | Change/alias from `/vendors/me` | `PATCH` strict profile allowlist; member profile fields only | Safe current-member profile DTO | Stable self-service alias; `profile:view/edit`, OWN. |
| `GET /members/:id/documents` | Change from `/vendors/:id/kyc-documents` | UUID `id`, optional `type`, `status` filters | List `{ type, status, numberMasked?, dueAt, expiresAt, uploadedOnBehalf? }`; never support file key | One per-document contract; `members:view`, OWN=self; support response must contain only type/status. |
| `PUT /members/:id/documents/:type` | Change from current POST KYC upload path | Multipart: `file` (PDF/JPG/PNG ≤5 MB) + document `number` (GST/PAN/Aadhaar normalization per type) | `{ id, type, status:"SUBMITTED", numberMasked, uploadedOnBehalf }` | PUT represents replace/upsert of the one-per-type document; `members:edit`, OWN=self; admin upload records actor. |
| `DELETE /members/:id/documents/:type` | Change from current DELETE | UUID/type; no body unless deletion reason is decided | `{ deleted: true }` | Only SUBMITTED/REJECTED documents can be removed; `members:edit`, OWN=self. |
| `GET /members/:id/documents/:type/download-url` | Missing | UUID/type | `{ url, expiresAt }`; link expires in 5 minutes, attachment disposition | Private document delivery without public object URLs; `members:view`; support is explicitly denied even if it can view metadata. |
| `PATCH /members/:id/documents/:type/review` | Change from `PATCH /vendors/:id/kyc-review` | `{ "decision":"APPROVED|REJECTED", "reason?":"..." }`; rejection requires reason | Updated document review DTO with masked number/reviewer/time | Review each document separately; `members:approve` or `members:reject`, ALL. |
| `POST /members/:id/documents/reminders` | Missing | Optional `{ sequence?, channels? }` only if manual resend policy approved | `{ queued/sent, reminderId }` (define async delivery semantics) | Admin-triggered reminder; `members:status_change` in draft spec. Confirm whether a dedicated notification action is preferable. |
| `POST /internal/jobs/document-reminders` | Missing | `x-cron-secret`; no public body contract beyond job parameters | `{ processed, sent, failed }` with no PII | Daily scheduler entry; timing-safe secret compare, optional IP allow-list; not bearer/RBAC and excluded from public OpenAPI. |
| `GET /branches`, `POST /branches`, `GET /branches/:id`, `PATCH /branches/:id`, `PATCH /branches/:id/status`, `DELETE /branches/:id` | Change from nested `/vendors/.../branches...` | List filters + pagination; create includes `memberId` only for ALL scope; OWN ignores supplied member ID; patch allowlisted fields; status body per branch state; delete no body | Branch DTO/list envelope; delete `{ deleted: true }` or 409 if order-referenced | Canonical resource API; `branches:view/create/edit/delete`; OWN resolves member from auth. Draft spec says delete is ALL/super-admin only. |
| `GET /deals`, `POST /deals`, `GET /deals/:id`, `PATCH /deals/:id`, `PATCH /deals/:id/status`, `DELETE /deals/:id` | Change from nested vendor/branch deal routes | Filters/page/sort; create/edit include `branchId`, no trusted client owner for OWN; status/edit allowlist | Deal DTO/list envelope | Canonical CRUD and ownership checks; `deals:*`; validate branch belongs to same member and category access. |
| `PUT /deals/:id/therapists` | Exists in nested/admin patterns only; canonical target route needs confirmation | `{ "therapistIds": ["<uuid>"] }` | `{ dealId, therapistIds }` | Enforce every therapist shares deal's branch and member; `deals:edit`, OWN. |
| `GET /therapists`, `POST /therapists`, `GET /therapists/:id`, `PATCH /therapists/:id`, `PATCH /therapists/:id/status`, `DELETE /therapists/:id` | Change from nested vendor routes | Filters/page; create/edit with `branchId`; no trusted owner ID in OWN | Therapist DTO/list envelope | Canonical resource route; `therapists:*`; branch/member cross-checks. |
| `GET /products`, `POST /products`, `GET /products/:id`, `PATCH /products/:id`, `PATCH /products/:id/status`, `DELETE /products/:id` | GET list/detail already exist; writes are nested under `/vendors` | Existing list filters/page; create/edit with category fields and member ID only for ALL | Product DTO/list envelope | Move to one consistent scope policy; `products:*`; no product soft-delete before checking order references. |
| `GET /orders`, `GET /orders/:id` | Exists | Existing filters may remain; add target report/member query rules only where needed; OWN ignores memberId/vendorId and derives identity from auth | Order list/detail; vendor-owned item filtering remains | `orders:view`, ALL or OWN according to grants; preserve multi-vendor item privacy. Foreign order returns 404 for OWN. |
| `POST /orders/:id/cancel` | Missing (current `PATCH /orders/:id/status`) | `{ "reason": "10–500 chars" }` | Updated order status DTO | Narrow endpoint only cancels; avoids general status mutation. `orders:status_change`, ALL. |
| `POST /orders/:id/refund-requests` | Missing | `{ "reason": "required", "amount?": "decimal string/number per chosen API convention" }` | RefundRequest with `REQUESTED`, amount and timestamps, HTTP 201 | Support/admin can request; server computes/checks remaining refundable balance; `orders:custom`. |
| `GET /refund-requests` | Missing | Pagination + status/date/order filters to be confirmed | Paginated request list | Operational review queue; `orders:view`, ALL in draft. |
| `POST /refund-requests/:id/approve` | Missing | `Idempotency-Key` header; optional decision note only if approved | Refund result/status, original response on replay | Initiate Razorpay refund once; `orders:approve`, ALL; transaction, preview-token denial. |
| `POST /refund-requests/:id/reject` | Missing | `{ "reason": "required" }` (exact bounds pending) | Rejected request status | Close request with traceability; `orders:approve`, ALL. |
| `GET /customers`, `GET /customers/:id` | Exists | Current list query and UUID remain | Customer DTO/list envelope | Keep routes; no DELETE. |
| `PATCH /customers/:id/status` | Exists, contract change | Target `{ "status":"active|blocked", "reason":"10–500 chars" }` | Updated customer status DTO | Add reason/audit consistency; `customers:status_change`, ALL. Resolve current `inactive` enum vs target `blocked`. |
| Existing CMS route paths | Exists across blog, FAQ, pages, about/contact, careers/social, etc. | Existing resource-specific schemas | Existing resource DTOs/envelope | Keep paths, migrate all `cms.*` gates to `content:<action>`; content delete is super-admin-only per draft. |
| `GET /payments` | Missing as staff/member listing route (payment checkout/webhook paths exist) | Pagination/date/status; OWN ignores client memberId | Paginated safe payment DTOs, no secrets | Member/staff payment ledger; `payments:view`, ALL/OWN. |
| `GET /payouts`, `GET /payouts/:id` | Missing | Pagination/period/status filters | Payout DTO/list envelope | Member payout history; `payments:view`, OWN member only. |
| `POST /payouts/:id/release` | Missing | `Idempotency-Key` header; any body only if approved | Released payout DTO; original result on replay | Money movement; super_admin-only `payments:approve`, ALL; reject preview token. Commission/cadence must be decided first. |
| `GET /reports/overview`, `/reports/online-payment-waiting`, `/reports/member-payouts`, `/reports/deals`, `/reports/therapists`, `/reports/products` | Partial: current reports endpoints are different and have no member scope | `from`, `to` ISO dates; optional memberId for ALL only; OWN ignores supplied value | Report-specific aggregates | Implement target report vocabulary; `reports:view`; enforce member scope in DB aggregation, not post-filtered response. |
| `GET /reports/:type/export?format=csv` | Missing | Date filters + format allowlist; `reports:export` | CSV download with safe headers/content type | `reports:export`, ALL in draft; audit every export and escape formula cells. |
| `GET/POST /staff-users`, `GET/PATCH /staff-users/:id` | Change from `/rbac/users*` | Staff-only role allowlist; no member/customer role assignment | Staff DTO/list envelope | Clear staff boundary; permissions `staff-users:view/create/edit`; define whether admin can create staff. |
| `PATCH /staff-users/:id/status` | Change from `/rbac/users/:id/status` | `{ status, reason? }` (reason policy to decide) | Staff status DTO | Prevent deactivating last active super_admin; `staff-users:edit`. |
| `DELETE /staff-users/:id` | Change from `/rbac/users/:id` | Optional reason per policy | Soft-deleted user DTO / success envelope | Soft only, server-enforced super_admin; `staff-users:delete`. |
| `POST /staff-users/:id/revoke-sessions`, `/reset-otp` | Change from `/rbac/users/:id/sessions/revoke-all` and `/otp/reset` | UUID; no body | `{ revoked: true }` / `{ reset: true }` | Keep behavior under staff vocabulary and audit it; `staff-users:edit`. |
| `GET /settings`, `PATCH /settings/:key` | Missing | PATCH `{ value: <validated JSON by setting key> }` | `{ key, value, updatedAt }` | `SystemSetting`; setting-specific schema/secret policy required; draft super-admin-only edit must be enforced in code. |
| `GET /logs/login-history` | Change from per-user RBAC login-history path | Pagination/date/user filter (ALL) or no user filter (OWN) | Paginated login events; redact sensitive metadata | `logs:view`; super-admin all, other roles own only. |
| `GET /logs/audit` | Change from `/rbac/audit-logs` | `actorUserId?`, `action?`, `targetType?`, `targetId?`, `from?`, `to?`, pagination | Paginated audit entries | `logs:view`; super-admin all, other roles own actions. |
| `GET /me`, `PATCH /me` | Change/alias from `/rbac/users/me` | PATCH allowlist: `name`, `phone`, `email`, `avatar`; never `roles`, `status` | Current-user safe profile DTO | Stable profile API; `profile:view/edit`, OWN. Avatar storage/validation must be specified. |

### Why use these target paths?

- The proposed paths are resource-oriented: `/members`, `/branches`, `/refund-requests`, `/staff-users`. That makes the public API describe the business entity instead of exposing the old Vendor/RBAC implementation names.
- `PATCH /.../:id/status` separates a lifecycle transition from general profile editing. A dedicated `POST /orders/:id/cancel` is narrower than accepting every order status at one write endpoint.
- `PUT /members/:id/documents/:type` fits the one-document-per-type upsert/replace rule. A download URL is a separate read action because private file access has shorter lifetime and stricter access than document metadata.
- `/me` provides a stable authenticated-self endpoint; the server derives the user/member identity from the token, not from caller-supplied IDs.
- `/internal/jobs/...` stays outside the public API/RBAC surface because the caller is the scheduler, authenticated with a high-entropy cron secret.
- Keep old routes as deprecated aliases for the agreed one-release window. Add usage telemetry and a dated removal decision before deleting `/vendors/*`, `/rbac/users*`, or changing CMS paths.

## 5. Database design delta for  review

| Database area | Exists now | Target schema/data work | Migration caution / validation |
|---|---|---|---|
| `RolePermission.scope` | Exists: enum + column + migration, default `ALL` | No schema migration for the column; backfill/adjust individual grants to intended OWN/ALL matrix | Verify all old grants defaulting ALL do not accidentally broaden member access before enabling scope checks. |
| Role rows | Six roles incl. `vendor`; support absent | Rename key to `member`, add support; adjust seed roles/grants | Preserve `UserRole` links and custom role assignments; ensure seed twice is idempotent. |
| Permission/menu rows | Legacy `vendors*`, `vendor-portal.*`, `cms.*`; permission migration helper exists for shared-key splits | Canonicalize keys to members/branches/deals/therapists/products/orders/customers/content/payments/reports/staff-users/settings/logs/profile; add menu nodes | Map old grants before retiring old permission rows. Audit all frontend `can()` checks and backend `requirePermission()` callsites. |
| Vendor/member | `Vendor` model, physical Vendor table, owner relation, old statuses and profile fields | API/domain rename gradually while keeping physical table mapping; new lifecycle timestamps/reason/archive/welcome fields; retire KYC-level fields after migration | Status mapping is destructive/business-sensitive: old `REJECTED` → SUSPENDED recommendation needs owner approval. Verify counts and samples before/after. |
| Documents | `VendorDocument` with storage metadata, unique vendor/type | `MemberDocument`/equivalent adds state, masked number, HMAC number hash, reviewer/uploader, expiry, on-behalf; private object bucket | Do not copy plain Aadhaar/PAN into a new column or migration logs. Legacy fields may contain real sensitive values: assess migration/retention/legal rules before dropping. |
| Status/audit | `AuditLog`, `LoginHistory`, `RefreshSession` exist | Add member status history; audit and status history should commit with status change | Existing audit helper is best-effort; decide whether mutation rolls back when mandatory audit persistence fails. |
| Reminders/notifications | General notifications exist; no reminder-history model found | Reminder delivery state/sequence/channel/provider ref; new notification types | Design retries and unique keys so a scheduled/manual run cannot send the same sequence/channel twice unintentionally. |
| Refunds/payments | Payment exists; statuses CREATED/PAID/FAILED/CANCELLED | RefundRequest, refunded/partially-refunded status representation, provider ref, decision data, idempotency record | Partial refunds and concurrent requests require DB-level serialization/constraints; don't rely only on checking in JS. |
| Payouts | No Payout model found | Payout period/member/Decimal totals/status/release refs; uniqueness per member-period | Do not generate or release payouts until commission formula, included order/payment states, rounding and cadence are approved. |
| Settings/staff | User/Role models exist; no SystemSetting found | SystemSetting + validated key/value model; staff role allowlist and status rules | Avoid storing secrets as plain JSON; define secret masking, access, audit, and last-super-admin constraint. |
| Soft deletes | User already has `deletedAt`; target asks `deletedAt` on Branch/Deal/Therapist/Product | Add fields and filter all admin/catalog/order-related paths | Define how existing order snapshots/reference relations behave; verify catalog/list queries consistently exclude deleted records. |
| Indexes | Existing base indexes; `AuditLog` and `LoginHistory` currently index user IDs but not all requested composite patterns | Add status/expiry, actor/date, target, order/member item query indexes as needed | Use EXPLAIN or realistic query tests; don't add indexes without checking migration/runtime cost. |

### Database migration rehearsal requirements

1. Snapshot/restore a non-production copy before changing data.
2. Record counts of Users, Vendors, VendorDocuments, Roles, UserRoles, Permissions, RolePermissions, Orders, OrderItems, RefreshSessions before migration.
3. Test role key conversion and ensure no dangling role assignment or duplicate key.
4. Test every old VendorStatus mapping, especially REJECTED and PROFILE_INCOMPLETE/PENDING_VERIFICATION.
5. Confirm existing document rows map to a status without inventing approval (recommended initial status should be explicitly decided).
6. Confirm old KYC number fields/storage files are handled under an approved privacy/retention policy; do not include full values in migration logs or test output.
7. Verify rollback behavior on a disposable DB and ensure it does not re-expose full PII or restore unsafe grants.
8. Validate schema/client generation and the seed twice before any staging rehearsal.

## 6. Validation matrix — what is present vs missing

| Validation rule | Existing? | Required implementation / evidence |
|---|---|---|
| UUID IDs | Yes for common `:id` path and some query IDs | Add correct UUID/CUID acceptance to each new route based on its Prisma field; reject malformed values before service/DB call. |
| Pagination | Yes: `page >= 1`, `pageSize` 1–100, defaults 1/20 | Reuse common schema for all new lists; include `meta.total/page/pageSize`. |
| Zod body validation | Yes across many routes | Change target schemas to `.strict()`; audit current clients first because current default behavior strips unknown properties. |
| Indian phone normalization | Partial yes on vendor business/contact schema | Apply one documented normalization policy to member create/update; normalize before regex and before uniqueness check. |
| Email | Partial yes (`z.string().email()` used in existing fields) | Add max 254 and lowercase canonicalization before persist/duplicate checks. |
| PAN shape/case | Partial yes: uppercase + regex on legacy PAN field | Move to document-number input; verify masking/hash behavior and never return/log full PAN. |
| GST shape | Partial yes: uppercase + regex | Add state code 01–38 check and confirm regex/check-digit policy. |
| Aadhaar number | No (file upload only) | 12 digits, first digit 2–9, Verhoeff checksum; immediately derive masked value and keyed hash; never persist full number. Legal approval first. |
| IFSC / UPI | Not verified to target regex; vendor schema currently has length caps | Add uppercase/normalization and exact IFSC/UPI validation; confirm UPI grammar with provider/business. |
| Status reason | Partial: required under some current status changes, but max 1000 and no minimum 10 | Target trim and 10–500 bounds; validate reason requirement per transition and enforce transition matrix in service/transaction. |
| Document file | Mostly yes: PDF/JPG/PNG magic bytes and max 5 MB | Add exactly-one-file enforcement, private bucket, no public URL/key, support redaction, download authorization, and expiry behavior. |
| Sorting | Not shown in target current query schemas | Add enum allowlists; never turn client sort string directly into Prisma `orderBy`. |
| Date range | Partial: report date-only regex and order query ISO datetime schema | Validate actual calendar dates, `from <= to`, max 366 days, UTC inclusivity, and consistent names (`from/to` vs current `dateFrom/dateTo`). |
| Money | Prisma Decimal for money columns | Accept a defined decimal string/number contract; reject negatives/too many decimal places; avoid JS float math for refunds/payouts. |
| Refund maximum | No refunds exist | In transaction compute paid minus already-refunded; guard against duplicate/concurrent approval and idempotency replay. |
| Relationship ownership | Some vendor service checks exist | Validate branch/member, therapist/branch/member, deal/therapist assignment, category access on every create and update. |
| OWN scope / IDOR | Partial vendor and order filters; products force-scope certain reads for a vendor-linked user | Central scope-aware auth context; ignore caller memberId in OWN; tests for list/detail/update/delete/export/report and nested relations; foreign IDs return 404. |
| CSV formula injection | No CSV export endpoint found | Prefix/sanitize cells beginning `=`, `+`, `-`, `@`; test every dangerous prefix and quoted/leading whitespace cases after final policy. |

## 7. Request/response examples for new or changed contracts

Examples follow the current response envelope. They are intentionally illustrative: exact `MemberCreate`/profile/resource properties need a reviewed schema before implementation.

### Member status transition

```http
PATCH /api/v1/members/9da.../status
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "status": "SUSPENDED",
  "reason": "Documents remain incomplete after the final reminder."
}
```

Target success:

```json
{
  "data": {
    "id": "9da...",
    "previousStatus": "ACTIVE",
    "status": "SUSPENDED",
    "statusChangedAt": "2026-10-13T10:00:00.000Z"
  },
  "error": null
}
```

An unsupported transition should return HTTP 409. The same transaction should update status, insert history/audit record, and revoke all owner refresh sessions for suspension.

### Document upload and review

`PUT /api/v1/members/:id/documents/:type` uses `multipart/form-data`: exactly one `file` part plus a `number` text field for applicable document types. Never put the raw number in a URL.

```json
{
  "data": {
    "id": "doc-uuid",
    "type": "PAN",
    "status": "SUBMITTED",
    "numberMasked": "ABXXXXX34F",
    "uploadedOnBehalf": false
  },
  "error": null
}
```

`PATCH /api/v1/members/:id/documents/:type/review` body:

```json
{ "decision": "REJECTED", "reason": "Image is unreadable; upload a clearer scan." }
```

For `GET /members/:id/documents/:type/download-url`, return a short-lived URL only to an authorized non-support caller; never include `storageKey` in ordinary list/detail responses.

### Refund request and idempotent decision

```http
POST /api/v1/orders/order-uuid/refund-requests
Content-Type: application/json
```

```json
{ "reason": "Duplicate purchase", "amount": "250.00" }
```

Proposed response `201`: `data` contains a refund request ID, order ID, requested amount, `REQUESTED` status, and created timestamp. Do not return a success-shaped fallback if the gateway/database outcome is unknown.

```http
POST /api/v1/refund-requests/refund-uuid/approve
Idempotency-Key: refund-request-client-generated-key
```

Repeated requests with the same key must return the original result and must not issue a second provider refund.

## 8. Questions  before implementation

Please get explicit answers or record “defer” for each:

1. **Scope of delivery:** Is this handoff only for `msd-api`, as the technical spec says, or are frontend/shared-package changes also in this sprint? Confirm `mera-driver-api` remains untouched.
2. **Dynamic roles vs locked role APIs:** Should Super Admin be able to create custom roles (current project-wide architecture), or should role create/clone/delete return `ROLE_MANAGEMENT_LOCKED` (business role doc / draft API spec)?
3. **Customer role:** Confirm `customer` remains one of the seven system roles but receives no admin-console grants, as the source role document says; the permission matrix omits it because it is storefront-only.
4. **Old statuses:** Confirm migration of `REJECTED` to `SUSPENDED`, and mapping of `PROFILE_INCOMPLETE`, `PENDING_VERIFICATION`, and `APPROVED` to ACTIVE. What happens to currently pending/rejected vendor records operationally?
5. **Document approval:** Existing uploaded files have no per-document approved state. Should migrated rows be SUBMITTED, and does upload automatically reset prior APPROVED/REJECTED state?
6. **Deal approval:** Keep current `approvalStatus=APPROVED` catalog gate, or remove it so members can publish directly? This changes public storefront behavior and must be approved before implementation.
7. **Member delete/archive:** Which order relationship counts as “has orders”: any OrderItem, any Order including cancelled/unpaid, or paid/fulfilled only? What should API response be if DELETE archives instead of deleting?
8. **Support permissions:** Support is described as view-only but may raise refund requests. Can support see all order/member fields? Confirm whether support can read customer PII, only metadata, or a redacted DTO.
9. **Refund policy:** Are partial refunds allowed? Which payment statuses/amounts are refundable? Is refund request by a support agent always against a customer order? Who may approve/reject, and what decision reason is mandatory?
10. **Payout rules:** Define commission rate/source, tax/fee treatment, rounding, period cadence, eligible order/payment statuses, reversals/refunds after payout, and whether payouts are generated manually or on schedule.
11. **Documents/privacy:** Legal approval for Aadhaar/PAN collection, retention period, deletion policy, encryption/hash-key rotation and incident recovery; confirm GST full-number retention requirements.
12. **Reminder policy:** Confirm due date (creation + 14 days), warning cadence (weekly, 3 times), final review flag day 35, channels/fallback when only one contact exists, retry rules, timezone and duplicate-send policy.
13. **Endpoint compatibility:** Keep old `/vendors/*` and `/rbac/users*` aliases for one release? What is the measurable deprecation log and removal date? Should current API `/reports/*` routes remain as compatibility aliases?
14. **Strict body rollout:** Is `.strict()` mandatory immediately for all existing endpoints, or can new/changed endpoints become strict first to avoid breaking existing frontend clients?
15. **Profile avatar:** Is avatar a URL, existing media upload, or a new upload endpoint? Who owns the image and what MIME/size/visibility rules apply?
16. **System settings:** What setting keys are allowed, which values are secret, and what should GET return for secret settings? Avoid generic arbitrary JSON updates without a key-specific schema.
17. **Audit failure behavior:** Should a business mutation roll back/fail when AuditLog cannot be written? Current helper deliberately swallows audit persistence failures; the target asks for transactional audit.
18. **Environment/security ops:** Confirm Railway proxy hop count, global/per-route rate thresholds, cron IP allow-list, production `/docs` policy, and provider webhook event-id retention.
19. **Migration rehearsal:** Who provides the approved restorable database copy and who signs off row-count/data mapping before staging/prod?
20. **Current `PermissionScope` migration:** Confirm the existing `20261008104219_add_permission_scope` migration is present in the target DB migration history; schema code being present alone does not prove every environment has applied it.

## 9. Suggested delivery sequence and acceptance checkpoints

| Phase | Deliverable | Minimum “ready for next phase” evidence |
|---|---|---|
| 0. Confirm decisions |  answers above; data/privacy owners identified | Decisions recorded in this file or the source spec; migration copy available. |
| 1. RBAC/scope | Role/menu key mapping, grants, scope-aware resolver, bootstrap scopes, server restrictions | Seed twice; role/action/scope matrix tests; ALL-vs-OWN multi-role test; existing role API contract tests. |
| 2. Lifecycle | Member route aliases, status machine/history, suspend session revoke, read-only behavior | Every allowed/blocked transition test; foreign member ID returns 404; rollback test verifies status/history/session behavior. |
| 3. Resource own-scope | Branch/deal/therapist/product/order/reports/dashboard/logs | Table-driven role × resource × action × own/other; nested cross-member reference tests. |
| 4. Documents | Per-document model, number validation/masking/hash, private R2, signed links, reminders | Byte/MIME/size tests, support redaction, no full PII in DB/logs/DTOs, signed URL expiry, duplicate hash conflict. |
| 5. Refund/payout | Models, endpoints, provider integration, idempotency | Concurrent duplicate approval/release tests; Decimal/remainder calculation tests; documented commission policy. |
| 6. Staff/settings/logs/profile | Route and access boundary changes | Role allowlist, last-super-admin protection, secret setting masking, audit and profile allowlist tests. |
| 7. API contract/security | OpenAPI schemas/extensions, route coverage, runtime hardening | Route registry check, production `/docs` check, 413/429/header checks, webhook/cron verification tests. |
| 8. Release rehearsal | Migrations, seed, regression/manual checks | Prisma validate/generate, targeted `msd-api` tests/lint/build, copy DB rehearsal, role-by-role manual verification, storefront smoke test. |

## 10. Repository evidence checked

- Backend target and business rules: [`ADMIN_RBAC_BACKEND_SPEC.md`](./ADMIN_RBAC_BACKEND_SPEC.md), [`ADMIN_USER_ROLES_AND_PERMISSIONS.md`](./ADMIN_USER_ROLES_AND_PERMISSIONS.md), [`ADMIN_RBAC_TASKS.md`](./ADMIN_RBAC_TASKS.md).
- Current schema and seed: `apps/msd-api/prisma/schema.prisma`, `apps/msd-api/prisma/seed.ts`, and the existing `20261008104219_add_permission_scope` migration.
- Current routes/services: `apps/msd-api/src/routes/{rbac,vendors,products,orders,customers,reports,payment,dashboard}.routes.ts` and associated services/schemas.
- Current authorization/runtime: `apps/msd-api/src/middleware/{authenticate,requirePermission,validate,rateLimiter}.ts`, `apps/msd-api/src/services/{permission-resolver,bootstrap,role,order,reports,vendor,vendor-document,audit,payment}.service.ts`, `apps/msd-api/src/app.ts`, `apps/msd-api/src/config/env.ts`.
- Current shared contracts/menu: `packages/shared-types/src/index.ts`, `packages/shared-menu/src/msd-menu.json`.

**Validation performed for this draft:** source/schema/route inspection only. No application code, schema, migration, or test files were changed; no database migration or test suite was run.
