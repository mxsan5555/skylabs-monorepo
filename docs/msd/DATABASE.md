# msd database

PostgreSQL database `msd`, schema `apps/msd-api/prisma/schema.prisma` (68 models, 22 enums),
55 migrations. Business rules behind the data: `PLANNING.md`.

> **Generated tables.** The model and enum tables below were generated from `schema.prisma` on
> 2026-10-17 ("Columns" counts scalar and enum fields; "Relations" lists Prisma relation fields).
> After a schema change, regenerate them or update the rows of the changed models in the same
> commit. The schema file stays the authority.

## 0. Conventions

- **Prisma 6.19.3**, client generated to `apps/msd-api/src/generated/prisma-client`. Use the
  pinned scripts (`npm run msd-api:prisma:*`), never bare `npx prisma`.
- **Ids** are `uuid()` strings; every model has `createdAt` / `updatedAt`.
- **Physical names are kept** when a model is renamed (`@@map`): `Member` → table `Vendor`,
  `MemberDocument` → `VendorDocument`. Foreign key columns stay `vendorId` in the database; the API
  and TypeScript say member.
- **Status is modelled three ways** on purpose (F10): `isActive` on Branch, Therapist, Product;
  `DealStatus` on Deal; `MemberStatus` on Member. `UserStatus` is lowercase (`active`,
  `inactive`, `blocked`); other enums are uppercase.
- **No soft-delete columns** (F11). Hard deletes are guarded by foreign keys and return 409
  "Deactivate it instead"; `deletedAt` exists only on `User`. Orders, payments and customers are
  never deleted.
- **Migrations:** one reversible change each, reviewed SQL, a `down.sql` for every new migration,
  rehearsed on a copy of the Neon data before production. An applied migration is never edited.
- **Expand, then code, then contract:** add columns and tables first, ship code that writes both,
  drop old columns one release later (P3-16, P12-10).
- **Local database:** PostgreSQL 16 on `localhost:5432` (database name in
  `apps/msd-api/.env.local`). Never point local work at Neon production. No Postgres is needed for
  `prisma validate`, `generate`, the build, OpenAPI or unit tests (Prisma is mocked).

## 1. Admin and staff

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| User | 10 | auditLogsAsActor -> AuditLog[]; cart -> Cart; impersonationsAsAdmin -> ImpersonationSession[]; impersonationsAsTarget -> ImpersonationSession[]; loginHistory -> LoginHistory[]; notifications -> Notification[]; orders -> Order[]; refreshSessions -> RefreshSession[]; roles -> UserRole[]; vendorProfile -> Member; wishlistItems -> WishlistItem[]; supportRequests -> SupportRequest[] | index(status) |
| Role | 9 | dashboardWidgets -> RoleDashboardWidget[]; permissions -> RolePermission[]; users -> UserRole[] | index(isActive) |
| Permission | 7 | roles -> RolePermission[] | index(menuKey) |
| RolePermission | 4 | permission -> Permission; role -> Role | unique(PK roleId, permissionId); index(roleId); index(permissionId); index(scope) |
| UserRole | 3 | role -> Role; user -> User | unique(PK userId, roleId); index(userId); index(roleId) |
| DashboardWidget | 7 | roles -> RoleDashboardWidget[] | index(module) |
| RoleDashboardWidget | 4 | role -> Role; widget -> DashboardWidget | unique(PK roleId, widgetId); index(roleId); index(widgetId) |
| OtpChallenge | 9 | - | index(identifier, purpose); index(expiresAt) |
| RefreshSession | 10 | user -> User | index(userId); index(expiresAt) |
| AuditLog | 11 | actor -> User | index(actorUserId); index(targetType, targetId) |
| Notification | 13 | recipient -> User | index(recipientUserId); index(recipientUserId, isRead); index(entityType, entityId) |
| LoginHistory | 8 | user -> User | index(userId) |
| ImpersonationSession | 7 | superAdmin -> User; target -> User | index(superAdminUserId); index(targetUserId) |

- `RolePermission.scope` (`ALL` | `OWN`, default `ALL`) is stored but not enforced yet (F2).
- `Notification.recipientType` is `SUPERADMIN | VENDOR`; staff notifications use `SUPERADMIN` until
  P4-09 renames it to `ADMIN | MEMBER`.
- `AuditLog.actorUserId` is a required foreign key to `User`, so only actions by a person are
  audited.

## 2. Members

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Member (`Vendor`) | 52 | statusHistory -> MemberStatusHistory[]; documentReminders -> MemberDocumentReminder[]; branches -> Branch[]; deals -> Deal[]; orders -> Order[]; orderItems -> OrderItem[]; products -> Product[]; therapists -> Therapist[]; owner -> User; categoryAccess -> VendorCategoryAccess[]; documents -> MemberDocument[]; mediaImages -> VendorImage[]; mediaVideo -> VendorVideo | index(status); index(ownerUserId) |
| MemberDocument (`VendorDocument`) | 19 | vendor -> Member | unique(vendorId, documentType); unique(documentType, numberHash); index(vendorId); index(status, expiresAt) |
| MemberStatusHistory | 7 | member -> Member | index(memberId, createdAt) |
| MemberDocumentReminder | 11 | member -> Member | unique(memberId, sequence); index(memberId, createdAt) |
| VendorImage | 10 | vendor -> Member | index(vendorId) |
| VendorVideo | 8 | vendor -> Member | - |
| Branch | 18 | vendor -> Member; deals -> Deal[]; orders -> Order[]; orderItems -> OrderItem[]; therapists -> Therapist[]; categoryAccess -> BranchCategoryAccess[] | index(vendorId) |
| Therapist | 14 | cartItems -> CartItem[]; orderItems -> OrderItem[]; popularTagLinks -> PopularTagTherapist[]; branch -> Branch; specializationCategory -> Category; vendor -> Member; mediaImages -> TherapistImage[]; packages -> TherapistPackage[]; mediaVideo -> TherapistVideo; dealLinks -> DealTherapist[] | index(vendorId); index(branchId); index(specializationCategoryId) |
| TherapistPackage | 9 | cartItems -> CartItem[]; orderItems -> OrderItem[]; therapist -> Therapist | unique(therapistId, durationMinutes); index(therapistId) |
| TherapistImage | 10 | therapist -> Therapist | index(therapistId) |
| TherapistVideo | 8 | therapist -> Therapist | - |
| Deal | 35 | faqs -> DealFaq[]; cartItems -> CartItem[]; branch -> Branch; category -> Category; subcategory -> Category; vendor -> Member; mediaImages -> DealImage[]; packages -> DealPackage[]; mediaVideo -> DealVideo; orderItems -> OrderItem[]; popularTagLinks -> PopularTagDeal[]; promotionLinks -> Promotion[]; heroSlides -> HomeHeroSlide[]; wishlistItems -> WishlistItem[]; therapistLinks -> DealTherapist[] | index(vendorId); index(branchId); index(status); GIN trigram(title) |
| DealFaq | 7 | deal -> Deal | index(dealId, sortOrder) |
| DealPackage | 12 | cartItems -> CartItem[]; deal -> Deal; orderItems -> OrderItem[] | unique(dealId, durationMinutes, persons); index(dealId) |
| DealImage | 11 | deal -> Deal | index(dealId) |
| DealVideo | 8 | deal -> Deal | - |
| DealTherapist | 4 | deal -> Deal; therapist -> Therapist | unique(dealId, therapistId); index(dealId); index(therapistId) |
| Product | 25 | cartItems -> CartItem[]; orderItems -> OrderItem[]; popularTagLinks -> PopularTagProduct[]; category -> Category; subcategory -> Category; vendor -> Member; mediaImages -> ProductImage[]; wishlistItems -> WishlistItem[]; mediaVideo -> ProductVideo | index(categoryId); index(vendorId) |
| ProductImage | 10 | product -> Product | index(productId) |
| ProductVideo | 8 | product -> Product | - |
| VendorCategoryAccess | 4 | category -> Category; vendor -> Member | unique(vendorId, categoryId); index(vendorId); index(categoryId) |
| BranchCategoryAccess | 4 | branch -> Branch; category -> Category; subcategories -> BranchSubcategoryAccess[] | unique(branchId, categoryId); index(branchId); index(categoryId) |
| BranchSubcategoryAccess | 4 | branchCategoryAccess -> BranchCategoryAccess; subcategory -> Category | unique(branchCategoryAccessId, subcategoryId); index(branchCategoryAccessId); index(subcategoryId) |

Relation rules enforced in services (not only by foreign keys):

- `Deal.branchId` belongs to `Deal.vendorId` (derived on the server, never from the client).
- Every therapist on a deal shares the deal's branch and member (`assertTherapistsBelongToBranch`).
- Deal category: active top-level `SERVICE`; subcategory, when given, its active child. Product:
  active top-level `PRODUCT` (+ child). Therapist specialization: active `THERAPY` or its child.
  No per-member or per-branch grant (D10); `VendorCategoryAccess`, `BranchCategoryAccess`,
  `BranchSubcategoryAccess` and the `Member.offersService` / `offersProduct` / `offersTherapy` flags
  have no readers or writers since P4-15 and are dropped in the contract phase.
- One member, one owner user (`Member.ownerUserId` unique). A document number used by another
  member returns 409 `DOCUMENT_NUMBER_IN_USE` (`MemberDocument` unique `documentType` + `numberHash`).
- `MemberDocument`: Missing means no row; one row per type per member. Responses never include
  `numberHash` or `numberEncrypted`.
- `MemberDocumentReminder`: one row per reminder covering both channels (`emailStatus`,
  `smsStatus`: `PENDING`, `SENT`, `FAILED`, or null when there is no address). `sequence` 1 to 3
  for scheduled reminders, null for manual ones (`sentByUserId` set); unique `(memberId, sequence)`
  (Postgres treats nulls as distinct). `sentAt` is the first delivery; `attempts` is the claim
  counter.
- `Member.documentsDueAt` = created + 14 days; `reviewFlaggedAt` is set by the reminder job and
  cleared on completion or reactivation.

Deal page schema (PLANNING §2.7, D32 to D35; S18 to S24 below), in `schema.prisma` and migration
`20261026100000_deal_page_fields` (expand step; the drops wait for the contract step).

| Model | Change | Notes |
|---|---|---|
| Deal | add `highlights String[] @default([])`, `eligibility String[] @default([])` | Plain-text items; limits enforced in Zod |
| Deal | add `bookingRequired Boolean @default(true)`, `validityDays Int?`, `limitPerCustomer Int?` | Stock stays `maxBookings` (total) and `availableBookings` (left) |
| Deal | rename `notes` → `bookingInstructions` | Column rename, data kept |
| Deal | add `cancellationPolicy DealCancellationPolicy @default(FREE_24H)`, `cancellationNote String?` | Backfill copies `policy` into `cancellationNote`; `policy` dropped in the contract step |
| Deal | add `previousSlugs String[] @default([])`, `publishedAt DateTime?` | `publishedAt` = first time Active (locks the slug); old slugs still resolve |
| Deal | `salePrice`, `originalPrice`, `discountPercent`, `durationMinutes` | Kept as server-set caches of the cheapest active package (sort, filters, tags); no longer accepted from clients |
| Deal | drop `images` (legacy JSON), `policy`, `approvalStatus`, `approvalRejectionReason` | Contract step, after one release without readers (P3-16) |
| DealPackage | add `name String?`, `persons Int @default(1)`, `inclusions String[] @default([])` | Unique changes from `(dealId, durationMinutes)` to `(dealId, durationMinutes, persons)` |
| DealImage | add `altText String?` | Up to 125 characters; the page falls back to the deal title |
| DealFaq (new) | `id`, `dealId` (cascade), `question`, `answer`, `sortOrder Int @default(0)`, timestamps | `index(dealId, sortOrder)`; plain text, up to 10 per deal (service rule) |
| Branch | add `addressLine2 String?`; `state` and `city` required | `NOT NULL` since `20261027100000_branch_location_required`, after `npm run msd-api:prisma:report-branch-locations` lists no bad rows |
| enum | `DealCancellationPolicy`: FREE_24H, FREE_48H, NON_REFUNDABLE | |
| search | `pg_trgm` extension; GIN trigram indexes on `Deal.title` and `Vendor.businessName` | Raw SQL in the migration (Prisma can't express it); speeds up `ILIKE` search |

Relation rules for the planned deal schema (enforced in services):

- A deal can't be created without an existing branch of the same member (404 otherwise).
- An inline therapist created from the deal form takes the deal's `branchId` and `vendorId`
  from the server.
- A package in any `CartItem` or `OrderItem` is never hard-deleted (409, deactivate instead); at
  least one active package per deal.
- `Branch.state` and `city` must be in the India location list (C-03).

Document numbers (D3): `numberEncrypted` holds the full value encrypted with AES-256-GCM
(`FIELD_ENCRYPTION_KEY`), `numberMasked` is the only value returned, `numberHash` is an HMAC with
`DOC_HASH_PEPPER`. The planned switch `STORE_FULL_DOCUMENT_NUMBER=false` (write only the masked
value and hash) is not built yet (task P5-16).

## 3. Customers and orders

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Cart | 5 | customer -> User; pendingOrder -> Order; items -> CartItem[] | - |
| CartItem | 11 | cart -> Cart; deal -> Deal; dealPackage -> DealPackage; therapist -> Therapist; therapistPackage -> TherapistPackage; product -> Product | unique(cartId, dealId, dealPackageId, therapistId, therapistPackageId, productId); index(dealId); index(dealPackageId); index(therapistId); index(therapistPackageId); index(productId) |
| WishlistItem | 5 | customer -> User; deal -> Deal; product -> Product | unique(customerId, dealId); unique(customerId, productId); index(customerId); index(dealId); index(productId) |
| Order | 20 | pendingForCart -> Cart; branch -> Branch; customer -> User; vendor -> Member; items -> OrderItem[]; payments -> Payment[] | index(customerId); index(vendorId); index(branchId); index(status) |
| OrderItem | 17 | branch -> Branch; deal -> Deal; dealPackage -> DealPackage; order -> Order; therapist -> Therapist; therapistPackage -> TherapistPackage; vendor -> Member; product -> Product | index(orderId); index(dealId); index(vendorId); index(therapistId); index(therapistPackageId); index(dealPackageId); index(productId) |
| Payment | 12 | order -> Order | index(orderId); index(status); index(providerOrderId); index(providerPaymentId) |
| SupportRequest | 6 | customer -> User | index(customerId); index(createdAt) |

- `OrderItem.vendorId` (not `Order`'s own vendor column) says which member sold each line; own
  scope on orders and payments filters by it.
- `SupportRequest` is a customer contact message, unrelated to the `support` role (F14).

## 4. Storefront

No own tables; reads members' catalog (section 2), masters (section 8) and content (section 5)
through `publicVisibleWhere()`.

Card tags (D30) need no schema change: Expire soon reads `Deal.endDate`, New `createdAt`, Deal
`Deal.discountPercent` / `Product.discount`, and Hot counts `OrderItem` lines (indexed on
`dealId` and `productId`) whose `Order.status` is `CONFIRMED` or `COMPLETED`. `Product.badge`
(member free text) is not a tag.

## 5. Static content

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| BlogCategory | 8 | posts -> BlogPost[] | index(isActive, sortOrder) |
| BlogPost | 15 | category -> BlogCategory; mediaImages -> BlogPostImage[] | index(status, publishedAt); index(categoryId) |
| BlogPostImage | 10 | blogPost -> BlogPost | index(blogPostId) |
| AboutUsContent | 8 | mediaImages -> AboutUsImage[] | - |
| AboutUsImage | 10 | aboutUs -> AboutUsContent | index(aboutUsId) |
| ContactUsContent | 9 | - | - |
| Faq | 7 | - | index(isActive, sortOrder) |
| WebsitePage | 9 | - | index(status) |
| HowItWorksContent | 6 | - | - |
| HowItWorksStep | 8 | - | index(isActive, sortOrder) |
| CareersPageContent | 6 | - | - |
| CareersJobListing | 14 | - | index(status, sortOrder) |

## 6. CTA banners

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Promotion | 19 | category -> Category; deal -> Deal; product -> Product; mediaImages -> PromotionImage[]; placements -> PromotionPlacement[] | index(sortOrder); index(categoryId); index(dealId); index(productId); index(state) |
| PromotionImage | 10 | promotion -> Promotion | index(promotionId) |
| PromotionPlacement | 3 | promotion -> Promotion (cascade) | unique(promotionId, slot); index(slot) |

Migration `20261018100000_state_sliders_banners` (with `down.sql`):

- `Promotion`: `state` text null (null = Global/Default); `backgroundRole`, `buttonRole`
  `BannerColorRole` not null default `PRIMARY`; `productId` FK -> Product, set null on delete.
  `title` is the headline, `description` the subheadline, `buttonLabel` the button text.
- Enum `BannerColorRole`: `PRIMARY`, `SECONDARY`, `TERTIARY`, `SURFACE`, `SURFACE_HIGH`, `INVERSE`
  (maps to the `sky-cta-banner` `color` attribute).
- Enum `PromotionDestination` gains `PRODUCT`.
- `PromotionPlacement`: `promotionId`, `slot` `BannerSlot`, `createdAt`.
- Enum `BannerSlot`: `HOME_AFTER_DEALS`, `HOME_AFTER_PRODUCTS`, `CATEGORY_TOP`, `EXPLORE_TOP`,
  `DEAL_BOTTOM`, `PRODUCT_BOTTOM`.
- Data: every existing promotion gets slot `HOME_AFTER_DEALS`, state null, roles `PRIMARY`.
- One image per banner is enforced by the upload route, not the schema.

## 7. Home slider

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| HomeHeroSlide | 8 | deal -> Deal (cascade); product -> Product (cascade) | index(state); index(dealId); index(productId); index(sortOrder) |

Same migration: `dealId` becomes nullable; `productId` text null FK -> Product (cascade); CHECK
`home_hero_slide_one_item`: exactly one of `dealId`, `productId` is set. Duplicate items in one
slider are refused by the service (409), not a unique index, because `state` is nullable.

## 8. Masters

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Category | 10 | parent -> Category; children -> Category[]; mediaImages -> CategoryImage[]; deals -> Deal[]; subcategoryDeals -> Deal[]; popularTagLinks -> PopularTagCategory[]; popularTreatments -> PopularTreatment[]; popularTreatmentSubcats -> PopularTreatment[]; promotionLinks -> Promotion[]; products -> Product[]; subcategoryProducts -> Product[]; therapistSpecializations -> Therapist[]; vendorAccess -> VendorCategoryAccess[]; branchAccess -> BranchCategoryAccess[]; branchSubcategoryAccess -> BranchSubcategoryAccess[] | index(parentId) |
| CategoryImage | 10 | category -> Category | index(categoryId) |
| PopularTreatmentGroup | 7 | treatments -> PopularTreatment[] | index(sortOrder) |
| PopularTreatment | 10 | group -> PopularTreatmentGroup; category -> Category; subcategory -> Category | index(groupId); index(categoryId); index(sortOrder) |
| PopularTag | 6 | categories -> PopularTagCategory[]; deals -> PopularTagDeal[]; products -> PopularTagProduct[]; therapists -> PopularTagTherapist[] | - |
| PopularTagCategory | 4 | category -> Category; tag -> PopularTag | unique(tagId, categoryId); index(tagId); index(categoryId) |
| PopularTagDeal | 4 | deal -> Deal; tag -> PopularTag | unique(tagId, dealId); index(tagId); index(dealId) |
| PopularTagProduct | 4 | product -> Product; tag -> PopularTag | unique(tagId, productId); index(tagId); index(productId) |
| PopularTagTherapist | 4 | tag -> PopularTag; therapist -> Therapist | unique(tagId, therapistId); index(tagId); index(therapistId) |

## 9. Payments, payouts and reports

Payments live in section 3 (`Payment`). Reports are computed from orders, no tables. Planned
tables: `RefundRequest`, `Payout`, `IdempotencyKey`, `ProviderEvent`, `SystemSetting` (S8 to S11).

## 10. Analytics

No tables (GA4 holds the data).

## 11. Social media

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| SocialMediaLink | 8 | - | index(isActive, sortOrder) |

## 12. Platform: enums, planned changes and migration order

### 12.1 Enums

| Enum | Values |
|---|---|
| `PermissionScope` | ALL, OWN |
| `PromotionDestination` | ROUTE, CATEGORY, DEAL |
| `UserStatus` | active, inactive, blocked |
| `PermissionAction` | view, create, edit, delete, export, import, approve, reject, upload, download, print, assign, restore, permanent_delete, status_change, custom |
| `OtpPurpose` | login, signup, change_phone, change_email |
| `LoginMethod` | otp_email, otp_phone, google |
| `MemberStatus` | ACTIVE, INACTIVE, SUSPENDED, ARCHIVED |
| `MemberDocumentStatus` | SUBMITTED, APPROVED, REJECTED, EXPIRED |
| `KycStatus` | PENDING, VERIFIED, REJECTED |
| `DealStatus` | DRAFT, ACTIVE, INACTIVE, EXPIRED |
| `DealApprovalStatus` | PENDING, APPROVED, REJECTED (no longer read; every deal is APPROVED, dropped in the contract step) |
| `DealCancellationPolicy` | FREE_24H, FREE_48H, NON_REFUNDABLE |
| `OrderType` | SERVICE, PRODUCT |
| `OrderStatus` | PENDING_PAYMENT, CONFIRMED, COMPLETED, CANCELLED |
| `CategoryType` | SERVICE, PRODUCT, THERAPY |
| `BlogPostStatus` | DRAFT, PUBLISHED |
| `PaymentProvider` | RAZORPAY, COD |
| `PaymentStatus` | CREATED, PAID, FAILED, CANCELLED |
| `NotificationRecipientType` | SUPERADMIN, VENDOR |
| `NotificationType` | DEAL_PENDING_APPROVAL, ORDER_RECEIVED, VENDOR_PENDING_APPROVAL, MEMBER_SUSPENDED, DOCUMENT_APPROVED, DOCUMENT_REJECTED, MEMBER_REVIEW_FLAGGED |
| `ReminderDelivery` | PENDING, SENT, FAILED |
| `VendorDocumentType` | GST, PAN, AADHAAR |

### 12.2 Planned schema changes

| # | Change | Status |
|---|---|---|
| S1 | Role `vendor` → `member`, add `support`; role-key constants | done (migration `20261015100000_member_lifecycle` + seed); row counts on Neon pending (P10-45) |
| S2 | Permission rows for the 14 keys; map old keys on existing grants | partly: `vendors:*` copied to `members:*` |
| S3 | Backfill `scope=OWN` for the member role before scope is enforced | open (P1-01 follow-up) |
| S4 | `Vendor` → `Member`, `MemberStatus`, status, due date and review columns | done (`20261015100000_member_lifecycle`) |
| S5 | `VendorDocument` → `MemberDocument` with status, masked number, hash, encrypted number, reviewer, expiry, uploader | done (same migration) |
| S6 | `MemberStatusHistory` | done (same migration) |
| S7 | `MemberDocumentReminder` + `ReminderDelivery`, `NotificationType.MEMBER_REVIEW_FLAGGED` | done (`20261017100000_member_document_reminders`) |
| S8 | `RefundRequest` (amount `Decimal(12,2)`, status, decision, provider refund id) | open (P7-01) |
| S9 | `Payout` (period, gross, commission, net, status, release), unique per member and period | open (P7-06) |
| S10 | `IdempotencyKey` (24 h TTL), `ProviderEvent` (unique provider + event id) | open (P2-12, P7-13) |
| S11 | `SystemSetting` (key, JSON value, per-key Zod allowlist, no secrets) | open (P8-02) |
| S12 | `User.statusReason`, `statusChangedAt` | open |
| S14 | Branch delete route only, no column change | open (C-08) |
| S15 | Indexes: `AuditLog(actorUserId, createdAt)`, `LoginHistory(userId, createdAt)`, `Order(vendorId, createdAt)`, `OrderItem(vendorId)` | open (check with EXPLAIN) |
| S16 | Notification enums (`ADMIN`, `MEMBER` recipients; `REFUND_REQUESTED`, `PAYOUT_RELEASED`) | open (P4-09) |
| S17 | Encrypt and mask `bankAccountNumber` | open (P5-13) |
| S18 | Deal: highlights, eligibility, booking required, booking instructions (rename of `notes`), validity days, limit per customer, cancellation policy and note, previous slugs, published at; enum `DealCancellationPolicy` | written (`20261026100000_deal_page_fields`); apply and rehearse on a Neon copy open (DL-01) |
| S19 | DealPackage: name, persons, inclusions; unique `(dealId, durationMinutes, persons)` | written (same migration) |
| S20 | DealImage: `altText` | written (same migration) |
| S21 | `DealFaq` table | written (same migration) |
| S22 | Branch: `addressLine2`; report and fix rows whose `state` or `city` is not in the India list, then `NOT NULL` | done 2026-10-27 (DL-02): column in `20261026100000_deal_page_fields`; report script `prisma/report-branch-locations.ts` (0 bad rows locally); `NOT NULL` in `20261027100000_branch_location_required` (stops with a clear message if a row lacks state or city); Neon run with DL-01 |
| S23 | Backfill: `policy` → `cancellationNote`; `publishedAt` = `updatedAt` for ACTIVE deals; every deal `approvalStatus = APPROVED` (D6). Existing slugs are kept; new deals get `{title}-{member}-{city}` | written (same migration) |
| S24 | `pg_trgm` + GIN trigram indexes on `Deal.title` and `Vendor.businessName` | written (same migration; indexes declared in `schema.prisma`, extension in SQL) |
| - | Contract: drop `kycStatus`, `kycRejectionReason`, legacy GST/PAN/`kycDocuments`, `approvalStatus`, `approvalRejectionReason`, `Deal.images`, `Deal.policy`, category-grant tables, `Member.offersService`/`offersProduct`/`offersTherapy` | after one release without readers (P3-16) |

`PaymentStatus` gains `REFUNDED`, `PARTIALLY_REFUNDED` with S8.

### 12.3 Migration order and release gates

Order: S1 to S3, S6, S7, S4, S5, S8 to S13, S15 to S17, S18 to S24, backfills, then the contract drops last.

Before `20261015100000_member_lifecycle` reaches Neon: run
`apps/msd-api/prisma/member-status-report.ts`, get owner sign-off on the counts per old status
(REJECTED becomes SUSPENDED), and rehearse up and down on a Neon copy (P10-45, P3-19).
`20261017100000_member_document_reminders` depends on it.

### 12.4 Seed

`apps/msd-api/prisma/seed.ts` seeds the 7 roles, a permission row per menu node and action
(`EXTRA_ACTIONS_BY_MENU_KEY` adds non-default actions), starter grants, dashboard widgets and demo
data, and grants every permission to `isSuperAdmin` roles. Running it twice is a no-op. The full
matrix of `PLANNING.md` §1.2 with scope is task P1-07.
