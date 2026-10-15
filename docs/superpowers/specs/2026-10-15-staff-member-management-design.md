# Staff Member Management: Design

Date: 2026-10-15. Status: approved in brainstorming, awaiting written-spec review.
Business rules: `docs/msd/ADMIN_USER_ROLES_AND_PERMISSIONS.md`. Technical plan: `docs/msd/ADMIN_RBAC_MASTER_PLAN.md`. Tracker: `docs/msd/ADMIN_RBAC_TASKS.md`.

## 1. Goal

Make the staff-facing member screens (All members, Add member, Member detail), the API behind them, `schema.prisma` and `seed.ts` follow the member lifecycle in the business doc. Today the code follows the old vendor onboarding workflow.

## 2. Scope

In scope: members list, add member, member detail (staff side); `/members` API; status model; documents checklist and review; suspend and inactive enforcement; storefront visibility by member status; schema and seed; `members` permission key and roles; task list re-check.

Out of scope (later slices): member self-service screens, own-scope enforcement on all other routes, flat `/branches` `/deals` `/therapists` `/products` routes, reminder cron, private bucket and malware scan, payouts, refunds, deal approval removal (P3-15).

## 3. Decisions made in brainstorming

| # | Decision |
|---|---|
| B1 | Slice is staff member management only. |
| B2 | Full rename: Prisma model `Vendor` to `Member`, `VendorDocument` to `MemberDocument`, with `@@map` so tables keep their names. FK columns stay `vendorId`. |
| B3 | Add member is a short form (owner first and last name, mobile, email, business name), then the detail page opens on Profile. |
| B4 | Documents: checklist, status, approve and reject, header chip and due date, on today's storage. |
| B5 | Rename permission key `vendors` to `members`, role `vendor` to `member`, add role `support`, seed the members matrix row with extra actions. |
| B6 | Build backend first, then screens, then contract migration one release later. |

## 4. Current state vs target

| Area | Code today | Target |
|---|---|---|
| Routes and copy | `/account/vendors*`, "Vendor" | `/account/members*`, "Member" |
| Statuses | 7 values with approve and reject | `MemberStatus {ACTIVE, INACTIVE, SUSPENDED, ARCHIVED}`, no approval |
| Add flow | Step pipeline, profile and one KYC document gate branches and products | Short form, member Active on create, documents never a gate |
| Detail page | Overview cards and sections, approve, reject, delete from any state | Tabs Profile, Documents, Branches/Deals/Therapists/Products, Activity. Delete only from Suspended, Super Admin only. |
| Status change | Active and deactivate Super Admin only, no reason minimum | Admin and Super Admin, reason 10 to 500 characters, history |
| Permissions | `vendors*`, no scope | `members` with scope |
| Seed | role `vendor`, no `support` | 7 roles, members row per matrix |

## 5. Data model and seed

Expand migration, reversible, with `down.sql`.

- Rename model `Vendor` to `Member` and `VendorDocument` to `MemberDocument`, both with `@@map`.
- Replace enum `VendorStatus` with `MemberStatus { ACTIVE, INACTIVE, SUSPENDED, ARCHIVED }`.
- New `Member` columns: `statusChangedAt`, `statusChangedByUserId`, `archivedAt`, `documentsDueAt`, `reviewFlaggedAt`, `welcomeSentAt`. `statusReason` already exists.
- `MemberDocument` new columns: `status {SUBMITTED, APPROVED, REJECTED, EXPIRED}`, `numberMasked`, `numberHash`, encrypted full number (decision D3, key from env), `rejectionReason`, `reviewedByUserId`, `reviewedAt`, `expiresAt`, `uploadedByUserId`, `uploadedOnBehalf`. Missing means no row.
- New table `MemberStatusHistory` (`memberId`, `fromStatus`, `toStatus`, `reason`, `actorUserId`, `createdAt`; index `(memberId, createdAt)`).
- `NotificationType` gains `MEMBER_SUSPENDED`, `DOCUMENT_APPROVED`, `DOCUMENT_REJECTED`.
- `SystemSetting` keys `support.email` and `support.phone` for the suspension notice.

Backfill (decision D1): `PROFILE_INCOMPLETE`, `PENDING_VERIFICATION`, `APPROVED`, `ACTIVE` become ACTIVE; `INACTIVE` stays; `REJECTED` becomes SUSPENDED with reason "Migrated from rejected". Existing KYC files become SUBMITTED documents, never auto-approved. `documentsDueAt` is set to migration date plus 14 days. A report prints counts per old state before the migration is applied.

Seed:
- Role `vendor` becomes `member`; `support` is added (7 roles). Seeding twice is a no-op.
- `members` permission row per the matrix with scope: Super Admin VCED all, Admin VCE all, Marketing V all, Sales VCE all, Support V all, Member VE own. Extra actions `status_change`, `approve`, `reject`, `delete` follow the business doc.
- Menu key `vendors` becomes `members`; existing custom grants are mapped to it.
- Demo members are seeded ACTIVE. Dashboard widget `vendor-profile` is assigned to role `member`.

## 6. API and lifecycle enforcement

Canonical routes under `/api/v1/members`. Old `/vendors*` paths stay as aliases with a `Deprecation` header for one release.

| Route | Permission | Notes |
|---|---|---|
| `GET /members` | `members:view` | Filters `status`, `documents=incomplete`, `reviewFlag`, `q`; paging; sort allowlist |
| `POST /members` | `members:create` | Creates User and Member, role `member`, status ACTIVE, `documentsDueAt` = now + 14 days, welcome SMS or email once. Duplicate phone or email returns 409. |
| `GET`, `PATCH /members/:id` | `members:view`, `members:edit` | Strict Zod body, allowlisted fields |
| `PATCH /members/:id/status` | `members:status_change` | `{status, reason}`, reason 10 to 500 chars; history and audit in one transaction; suspend revokes all refresh sessions |
| `DELETE /members/:id` | `members:delete` | Super Admin only, only from SUSPENDED; zero orders hard deletes, otherwise ARCHIVED; delete from other states returns 409 `MEMBER_NOT_SUSPENDED` |
| `GET /members/:id/status-history`, `/activity` | `members:view` | Activity tab |
| Documents: list, upload, review, download-url | `members:view`, `edit`, `approve`, `reject` | Support sees type and status only |

Removed: `POST /vendors/me`, `/vendors/me/submit`, and the vendor approve and reject routes.

Status machine (any other transition returns 409):

| From | To | Who | Side effects |
|---|---|---|---|
| ACTIVE | INACTIVE | Admin, Super Admin | hidden from storefront, writes blocked |
| ACTIVE, INACTIVE | SUSPENDED | Admin, Super Admin | sessions revoked, login refused, hidden, email and SMS sent |
| INACTIVE, SUSPENDED | ACTIVE | Admin, Super Admin | restored as before, "active again" email and SMS |
| SUSPENDED | ARCHIVED | system, on delete when orders exist | hidden everywhere, rows kept |

Enforcement:
- **Suspended:** login and OTP request return 403 `MEMBER_SUSPENDED` with the reason and steps to return, and no OTP is sent. `authenticate` also checks member status on every request, so an existing token is refused.
- **Inactive:** `authenticate` sets `readOnly`. Every non-GET returns 403 `MEMBER_INACTIVE_READ_ONLY`. Logout and token refresh are the only exceptions. GET stays open for orders, customers and own catalog.
- **Storefront:** `publicVisibleWhere()` in `catalog-visibility.ts` adds "member ACTIVE" to the conditions the catalog already applies, and every `/catalog` query uses it. The deal approval check stays until P3-15. Suspend hides everything; reactivate restores it exactly.
- **Notifications:** a minimal email and SMS template sender. The suspend notice carries the reason, the support contact and the steps to return to Active. A failed send is recorded and retried, and never rolls back the status change.

## 7. Screens

Routes move to `/account/members*`; `/account/vendors*` redirects. Copy lives in `content.json`. Buttons show only when the viewer's role allows them.

**All members (`/account/members`)**: `sky-data-table` with server paging, search and sort. Columns: Business, Owner, Status, Documents chip, Due date, counts of Branches, Deals, Therapists, Products. Filters: status, documents incomplete, ready for suspension review. "Add member" needs `members:create`.

**Add member (`/account/members/new`)**: one short form (owner first and last name, mobile, email, business name) with shared validators. Save creates the member as Active and opens the detail page on Profile. Duplicate phone or email shows an inline error on that field. The step pipeline and setup locks are removed.

**Member detail (`/account/members/:id`)**:
- Header: name, status chip, documents chip, due date, and the allowed actions: Make inactive, Suspend, Reactivate, Delete (Super Admin, Suspended only). Each opens an inline confirm with a reason field.
- Tabs (ARIA tab pattern): Profile (read-only for Marketing and Support); Documents (Aadhaar, PAN, GST rows with status chip, masked number, upload, approve, reject with reason, "uploaded by X for member"); Branches / Deals / Therapists / Products (existing list pages, no setup locks); Activity (status history with who and why, document events).
- A "Ready for suspension review" badge shows when `reviewFlaggedAt` is set, with the Suspend reason prefilled "Documents not completed". Only the deferred reminder cron sets the flag, so the badge shows nothing until that cron exists.
- A suspended member shows a banner: the member cannot log in and the website hides their items.

Removed: Approve, Reject, Overview setup-progress cards, and the Customers and Orders tabs inside the detail page.

## 8. Testing and rollout

Backend (Vitest, Prisma mocked, no Postgres): table-driven status machine; suspended login 403 with no OTP row; inactive write 403 and GET 200; `publicVisibleWhere()` suspend hides and reactivate restores; duplicate phone 409; delete outside Suspended 409; role x action tests for the `members` row.
With Postgres: migration up and down on a Neon copy with counts per old status; seed twice is a no-op.
Frontend (msd Vitest): list, add and detail per role (Super Admin, Admin, Sales, Marketing, Support); tab keyboard behaviour; inline confirm; 409 and 422 mapped to fields. Known failures (msd `app.spec.tsx` 1, `otp.test.tsx` 2) must not grow.

Rollout: expand migration and backfill, then API with aliases, then screens, then the contract migration one release later (P3-16, P12-10). Nothing destructive ships in this slice.

## 9. Task list changes (`ADMIN_RBAC_TASKS.md`)

| Action | Tasks |
|---|---|
| Tick as done | P1-01 (scope migration merged, master plan F1) |
| In this slice | P1-02, P1-03, P1-05 (members key only), P1-06 (members only), P1-07 (members row and roles), P2-03, P2-04, P3-01 to P3-13, P3-17, P3-18, P5-01, P5-02, P5-05, P5-07, P5-09, P5-11, P6-03 (minimal), P10-02, P10-05, P10-07, P10-11 to P10-18, P10-39 |
| Partly in | P5-06, P5-08 (existing storage), P10-03, P10-04 (member error codes and banners), P10-19 (badge only) |
| Delete | P3-14 (superseded by FK 409 guard and branch delete C-08) |
| Deferred | P3-15, P3-16, P5-03, P5-04, P5-10, P5-12, P5-13, P6-01, P6-02, P6-04 to P6-07, all of P4, P7, P8 |
| Add | P3-19 status backfill report; P3-20 support contact `SystemSetting` keys and seed; P3-21 remove `POST /vendors/me` and `/me/submit` (C-11) |
| Fix | P0-01 reference "spec section 9" to master plan section 11; recompute the progress table |

## 10. Risks

- Full model rename touches every service that uses `prisma.vendor`. Mitigation: rename in one commit with `nx build msd-api` and tests green before any behaviour change.
- Suspend and inactive checks run on every request. Mitigation: 30 second status cache, cleared on any status change.
- Backfill moves `REJECTED` members to SUSPENDED, which hides them from the storefront. Mitigation: the backfill report is reviewed before the migration runs.
