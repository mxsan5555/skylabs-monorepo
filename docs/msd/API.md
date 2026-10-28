# msd API

`apps/msd-api`, Express + Zod + `zod-to-openapi`. Base URL `/api/v1` (local
`http://localhost:3333/api/v1`), interactive docs at `/docs`.

> **Generated tables.** The endpoint tables were generated on 2026-10-17 by loading the real
> Express app in-process and walking its router stack, so every mounted route is listed with the
> permission its `requirePermission(menuKey, action)` call asks for. "signed in" means the route
> needs a valid token and checks ownership or access in its own handler (for example `/orders/me`,
> cart, wishlist, or `requireOrdersOrVendorSelf` on staff order routes). Regenerate after route
> changes; the router code stays the authority.

## 0. Conventions

- **Envelope:** success `{ data, error: null, meta? }`; error `{ data: null, error: { code, message, details? } }`.
  Lists return `meta: { total, page, pageSize }`.
- **Error codes** (`lib/http.ts`): `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403,
  `MEMBER_SUSPENDED` 403, `MEMBER_INACTIVE_READ_ONLY` 403, `NOT_FOUND` 404, `CONFLICT` 409,
  `MEMBER_NOT_SUSPENDED` 409, `DOCUMENT_NUMBER_IN_USE` 409, `PAYLOAD_TOO_LARGE` 413 (JSON body
  over 100 kb), `VALIDATION_ERROR` 422 (field errors in
  `details.fields`), `RATE_LIMITED` 429, `SERVER_ERROR` 500, `SERVICE_UNAVAILABLE` 503. A 500 never
  leaks internals.
- **Auth:** `Authorization: Bearer <access token>` (15 min); `POST /auth/refresh` rotates the
  30-day refresh token. Every protected route re-checks the permission on the server. Tokens are
  HS256 only.
- **Ids:** route ids are UUIDs; a malformed id is 422, never a database error.
- **Own records:** a foreign record returns 404, not 403. A caller-supplied member id is ignored
  under own scope (planned with P2-02).
- **Paging:** `page >= 1`, `pageSize` 1 to 100, default 20. Sort fields come from a per-resource
  allowlist.
- **Rate limits:** OTP request and the public member registration endpoint, per identifier and
  IP, `OTP_REQUEST_RATE_LIMIT_PER_10_MIN` per 10 minutes (default 5, `middleware/rateLimiter.ts`);
  OTP request also per identifier alone, `OTP_IDENTIFIER_RATE_LIMIT_PER_HOUR` per hour (default 10).
  Global and per-action limiters are planned (P2-08).
- **Schemas:** `<Entity><Action>Schema` (for example `MemberCreateSchema`,
  `MemberListQuerySchema`); new and changed bodies are `.strict()` (R3).
- **Money:** decimal strings with 2 places (`"1299.00"`), INR.
- **Dates:** ISO 8601 UTC; ranges `from <= to`, at most 366 days.

### 0.1 Field validation

| Field | Rule |
|---|---|
| ids | UUID |
| phone | normalised, `^\+91[6-9]\d{9}$` |
| email | RFC, max 254, lowercase |
| pincode | `^\d{6}$` |
| PAN | `^[A-Z]{5}\d{4}[A-Z]$` |
| GST | `^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[A-Z\d]$`, state code 01 to 38 |
| Aadhaar | 12 digits, first 2 to 9, Verhoeff check |
| IFSC | `^[A-Z]{4}0[A-Z0-9]{6}$` (planned; today length only) |
| UPI | `^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$` (planned) |
| status or decision reason | trimmed, 10 to 500 characters |
| document file | one PDF, JPG or PNG, 5 MB, magic bytes checked |
| prices | decimal string, 2 places, `originalPrice >= sellingPrice` |
| rich text | HTML allowlist `p br strong em u s h2 h3 ul ol li blockquote a[href,rel,target]`; links `https:`, `http:`, `mailto:`, `tel:` only; no `img`, style, class, script, iframe or event attributes; length measured on the plain text (planned, C-15) |

Business checks return 409 or 422: status transitions, delete when referenced, therapist and deal
on the same branch, duplicate document number, last active Super Admin.

### 0.2 OpenAPI coverage (2026-10-17)

347 mounted routes, 255 in the OpenAPI document, 92 not documented: `vendors` 47,
`popular-treatments` 13, `promotions` 10, `home-hero` 8, `catalog` 3, `customer` 3, `wishlist` 2,
`members` 1, `auth` 1, `rbac` 1, `customers` 1, `health` 1, `internal` 1 (hidden on purpose).
Closing the gap and a CI coverage check are P9-05 and P9-06.

## 1. Admin and staff

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/auth/google` | public |
| GET | `/api/v1/auth/google/callback` | public |
| GET | `/api/v1/auth/google/failure` | public |
| POST | `/api/v1/auth/logout` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/auth/logout-all` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/auth/otp/request` | public |
| POST | `/api/v1/auth/otp/verify` | public |
| POST | `/api/v1/auth/refresh` | public |
| GET | `/api/v1/dashboard/stats` | `dashboard:view` |
| GET | `/api/v1/health` | public |
| GET | `/api/v1/notifications` | signed in (own records, or checked in the handler) |
| PATCH | `/api/v1/notifications/:id/read` | signed in (own records, or checked in the handler) |
| PATCH | `/api/v1/notifications/read-all` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/rbac/audit-logs` | `rbac.audit-logs:view` |
| GET | `/api/v1/rbac/bootstrap` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/rbac/dashboard-widgets` | `rbac.roles:view` |
| POST | `/api/v1/rbac/dashboard-widgets` | `rbac.roles:create` |
| POST | `/api/v1/rbac/impersonate` | `rbac.users:custom` |
| GET | `/api/v1/rbac/permissions/catalog` | `rbac.roles:view` |
| GET | `/api/v1/rbac/roles` | `rbac.roles:view` |
| POST | `/api/v1/rbac/roles` | `rbac.roles:create` |
| PATCH | `/api/v1/rbac/roles/:id` | `rbac.roles:edit` |
| DELETE | `/api/v1/rbac/roles/:id` | `rbac.roles:delete` |
| POST | `/api/v1/rbac/roles/:id/clone` | `rbac.roles:create` |
| GET | `/api/v1/rbac/roles/:id/permissions` | `rbac.roles:view` |
| PUT | `/api/v1/rbac/roles/:id/permissions` | `rbac.roles:edit` |
| PATCH | `/api/v1/rbac/roles/:id/status` | `rbac.roles:status_change` |
| GET | `/api/v1/rbac/roles/:id/widgets` | `rbac.roles:view` |
| PUT | `/api/v1/rbac/roles/:id/widgets` | `rbac.roles:edit` |
| GET | `/api/v1/rbac/users` | `rbac.users:view` |
| POST | `/api/v1/rbac/users` | `rbac.users:create` |
| PATCH | `/api/v1/rbac/users/:id` | `rbac.users:edit` |
| DELETE | `/api/v1/rbac/users/:id` | `rbac.users:delete` |
| GET | `/api/v1/rbac/users/:id/login-history` | `rbac.users:view` |
| POST | `/api/v1/rbac/users/:id/otp/reset` | `rbac.users:edit` |
| POST | `/api/v1/rbac/users/:id/roles/:roleId` | `rbac.users:assign` |
| DELETE | `/api/v1/rbac/users/:id/roles/:roleId` | `rbac.users:assign` |
| GET | `/api/v1/rbac/users/:id/sessions` | `rbac.users:view` |
| POST | `/api/v1/rbac/users/:id/sessions/revoke-all` | `rbac.users:edit` |
| PATCH | `/api/v1/rbac/users/:id/status` | `rbac.users:status_change` |
| GET | `/api/v1/rbac/users/me` | signed in (own records, or checked in the handler) |
| PATCH | `/api/v1/rbac/users/me` | signed in (own records, or checked in the handler) |

Done since 2026-10-23 (not yet reflected in the generated table above, which is otherwise
unchanged — no route path added, removed or moved):

- `GET /rbac/bootstrap` now returns `scopes` (`Record<permissionKey, 'ALL'|'OWN'>`,
  highest-scope-wins across the caller's roles).
- `POST /rbac/roles` and `POST /rbac/roles/:id/clone` now return 403 `ROLE_MANAGEMENT_LOCKED`
  unconditionally (PLANNING.md §1.1/R1) — `DELETE /rbac/roles/:id` already returned 403
  `FORBIDDEN` for every system role, which today is every role (custom roles can't be created).
- `PUT /rbac/roles/:id/permissions` returns 422 `VALIDATION_ERROR` if any entry requests
  `scope: "OWN"` for a permission key outside `role.service.ts#SCOPE_ENFORCED_PERMISSION_KEYS`
  (today: only `rbac.audit-logs:view`) — saving `OWN` for an unsupported key would otherwise look
  restricted in the Role Permission Matrix UI while silently still behaving like `ALL`.
- `GET /rbac/audit-logs` filters to the caller's own `actorUserId` when their resolved scope for
  `rbac.audit-logs:view` is `OWN` (Super Admin keeps `ALL` via its existing bypass) —
  PLANNING.md §1.2's Logs row (`V A` Super Admin, `V O` everyone else).

Still planned: grant edits refuse super-admin-only actions (`ROLE_GRANT_FORBIDDEN`);
`/staff-users*` replaces `/rbac/users*` with a role allowlist and last-Super-Admin guard;
`GET /settings`, `PATCH /settings/:key`; `GET /logs/login-history`, `GET /logs/audit`;
`GET`/`PATCH /me` (P8).

## 2. Members

| Method | Path | Guard |
|---|---|---|
| POST | `/api/v1/internal/jobs/document-reminders` | `x-cron-secret` |
| GET | `/api/v1/inventory` | `inventory:view` |
| GET | `/api/v1/members` | `members:view` |
| POST | `/api/v1/members` | `members:create` |
| GET | `/api/v1/members/:id` | `members:view` |
| PATCH | `/api/v1/members/:id` | `members:edit` |
| DELETE | `/api/v1/members/:id` | `members:delete` |
| GET | `/api/v1/members/:id/activity` | `members:view` |
| GET | `/api/v1/members/:id/documents` | `members:view` |
| POST | `/api/v1/members/:id/documents/:documentType` | `members:edit` |
| DELETE | `/api/v1/members/:id/documents/:documentType` | `members:edit` |
| PATCH | `/api/v1/members/:id/documents/:documentType/review` | `members:approve|reject` |
| POST | `/api/v1/members/:id/documents/reminders` | `members:status_change` |
| PATCH | `/api/v1/members/:id/status` | `members:status_change` |
| GET | `/api/v1/members/:id/status-history` | `members:view` |
| GET | `/api/v1/products` | `products:view` |
| GET | `/api/v1/products/:id` | `products:view` |
| GET | `/api/v1/vendors` | `members:view` |
| POST | `/api/v1/vendors` | `members:create` |
| GET | `/api/v1/vendors/:id` | `members:view` |
| PATCH | `/api/v1/vendors/:id` | `members:edit` |
| DELETE | `/api/v1/vendors/:id` | `members:delete` |
| GET | `/api/v1/vendors/:id/activity` | `members:view` |
| GET | `/api/v1/vendors/:id/documents` | `members:view` |
| POST | `/api/v1/vendors/:id/documents/:documentType` | `members:edit` |
| DELETE | `/api/v1/vendors/:id/documents/:documentType` | `members:edit` |
| PATCH | `/api/v1/vendors/:id/documents/:documentType/review` | `members:approve|reject` |
| POST | `/api/v1/vendors/:id/documents/reminders` | `members:status_change` |
| POST | `/api/v1/vendors/:id/images` | `members:edit` |
| DELETE | `/api/v1/vendors/:id/images/:imageId` | `members:edit` |
| PATCH | `/api/v1/vendors/:id/images/:imageId/primary` | `members:edit` |
| PATCH | `/api/v1/vendors/:id/images/reorder` | `members:edit` |
| GET | `/api/v1/vendors/:id/kyc-documents` | `members:view` |
| POST | `/api/v1/vendors/:id/kyc-documents/:documentType` | `members:edit` |
| DELETE | `/api/v1/vendors/:id/kyc-documents/:documentType` | `members:edit` |
| PATCH | `/api/v1/vendors/:id/status` | `members:status_change` |
| GET | `/api/v1/vendors/:id/status-history` | `members:view` |
| POST | `/api/v1/vendors/:id/video` | `members:edit` |
| DELETE | `/api/v1/vendors/:id/video` | `members:edit` |
| GET | `/api/v1/vendors/:vendorId/branches` | `vendors.branches:view` |
| POST | `/api/v1/vendors/:vendorId/branches` | `vendors.branches:create` |
| PATCH | `/api/v1/vendors/:vendorId/branches/:branchId` | `vendors.branches:edit` |
| GET | `/api/v1/vendors/:vendorId/branches/:branchId/deals` | `vendors.deals:view` |
| POST | `/api/v1/vendors/:vendorId/branches/:branchId/deals` | `vendors.deals:create` |
| GET | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId` | `vendors.deals:view` |
| PATCH | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId` | `vendors.deals:edit` |
| DELETE | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId` | `vendors.deals:delete` + Super Admin |
| POST | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId/copy` | `vendors.deals:create` |
| POST, PATCH, DELETE | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId/packages[/reorder, /:packageId]` | `vendors.deals:edit` |
| POST, PATCH, DELETE | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId/images[/reorder, /:imageId, /:imageId/primary]`, `/video` | `vendors.deals:edit` |
| PATCH | `/api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId/status` | `vendors.deals:status_change` |
| PATCH | `/api/v1/vendors/:vendorId/branches/:branchId/status` | `vendors.branches:status_change` |
| POST | `/api/v1/vendors/:vendorId/branches/:branchId/therapists` | `vendors.therapists:create` |
| GET | `/api/v1/vendors/:vendorId/customers` | `members:view` |
| GET | `/api/v1/vendors/:vendorId/deals` | `vendors.deals:view` |
| GET | `/api/v1/vendors/:vendorId/products` | `vendors.products:view` |
| POST | `/api/v1/vendors/:vendorId/products` | `vendors.products:create` |
| PATCH | `/api/v1/vendors/:vendorId/products/:productId` | `vendors.products:edit` |
| DELETE | `/api/v1/vendors/:vendorId/products/:productId` | `vendors.products:delete` |
| POST | `/api/v1/vendors/:vendorId/products/:productId/images` | `vendors.products:edit` |
| DELETE | `/api/v1/vendors/:vendorId/products/:productId/images/:imageId` | `vendors.products:edit` |
| PATCH | `/api/v1/vendors/:vendorId/products/:productId/images/:imageId/primary` | `vendors.products:edit` |
| PATCH | `/api/v1/vendors/:vendorId/products/:productId/images/reorder` | `vendors.products:edit` |
| PATCH | `/api/v1/vendors/:vendorId/products/:productId/status` | `vendors.products:edit` |
| POST | `/api/v1/vendors/:vendorId/products/:productId/video` | `vendors.products:edit` |
| DELETE | `/api/v1/vendors/:vendorId/products/:productId/video` | `vendors.products:edit` |
| GET | `/api/v1/vendors/:vendorId/therapists` | `vendors.therapists:view` |
| PATCH | `/api/v1/vendors/:vendorId/therapists/:therapistId` | `vendors.therapists:edit` |
| DELETE | `/api/v1/vendors/:vendorId/therapists/:therapistId` | `vendors.therapists:delete` |
| POST | `/api/v1/vendors/:vendorId/therapists/:therapistId/images` | `vendors.therapists:edit` |
| DELETE | `/api/v1/vendors/:vendorId/therapists/:therapistId/images/:imageId` | `vendors.therapists:edit` |
| PATCH | `/api/v1/vendors/:vendorId/therapists/:therapistId/images/:imageId/primary` | `vendors.therapists:edit` |
| PATCH | `/api/v1/vendors/:vendorId/therapists/:therapistId/images/reorder` | `vendors.therapists:edit` |
| PATCH | `/api/v1/vendors/:vendorId/therapists/:therapistId/status` | `vendors.therapists:status_change` |
| POST | `/api/v1/vendors/:vendorId/therapists/:therapistId/video` | `vendors.therapists:edit` |
| DELETE | `/api/v1/vendors/:vendorId/therapists/:therapistId/video` | `vendors.therapists:edit` |
| GET | `/api/v1/vendors/branches` | `vendors.branches:view` |
| GET | `/api/v1/vendors/categories` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/vendors/deals` | `vendors.deals:view` |
| GET | `/api/v1/vendors/me` | `members:custom` |
| PATCH | `/api/v1/vendors/me` | `members:custom` |
| GET | `/api/v1/vendors/me/branches` | `members:custom` |
| POST | `/api/v1/vendors/me/branches` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId` | `members:custom` |
| GET | `/api/v1/vendors/me/deals` | `members:custom` |
| GET | `/api/v1/vendors/me/branches/:branchId/deals` | `members:custom` |
| GET | `/api/v1/vendors/me/branches/:branchId/deals/:dealId` | `members:custom` |
| POST | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/copy` | `members:custom` |
| POST, PATCH, DELETE | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/packages[/reorder, /:packageId]` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/images/:imageId` (alt text) | `members:custom` |
| POST | `/api/v1/vendors/me/branches/:branchId/deals` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId/deals/:dealId` | `members:custom` |
| POST | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/images` | `members:custom` |
| DELETE | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/images/:imageId` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/images/:imageId/primary` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/images/reorder` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/status` | `members:custom` |
| POST | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/video` | `members:custom` |
| DELETE | `/api/v1/vendors/me/branches/:branchId/deals/:dealId/video` | `members:custom` |
| PATCH | `/api/v1/vendors/me/branches/:branchId/status` | `members:custom` |
| GET | `/api/v1/vendors/me/branches/:branchId/therapists` | `members:custom` |
| POST | `/api/v1/vendors/me/branches/:branchId/therapists` | `members:custom` |
| GET | `/api/v1/vendors/me/customers` | `members:custom` |
| POST | `/api/v1/vendors/me/images` | `members:custom` |
| DELETE | `/api/v1/vendors/me/images/:imageId` | `members:custom` |
| PATCH | `/api/v1/vendors/me/images/:imageId/primary` | `members:custom` |
| PATCH | `/api/v1/vendors/me/images/reorder` | `members:custom` |
| GET | `/api/v1/vendors/me/kyc-documents` | `members:custom` |
| POST | `/api/v1/vendors/me/kyc-documents/:documentType` | `members:custom` |
| DELETE | `/api/v1/vendors/me/kyc-documents/:documentType` | `members:custom` |
| GET | `/api/v1/vendors/me/products` | `members:custom` |
| POST | `/api/v1/vendors/me/products` | `members:custom` |
| PATCH | `/api/v1/vendors/me/products/:productId` | `members:custom` |
| DELETE | `/api/v1/vendors/me/products/:productId` | `members:custom` |
| POST | `/api/v1/vendors/me/products/:productId/images` | `members:custom` |
| DELETE | `/api/v1/vendors/me/products/:productId/images/:imageId` | `members:custom` |
| PATCH | `/api/v1/vendors/me/products/:productId/images/:imageId/primary` | `members:custom` |
| PATCH | `/api/v1/vendors/me/products/:productId/images/reorder` | `members:custom` |
| PATCH | `/api/v1/vendors/me/products/:productId/status` | `members:custom` |
| POST | `/api/v1/vendors/me/products/:productId/video` | `members:custom` |
| DELETE | `/api/v1/vendors/me/products/:productId/video` | `members:custom` |
| PATCH | `/api/v1/vendors/me/therapists/:therapistId` | `members:custom` |
| POST | `/api/v1/vendors/me/therapists/:therapistId/images` | `members:custom` |
| DELETE | `/api/v1/vendors/me/therapists/:therapistId/images/:imageId` | `members:custom` |
| PATCH | `/api/v1/vendors/me/therapists/:therapistId/images/:imageId/primary` | `members:custom` |
| PATCH | `/api/v1/vendors/me/therapists/:therapistId/images/reorder` | `members:custom` |
| GET | `/api/v1/vendors/me/therapists/:therapistId/packages` | `members:custom` |
| POST | `/api/v1/vendors/me/therapists/:therapistId/packages` | `members:custom` |
| PATCH | `/api/v1/vendors/me/therapists/:therapistId/packages/:packageId` | `members:custom` |
| DELETE | `/api/v1/vendors/me/therapists/:therapistId/packages/:packageId` | `members:custom` |
| PATCH | `/api/v1/vendors/me/therapists/:therapistId/status` | `members:custom` |
| POST | `/api/v1/vendors/me/therapists/:therapistId/video` | `members:custom` |
| DELETE | `/api/v1/vendors/me/therapists/:therapistId/video` | `members:custom` |
| POST | `/api/v1/vendors/me/video` | `members:custom` |
| DELETE | `/api/v1/vendors/me/video` | `members:custom` |
| POST | `/api/v1/vendors/public/register` | public |
| GET | `/api/v1/vendors/therapists` | `vendors.therapists:view` |
| GET | `/api/v1/vendors/users/lookup` | `members:create|edit` |
| GET | `/api/v1/vendors/users/search` | `members:create|edit` |

Category grants are retired (D10, C-12, P4-15, 2026-10-27): the seven `.../category-access` routes
(`/me`, `/me/branches/:branchId`, `/:vendorId`, `/:vendorId/branches/:branchId`, read and write)
return 404; the branch list no longer carries `categoryTypes`; `GET /vendors/categories` returns the
same active categories for every member and ignores `vendorId`. Member dashboard `categories` and
`subCategories` count the categories the member uses on its deals, products and therapists.

`/vendors/...` paths that mirror `/members/...` are deprecated aliases (`Deprecation` and `Link`
headers) kept for one release (R7, D16). `/vendors/me/*` is member self-service and
`/vendors/:vendorId/*` is staff working on a member's catalog until the flat routes exist.

### 2.1 Request fields (catalog objects)

Branch (`BranchCreate`): `name` 1 to 150 required; `address`, `country`; `state` and `city` required
from the India location list (C-03, columns `NOT NULL` since S22); `pincode`; `mapLocationUrl` (resolved to latitude and longitude
on the server); `phone`, `email`; `openingHours` per weekday `{open, start, end}`; status via
`PATCH .../status {isActive}`.

Therapist (`TherapistCreate`): `therapistType` and `personName` 1 to 200 required; `gender`;
`specializationCategoryId` (a `THERAPY` category); `bio` (rich text, 2000); `experienceYears` 0 to
60; packages `{durationMinutes, sellingPrice, originalPrice?, isActive, sortOrder}`, unique per
duration.

Deal (`DealCreate`): `categoryId` (`SERVICE`) required, `subcategoryId`; `title` 1 to 200; `slug`
(to become optional, C-04); `shortDescription` 300; `description`, `notes`, `policy`,
`termsAndConditions` (rich text, 5000 each); prices (synced from the cheapest active package;
discount to be computed on the server, C-05); `startDate`, `endDate`; at least one package (unique
per duration; update replaces the set); `therapistIds` (same branch); status `DRAFT | ACTIVE |
INACTIVE | EXPIRED` via `PATCH .../status`.

Deal (PLANNING §2.7, built 2026-10-27, `schemas/vendor.schema.ts`, `services/deal.service.ts`). `.strict()` schemas:

- **Branch:** `state` and `city` required, both from the India location list (422 otherwise,
  C-03); `addressLine2` up to 200.
- **DealCreate:** `categoryId`, `subcategoryId?`, `title` 5 to 120, `tagline?` 140 (stored in
  `shortDescription`), `slug?` (generated when empty: `{title}-{member}-{city}`, 90, numeric
  suffix on conflict; the member may change it only while the deal was never Active),
  `highlights` up to 6 × 80, `description?` rich text 5000, `startDate?` and `endDate?` (end
  after start), `validityDays?` 1 to 365, `maxBookings?` ≥ 0, `limitPerCustomer?` 1 to 20,
  `bookingRequired` (default true), `bookingInstructions?` rich text 2000,
  `cancellationPolicy` `FREE_24H | FREE_48H | NON_REFUNDABLE`, `cancellationNote?` 500,
  `eligibility` up to 6 × 40, `termsAndConditions?` rich text 5000, `faqs` up to 10
  `{question 200, answer 1000}` (array order = display order), `therapistIds` (same branch),
  `packages` 1 to 10.
- **Package:** `name?` 80, `durationMinutes` 15 to 480, `persons` 1 to 6 (default 1),
  `sellingPrice` ≥ 0, `originalPrice?` ≥ `sellingPrice`, `inclusions` up to 8 × 80, `isActive`;
  `durationMinutes` + `persons` unique within the deal.
- **DealUpdate:** the same fields, all optional; `faqs` and `therapistIds` replace the set when
  sent; packages are not accepted here (use the package routes).
- **Refused with 422 as unknown keys:** `salePrice`, `originalPrice`, `discountPercent`,
  `durationMinutes`, `images`, `notes`, `policy`, `status`, `approvalStatus`. The server derives
  the deal's prices, discount and duration from the cheapest active package.
- **Status:** `PATCH .../status {status: DRAFT | ACTIVE | INACTIVE}`. Active needs at least 1
  image, 1 active package, an active branch and an active member; otherwise 422
  `DEAL_NOT_READY` with `missing: ["image" | "package" | "branch" | "member"]`. The first Active
  sets `publishedAt`.
- **Image:** `PATCH .../images/:imageId {altText}` (up to 125); 1 to 10 images per deal (422
  over the limit).

Product (`ProductCreate`): `name` 1 to 200; `slug`; `brand`; `categoryId` (`PRODUCT`) required,
`subcategoryId`; `description` (rich text, 5000); `summary` 2000; `benefits`, `howToUse` (items of
300); `ingredients`, `returnPolicy` (rich text); `badge`; `price`, `originalPrice`; `isNew`,
`isFeatured`; status via `PATCH .../status`.

Media for deals, therapists, products and members: image upload, delete, reorder, set primary, and
one optional video, under the same permission as edit. Stored keys follow ARCHITECTURE.md §12.3.

Documents (`/members/:id/documents`, `/vendors/me/kyc-documents`): viewers who may open files
(`members:edit`, `members:approve`, or the member) get `fileUrl`, a signed link that expires after
5 minutes, plus `numberMasked`, `originalFilename`, `mimeType`, `sizeBytes`. The object key is
never returned. Upload without `R2_PRIVATE_BUCKET` configured returns 503.

### 2.2 Planned endpoints

| Route | Permission | Status |
|---|---|---|
| `GET`, `POST /branches`, `/deals`, `/therapists`, `/products`; `GET`, `PATCH /<res>/:id`; `PATCH /<res>/:id/status`; `DELETE /<res>/:id` (Super Admin) | `<res>:<action>` with scope | NEW (C-09) |
| `PUT /deals/:id/therapists`, `/therapists/:id/packages*`, `/<res>/:id/images*`, `/<res>/:id/video` | `<res>:edit` | NEW (C-09) |
| `GET .../deals` (all of a member's deals) and `GET .../branches/:branchId/deals/:dealId` (one deal with packages, FAQs, therapists, media), staff and `/me` | `vendors.deals:view` / `members:custom` | done (DL-03) |
| `POST .../deals/:dealId/packages`, `PATCH .../packages/:packageId`, `DELETE .../packages/:packageId`, `PATCH .../packages/reorder` (staff and `/me`); delete 409 when in a cart or order, 409 `LAST_PACKAGE` for the last active one | `vendors.deals:edit` / `members:custom` | done (DL-04) |
| Staff deal media: `POST`, `DELETE .../deals/:dealId/images[/:imageId]`, `PATCH .../images/reorder`, `.../images/:imageId/primary`, `.../images/:imageId` (alt text), `POST`, `DELETE .../video` | `vendors.deals:edit` | done (DL-05) |
| `POST .../deals/:dealId/copy {branchId}` (staff and `/me`): copies fields, packages, FAQs (not media, therapists or stock) to another branch of the same member as Draft | `vendors.deals:create` / `members:custom` | done (DL-06) |
| `DELETE .../deals/:dealId`: Super Admin only (`isSuperAdmin` check besides the permission), 409 with orders or cart lines | `vendors.deals:delete` | done (DL-03) |
| `PATCH .../deals/:dealId/approve`, `/reject` | - | removed, 404 (P3-15, D6) |
| `GET /members/:id/documents/:type/download-url` (5 min signed link, not for Support) | `members:view` | NEW (P5-14) |
| `GET`, `PATCH /members/me` | `profile:view` / `edit` | alias of `/vendors/me` |

## 3. Customers and orders

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/cart` | signed in (own records, or checked in the handler) |
| DELETE | `/api/v1/cart` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/cart/items` | signed in (own records, or checked in the handler) |
| PATCH | `/api/v1/cart/items/:id` | signed in (own records, or checked in the handler) |
| DELETE | `/api/v1/cart/items/:id` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/customer/dashboard-summary` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/customer/support` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/customer/support` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/customers` | `customers:view` |
| GET | `/api/v1/customers/:id` | `customers:view` |
| PATCH | `/api/v1/customers/:id/status` | `customers:status_change` |
| GET | `/api/v1/orders` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/orders/:id` | signed in (own records, or checked in the handler) |
| PATCH | `/api/v1/orders/:id/status` | `orders:status_change` (members get 403, D27) |
| POST | `/api/v1/orders/checkout` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/orders/me` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/orders/me/:id` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/orders/me/:id/pay` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/orders/me/:id/pay-cod` | signed in (own records, or checked in the handler) |
| PATCH | `/api/v1/orders/me/:id/status` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/orders/me/:id/verify-payment` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/orders/pay-batch` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/orders/pay-batch/cod` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/orders/pay-batch/verify` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/payments/webhook/razorpay` | public |
| GET | `/api/v1/wishlist` | signed in (own records, or checked in the handler) |
| POST | `/api/v1/wishlist` | signed in (own records, or checked in the handler) |
| DELETE | `/api/v1/wishlist/:dealId` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/wishlist/check/:dealId` | signed in (own records, or checked in the handler) |
| GET | `/api/v1/wishlist/check/product/:productId` | signed in (own records, or checked in the handler) |
| DELETE | `/api/v1/wishlist/product/:productId` | signed in (own records, or checked in the handler) |

Planned: `POST /orders/:id/cancel {reason}` (`orders:status_change`); `POST /orders/:id/refund-requests`
(`orders:custom`); `GET /refund-requests` (`orders:view`); `POST /refund-requests/:id/approve`
(`Idempotency-Key`) and `/reject` (`orders:approve`, not in preview); `GET /customers` own scope
for members (C-16); `PATCH /customers/:id/status {status: active|blocked, reason}` documented in
OpenAPI.

## 4. Storefront

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/catalog/categories` | public |
| GET | `/api/v1/catalog/categories/:slug` | public |
| GET | `/api/v1/catalog/deals` | public |
| GET | `/api/v1/catalog/deals/:idOrSlug` | public |
| GET | `/api/v1/catalog/deals/facets` | public |
| GET | `/api/v1/catalog/locations` | public |
| GET | `/api/v1/catalog/products` | public |
| GET | `/api/v1/catalog/products/:id` | public |
| GET | `/api/v1/catalog/products/facets` | public |
| GET | `/api/v1/catalog/therapists` | public |
| GET | `/api/v1/catalog/therapists/facets` | public |
| GET | `/api/v1/catalog/therapists/:id` | public |
| GET | `/api/v1/catalog/vendors/:slug` | public |

`GET /catalog/deals`: `sort=relevance|price_asc|price_desc|distance|newest|discount`, `vendorIds`,
`branchIds` (comma lists, max 50), `radiusKm` with `latitude`/`longitude`, `minPrice`/`maxPrice`,
paging with `meta.total`. With coordinates the list is ranked in memory
(`services/deal-ranking.ts`). `GET /catalog/deals/facets` returns vendor, branch, distance-bucket
(1, 5, 10, 20, 50, 100 km), tag and price-range counts, each facet ignoring its own selection.

Listing pages (ST-40, PLANNING §4 D29/D30). Every new param is optional; omitting all of them
returns today's response plus the new `tag` field.

- **Tags:** deals and products carry `tag: "expire_soon" | "hot" | "new" | "deal" | null` (rule
  in PLANNING §4). `GET /catalog/deals` and `/catalog/products` accept
  `tags=expire_soon,hot,new,deal` (any of the four, comma list; anything else → 422).
- `GET /catalog/deals`: `categoryId` stays optional, so `/deals` lists every category.
- `GET /catalog/products`: adds `categoryIds` (comma list, max 50, wins over `categoryId`),
  `tags`. `GET /catalog/products/facets` takes the same filters minus paging and sort and
  returns `{ categories: [{ id, name, slug, count }], tags: [{ tag, count }], price: { min, max } }`.
- `GET /catalog/therapists`: adds `sort=relevance|price_asc|price_desc|distance` (price = lowest
  active package; `distance` needs coordinates, else behaves like `relevance`), `minPrice` /
  `maxPrice` (lowest package), `radiusKm`, `city` / `state`, `vendorIds` / `branchIds`, and
  `meta.total`. `GET /catalog/therapists/facets` returns `vendors`, `branches`, `distance` and
  `price` in the deal facet shape.
- Static paths (`/products/facets`, `/therapists/facets`) are registered before `/:id`.

Deal page (PLANNING §2.7, built 2026-10-27, `catalog.service.ts#getPublicDealOrThrow`):

- `GET /catalog/deals/:idOrSlug` accepts a UUID, the current slug or a previous slug and always
  returns the current `slug`, so the page replaces the URL. Hidden deals return 404.
- The detail response adds: `tagline`, `highlights`, `currency: "INR"`, `tag`, `boughtCount`
  (paid order lines, `null` under 10), `isSoldOut`, `stockLeft`, `limitPerCustomer`, `startDate`,
  `endDate`, `validityDays`, `bookingRequired`, `bookingInstructions`, `cancellationPolicy`,
  `cancellationNote`, `eligibility`, `faqs [{question, answer}]`, `mediaImages[].altText`;
  packages gain `name`, `persons`, `inclusions`, `discountPercent`; `branch` gains `addressLine2`,
  `state`, `pincode`, `phone`, `mapLocationUrl`, `openingHours`; `vendor` gains
  `businessDescription`, `website`; `therapists` (active, linked, card fields). The page needs no
  second call for hours.
- `GET /catalog/deals?search=` matches title, member business name, category and subcategory
  names and branch city (case-insensitive), ranked title first, then member, then the rest
  (relevance sort without coordinates ranks the first 500 matches; `meta.total` is capped there).
- Cart: adding a deal beyond `limitPerCustomer` returns 409 `DEAL_LIMIT_REACHED`; beyond stock 409
  `DEAL_SOLD_OUT`. Both are checked again at checkout.


## 5. Static content

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/about-us` | `cms.about-us:view` |
| PATCH | `/api/v1/about-us` | `cms.about-us:edit` |
| POST | `/api/v1/about-us/images` | `cms.about-us:edit` |
| DELETE | `/api/v1/about-us/images/:imageId` | `cms.about-us:edit` |
| PATCH | `/api/v1/about-us/images/:imageId/primary` | `cms.about-us:edit` |
| PATCH | `/api/v1/about-us/images/reorder` | `cms.about-us:edit` |
| GET | `/api/v1/blog-categories` | `cms.blog-category:view` |
| POST | `/api/v1/blog-categories` | `cms.blog-category:create` |
| GET | `/api/v1/blog-categories/:id` | `cms.blog-category:view` |
| PATCH | `/api/v1/blog-categories/:id` | `cms.blog-category:edit` |
| DELETE | `/api/v1/blog-categories/:id` | `cms.blog-category:delete` |
| GET | `/api/v1/blog-posts` | `cms.blog.pages:view` |
| POST | `/api/v1/blog-posts` | `cms.blog.pages:create` |
| GET | `/api/v1/blog-posts/:id` | `cms.blog.pages:view` |
| PATCH | `/api/v1/blog-posts/:id` | `cms.blog.pages:edit` |
| DELETE | `/api/v1/blog-posts/:id` | `cms.blog.pages:delete` |
| POST | `/api/v1/blog-posts/:id/images` | `cms.blog.pages:edit` |
| DELETE | `/api/v1/blog-posts/:id/images/:imageId` | `cms.blog.pages:edit` |
| PATCH | `/api/v1/blog-posts/:id/images/:imageId/primary` | `cms.blog.pages:edit` |
| PATCH | `/api/v1/blog-posts/:id/images/reorder` | `cms.blog.pages:edit` |
| PATCH | `/api/v1/blog-posts/:id/status` | `cms.blog.pages:edit` |
| GET | `/api/v1/careers` | `cms.careers:view` |
| PATCH | `/api/v1/careers` | `cms.careers:edit` |
| GET | `/api/v1/careers/jobs` | `cms.careers:view` |
| POST | `/api/v1/careers/jobs` | `cms.careers:create` |
| GET | `/api/v1/careers/jobs/:id` | `cms.careers:view` |
| PATCH | `/api/v1/careers/jobs/:id` | `cms.careers:edit` |
| DELETE | `/api/v1/careers/jobs/:id` | `cms.careers:delete` |
| PATCH | `/api/v1/careers/jobs/:id/status` | `cms.careers:edit` |
| GET | `/api/v1/catalog/about-us` | public |
| GET | `/api/v1/catalog/blog-categories` | public |
| GET | `/api/v1/catalog/blog-posts` | public |
| GET | `/api/v1/catalog/blog-posts/:slug` | public |
| GET | `/api/v1/catalog/careers` | public |
| GET | `/api/v1/catalog/contact-us` | public |
| GET | `/api/v1/catalog/faqs` | public |
| GET | `/api/v1/catalog/how-it-works` | public |
| GET | `/api/v1/catalog/pages/:slug` | public |
| GET | `/api/v1/contact-us` | `cms.contact-us:view` |
| PATCH | `/api/v1/contact-us` | `cms.contact-us:edit` |
| GET | `/api/v1/faqs` | `cms.faq:view` |
| POST | `/api/v1/faqs` | `cms.faq:create` |
| GET | `/api/v1/faqs/:id` | `cms.faq:view` |
| PATCH | `/api/v1/faqs/:id` | `cms.faq:edit` |
| DELETE | `/api/v1/faqs/:id` | `cms.faq:delete` |
| PATCH | `/api/v1/faqs/:id/status` | `cms.faq:edit` |
| GET | `/api/v1/how-it-works` | `cms.how-it-works:view` |
| PATCH | `/api/v1/how-it-works` | `cms.how-it-works:edit` |
| GET | `/api/v1/how-it-works/steps` | `cms.how-it-works:view` |
| POST | `/api/v1/how-it-works/steps` | `cms.how-it-works:create` |
| PATCH | `/api/v1/how-it-works/steps/:id` | `cms.how-it-works:edit` |
| DELETE | `/api/v1/how-it-works/steps/:id` | `cms.how-it-works:delete` |
| PATCH | `/api/v1/how-it-works/steps/reorder` | `cms.how-it-works:edit` |
| GET | `/api/v1/website-pages` | `cms.website-pages:view` |
| GET | `/api/v1/website-pages/:id` | `cms.website-pages:view` |
| PATCH | `/api/v1/website-pages/:id` | `cms.website-pages:edit` |

Planned: every content route moves from the `cms.*` keys to `content:<action>` (P8-07).

## 6. CTA banners

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/catalog/banners` | public |
| GET | `/api/v1/catalog/promotions` | public (deprecated alias of `slot=HOME_AFTER_DEALS`) |
| GET | `/api/v1/promotions` | `masters.promotions:view` |
| GET | `/api/v1/promotions/search-items` | `masters.promotions:view` |
| POST | `/api/v1/promotions` | `masters.promotions:create` |
| GET | `/api/v1/promotions/:id` | `masters.promotions:view` |
| PATCH | `/api/v1/promotions/:id` | `masters.promotions:edit` |
| DELETE | `/api/v1/promotions/:id` | `masters.promotions:delete` |
| POST | `/api/v1/promotions/:id/images` | `masters.promotions:edit` |
| DELETE | `/api/v1/promotions/:id/images/:imageId` | `masters.promotions:edit` |
| PATCH | `/api/v1/promotions/:id/images/:imageId/primary` | `masters.promotions:edit` |
| PATCH | `/api/v1/promotions/:id/images/reorder` | `masters.promotions:edit` |
| PATCH | `/api/v1/promotions/:id/status` | `masters.promotions:edit` |

- `GET /promotions?state=`: omit for every banner, `state=` (empty) for Global, a name for that state.
- Create and update body: `title` 1 to 120, `description` up to 300, `buttonLabel` 1 to 40,
  `state` (null = Global), `backgroundRole` (`BannerColorRole`), `buttonRole` (`PRIMARY | SECONDARY |
  TERTIARY | INVERSE`), `placements`
  (1 to 6 distinct `BannerSlot`), `destinationType` `ROUTE | CATEGORY | DEAL | PRODUCT` with the
  matching `destinationRoute` / `categoryId` / `dealId` / `productId`, `sortOrder`, `startDate`,
  `endDate` (end after start). A deal or product outside the banner's state is 422.
- A second image upload is 422 (one image per banner).
- `GET /catalog/banners?slot=&state=`: active banners inside their date window for that slot and
  state, by `sortOrder`; when the state has none, the Global ones. Each banner: `id`, `title`,
  `description`, `buttonLabel`, `backgroundRole`, `buttonRole`, `href`, `image`.

## 7. Home slider

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/catalog/home-hero` | public |
| GET | `/api/v1/home-hero/eligible-count` | `masters.home-hero:view` |
| GET | `/api/v1/home-hero/overview` | `masters.home-hero:view` |
| GET | `/api/v1/home-hero/search-items` | `masters.home-hero:view` |
| GET | `/api/v1/home-hero/slides` | `masters.home-hero:view` |
| POST | `/api/v1/home-hero/slides` | `masters.home-hero:create` |
| PUT | `/api/v1/home-hero/slides/order` | `masters.home-hero:edit` |
| GET | `/api/v1/home-hero/slides/:id` | `masters.home-hero:view` |
| PATCH | `/api/v1/home-hero/slides/:id` | `masters.home-hero:edit` |
| DELETE | `/api/v1/home-hero/slides/:id` | `masters.home-hero:delete` |
| PATCH | `/api/v1/home-hero/slides/:id/status` | `masters.home-hero:edit` |
| GET | `/api/v1/home-hero/states` | `masters.home-hero:view` |

- `GET /home-hero/search-items?state=&q=&type=deal|product|all&pageSize=&eligibleOnly=true|false` (same on
  `/promotions/search-items`): items of that state (deal: branch state; product: any active branch
  of its member in the state); empty `state` searches every state. Each row: `type`, `id`, `title`,
  `memberName`, `branchName` (deals), `price`, `image`, `eligible`. Empty `q` lists the newest items
  (browse); `pageSize` 1 to 48, default 12; `eligibleOnly=true` keeps only items customers can see.
- `GET /home-hero/overview`: one row per slider, Global first then states by name: `state`, `status`
  (`LIVE | DRAFT | EMPTY`), `eligibleCount`, `minimumRequired`, `deals`, `products`, `updatedAt`.
- `PUT /home-hero/slides/order` `{ state, slideIds }`: saves the whole order of one slider;
  `slideIds` must be exactly that slider's slides (422 otherwise). Audited as `home_hero_slide.reorder`.
- Admin slide rows also carry `image`, `price` and `ineligibleReason` ("Branch paused", ...).
- Slide create body: `itemType` `deal | product`, `itemId`, `state` (null = Global), `sortOrder`.
  Item outside the state is 422; the same item twice in one slider is 409. Update accepts `sortOrder`
  only.
- `GET /catalog/home-hero?state=`: `{ state, slides: [{ id, type, deal?, product? }] }`; a state's
  slider with 5 or more eligible slides, else the Global one, else an empty list.

### 7.1 Home tag sections (built 2026-10-28, PLANNING.md §7.1)

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/catalog/home-tag-sections` | public |
| GET | `/api/v1/home-tag-sections/overview` | `masters.home-tag-sections:view` |
| GET | `/api/v1/home-tag-sections/states` | `masters.home-tag-sections:view` |
| GET | `/api/v1/home-tag-sections/sections` | `masters.home-tag-sections:view` |
| PUT | `/api/v1/home-tag-sections/sections` | `masters.home-tag-sections:edit` |
| GET | `/api/v1/home-tag-sections/sections/:id/items` | `masters.home-tag-sections:view` |
| POST | `/api/v1/home-tag-sections/sections/:id/items` | `masters.home-tag-sections:create` |
| PUT | `/api/v1/home-tag-sections/sections/:id/items/order` | `masters.home-tag-sections:edit` |
| DELETE | `/api/v1/home-tag-sections/items/:id` | `masters.home-tag-sections:delete` |
| GET | `/api/v1/home-tag-sections/search-items` | `masters.home-tag-sections:view` |

- Deals only (no product/type toggle) — a section's tag (`NEW | DEAL | HOT_DEAL | EXPIRE_SOON`)
  is always the admin's own manual choice, never computed from creation date, discount or
  `endDate`.
- `GET /home-tag-sections/sections?state=`: always all 4 fixed tag rows for that state (or
  Global/Default), even ones never configured (`id: null`, `isEnabled: false` defaults). Each row:
  `id`, `state`, `tag`, `title`, `isEnabled`, `itemCount`, `eligibleCount`, `minimumRequired` (1),
  `status` (`LIVE | DRAFT | DISABLED`), `updatedAt`.
- `PUT /home-tag-sections/sections` `{ state, tag, isEnabled }`: upserts the one (state, tag) row
  the Enabled switch controls (creates it on first use). Audited as `home_tag_section.status_change`.
- `POST /home-tag-sections/sections/:id/items` `{ dealId }`: the deal must belong to that section's
  state (422 otherwise, same rule as Home Hero's slides); already in the section is 409. Audited as
  `home_tag_section_item.create`.
- `PUT /home-tag-sections/sections/:id/items/order` `{ itemIds }`: saves the whole order of one
  section at once; `itemIds` must be exactly that section's items (422 otherwise). Audited as
  `home_tag_section_item.reorder`.
- `GET /home-tag-sections/search-items`: same shape as `/home-hero/search-items` (`type` is always
  `deal`), plus `status`, `discountPercent`, `endDate` on every row so the admin can judge a
  candidate for Expire soon themselves — the tag is never computed.
- Admin item rows also carry `image`, `price` and `ineligibleReason` — mirrors Home Hero's deal
  checks (member active, branch active, deal `ACTIVE`, `approvalStatus APPROVED`) plus one rule
  only for Expire soon: a deal with no `endDate`, or one already in the past, is ineligible there
  specifically (no arbitrary day-window).
- `GET /catalog/home-tag-sections?state=`: `[{ tag, title, state, deals: [...] }]`, one entry per
  tag that resolves to a publishable section — resolved independently per tag: the visitor's own
  state's row for that tag if one is configured at all (enabled or not, eligible or not — a
  configured state row never falls back to Global for that tag); otherwise Global/Default's row
  for the same tag. A tag with nothing eligible anywhere is simply absent from the array; `deals`
  needs >=1 eligible deal to appear (no 5-slide-style minimum like the hero —
  `MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION = 1`).

## 8. Masters

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/catalog/popular-treatments` | public |
| GET | `/api/v1/categories` | `masters.categories:view` |
| POST | `/api/v1/categories` | `masters.categories:create` |
| GET | `/api/v1/categories/:id` | `masters.categories:view` |
| PATCH | `/api/v1/categories/:id` | `masters.categories:edit` |
| DELETE | `/api/v1/categories/:id` | `masters.categories:delete` |
| POST | `/api/v1/categories/:id/images` | `masters.categories:edit` |
| DELETE | `/api/v1/categories/:id/images/:imageId` | `masters.categories:edit` |
| PATCH | `/api/v1/categories/:id/images/:imageId/primary` | `masters.categories:edit` |
| PATCH | `/api/v1/categories/:id/images/reorder` | `masters.categories:edit` |
| PATCH | `/api/v1/categories/:id/status` | `masters.categories:edit` |
| GET | `/api/v1/popular-tags` | `masters.tags:view` |
| POST | `/api/v1/popular-tags` | `masters.tags:create` |
| GET | `/api/v1/popular-tags/:id` | `masters.tags:view` |
| PATCH | `/api/v1/popular-tags/:id` | `masters.tags:edit` |
| DELETE | `/api/v1/popular-tags/:id` | `masters.tags:delete` |
| GET | `/api/v1/popular-tags/:id/mappings` | `masters.tags:view` |
| POST | `/api/v1/popular-tags/:id/mappings` | `masters.tags:edit` |
| DELETE | `/api/v1/popular-tags/:id/mappings/:targetType/:targetId` | `masters.tags:edit` |
| PATCH | `/api/v1/popular-tags/:id/status` | `masters.tags:edit` |
| GET | `/api/v1/popular-treatments` | `masters.popular-treatments:view` |
| POST | `/api/v1/popular-treatments` | `masters.popular-treatments:create` |
| GET | `/api/v1/popular-treatments/:id` | `masters.popular-treatments:view` |
| PATCH | `/api/v1/popular-treatments/:id` | `masters.popular-treatments:edit` |
| DELETE | `/api/v1/popular-treatments/:id` | `masters.popular-treatments:delete` |
| PATCH | `/api/v1/popular-treatments/:id/status` | `masters.popular-treatments:edit` |
| GET | `/api/v1/popular-treatments/groups` | `masters.popular-treatments:view` |
| POST | `/api/v1/popular-treatments/groups` | `masters.popular-treatments:create` |
| GET | `/api/v1/popular-treatments/groups/:id` | `masters.popular-treatments:view` |
| PATCH | `/api/v1/popular-treatments/groups/:id` | `masters.popular-treatments:edit` |
| DELETE | `/api/v1/popular-treatments/groups/:id` | `masters.popular-treatments:delete` |
| PATCH | `/api/v1/popular-treatments/groups/:id/status` | `masters.popular-treatments:edit` |
| GET | `/api/v1/popular-treatments/groups/all` | `masters.popular-treatments:view` |

## 9. Payments, payouts and reports

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/reports/branch-wise` | `reports:view` |
| GET | `/api/v1/reports/month-wise` | `reports:view` |
| GET | `/api/v1/reports/payment-method` | `reports:view` |
| GET | `/api/v1/reports/service-vs-product` | `reports:view` |
| GET | `/api/v1/reports/summary` | `reports:view` |
| GET | `/api/v1/reports/top-products` | `reports:view` |
| GET | `/api/v1/reports/top-services` | `reports:view` |
| GET | `/api/v1/reports/top-vendors` | `reports:view` |
| GET | `/api/v1/reports/vendor-wise` | `reports:view` |

Planned (P7): `GET /payments`, `/payouts`, `/payouts/:id` (`payments:view`, own scope);
`POST /payouts/:id/release` (`payments:approve`, `Idempotency-Key`, step-up OTP, not in preview);
`GET /reports/{overview,online-payment-waiting,member-payouts,deals,therapists,products}`
(`reports:view`, own scope); `GET /reports/:type/export?format=csv` (`reports:export`).

## 10. Analytics

No API (GA4 in the browser).

## 11. Social media

| Method | Path | Guard |
|---|---|---|
| GET | `/api/v1/catalog/social-links` | public |
| GET | `/api/v1/social-media` | `cms.social-media:view` |
| POST | `/api/v1/social-media` | `cms.social-media:create` |
| GET | `/api/v1/social-media/:id` | `cms.social-media:view` |
| PATCH | `/api/v1/social-media/:id` | `cms.social-media:edit` |
| DELETE | `/api/v1/social-media/:id` | `cms.social-media:delete` |

## 12. Platform

- `/docs` (Swagger UI) is served outside production only, or in production with `API_DOCS=true`.
- Responses carry `helmet` security headers; `TRUST_PROXY_HOPS` sets how many proxies to trust
  for the client IP used by rate limits.

Security requirements and the hardening plan: `ARCHITECTURE.md` §12.2. Adding an endpoint:
`docs/ARCHITECTURE.md` §3.4 (permission, seed, route, OpenAPI entry, tests for 401, 403 and 200).
