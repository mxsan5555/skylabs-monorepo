# MSD Deal and Product Admin Schema and UI Verification

**Investigation date:** 2026-10-19
**Scope:** Source and browser verification of Deal and Product Admin create/edit/list pages,
API contracts, validation, persistence, public detail pages, and supplied reference examples.
**Change type:** Documentation only. No application code, schema, migration, or database record
was changed.

## Evidence and verification limits

- **Source-verified:** directly established from the current frontend, API, service, schema, or
  migration implementation.
- **Browser-verified:** observed in the running local UI using the shared Admin Panel session.
- **Sample-reported:** a value/shape stated in the supplied API example; not independently
  captured from a new request in this investigation.
- **Not run / not verified:** no basis to claim the behavior was exercised end-to-end.

The local storefront and Admin Panel loaded at `http://localhost:4200/`; the API health endpoint
at `http://localhost:3333/api/v1/health` returned HTTP 200. The protected Admin Deal and Product
creation pages had previously been opened in the shared session, including the actual visible
field labels. The cross-vendor Deal and Product overview pages were also opened. Their UI was
inspected without submitting a form. On nested create forms, a placeholder Member UUID was used;
lookups tied to that non-existent ID returned 404, so those dynamic choices and real Member
relationships were not browser-verified. No supplied UUID was used for a write, and no create,
update, status, delete, or media-upload request was sent.

The supplied sample payloads and response summaries are treated as reference observations, not as
proof that the cited IDs currently exist or that the described response was returned by the
running local database.

## 1. Executive summary

- A **Deal** is a Member-owned, single-Branch service. It requires a `SERVICE` category and one or
  more `DealPackage` duration/price choices. Optional therapists are linked through a
  `DealTherapist` join model and must belong to the same Member and Branch.
- A **Product** is a separately purchasable Member-owned retail item. It has required category,
  name, slug and price fields, an optional subcategory and metadata, and no Branch, stock, SKU,
  or inventory relation in the current Product model.
- The Admin create/edit pages are Member-scoped pages under
  `/account/members/:vendorId/...`. The cross-vendor `/account/deals` and `/account/products`
  pages are oversight lists; they are not equivalent to the Member-scoped create/edit screens.
- The Admin Deal create route sets `status=ACTIVE` and `approvalStatus=APPROVED`. The DB defaults
  are instead `DRAFT` and `PENDING`, used by the distinct Member self-service create flow.
- Deal `discountPercent` and Product `discount` are optional explicit fields. Neither is
  calculated by the create service. The Deal detail page derives a display percentage only when
  `discountPercent` is null and it can compare selected prices.
- Supplied null/empty observations are consistent with nullable columns/default relations: Deal
  `images` can be null while media relations are empty; optional booking/date fields can remain
  null; Product optional JSON/URL fields can be null while `mediaImages` is `[]` and
  `mediaVideo` is null.
- Confirmed form/API gaps: the Admin Deal form does not submit dates, booking limits,
  `discountPercent`, or media; the Admin Product form omits `benefits`, `howToUse`, legacy image
  fields, and media upload controls. Product media endpoints do exist; an equivalent admin Deal
  media route/form flow was not found in the inspected implementation.
- The public Deal/Product detail APIs intentionally use explicit, smaller select lists than the
  Admin create/list APIs. Several database fields therefore cannot appear on public detail.
- No authenticated create request was made. The sample response observations are **not
  independently runtime-verified** here.

## 2. Repository architecture and data flow

### 2.1 Relevant applications and layers

| Layer | Actual implementation |
|---|---|
| MSD frontend | `apps/msd` — React 19 + Vite; Admin console routes are in `src/app/routes.tsx`. |
| MSD API | `apps/msd-api` — Express + TypeScript; API is mounted under `/api/v1` in `src/app.ts`. |
| Admin forms and clients | React form pages in `apps/msd/src/app/pages/account/members/`; authenticated API functions and types in `apps/msd/src/api/rbac/vendors.ts`. |
| Deal routes/service | `apps/msd-api/src/routes/vendors.routes.ts`; `apps/msd-api/src/services/vendor.service.ts`. |
| Product routes/service | Vendor-scoped create/edit routes in `vendors.routes.ts`; Product catalog/oversight reads and persistence in `apps/msd-api/src/routes/products.routes.ts` and `src/services/product.service.ts`. |
| Public catalog/detail | Public routes in `apps/msd-api/src/routes/catalog.routes.ts`; allow-listed reads in `src/services/catalog.service.ts`; customer UI in `deal-detail/deal-detail.tsx` and `product-detail/product-detail.tsx`. |
| Persistence | `apps/msd-api/prisma/schema.prisma`; PostgreSQL tables, relations, and indexes. |

### 2.2 Create request sequence

```mermaid
sequenceDiagram
  actor Admin
  participant UI as React Admin form
  participant Client as vendors.ts API client
  participant Route as Express vendors.routes
  participant Guard as Auth/permission/validation
  participant Service as vendor/product service
  participant DB as Prisma/PostgreSQL
  UI->>Client: Create input + Member/Branch IDs in path
  Client->>Route: POST /api/v1/vendors/:vendorId/...
  Route->>Guard: authenticate, permission, Zod validation
  Guard-->>Route: validated request
  Route->>Service: createDeal(...) or createProduct(...)
  Service->>DB: ownership/category checks; transaction when applicable; insert
  DB-->>Service: persisted row(s) and included relations
  Service-->>Route: response data
  Route-->>UI: HTTP 201 { data, error: null }
  UI->>UI: Navigate to the Member-scoped edit page
```

Deal creates also insert package/link rows in the Deal transaction. Product media is uploaded
through separate media routes after a Product exists; the inspected Product create form does not
invoke those routes.

### 2.3 Routes and page inventory

| Page/function | Route or API | Behavior |
|---|---|---|
| Admin Deal create | `/account/members/:vendorId/deals/new` | `DealFormPage`, protected by `VendorsRouteGuard`. |
| Admin Deal edit | `/account/members/:vendorId/deals/:dealId` | Same form component in edit mode; loads Member-wide Deal list and finds the record locally. No single-Deal Admin GET is used. |
| Member detail Deal list | Member detail `section=deals` | `DealsListPage`; columns: Deal, Branch, Category, Price, Therapists, Status; Add/Edit/status/delete actions depend on permissions. |
| Cross-vendor Deal oversight | `/account/deals` | Browser-observed read list: Deal Name, Vendor, Branch, Category, Packages, Starting Price, Status, Approval Status, Created. Row action links to the Member, not a separate Deal detail page. |
| Public Deal detail | `/deal/:id` | `DealDetail`; reads public `GET /api/v1/catalog/deals/:id`. Not an Admin detail endpoint/page. |
| Admin Product create | `/account/members/:vendorId/products/new` | `ProductFormPage`, protected by `VendorsRouteGuard`. |
| Admin Product edit | `/account/members/:vendorId/products/:productId` | Same form component in edit mode; loads Member Product list (page size 100) and finds record locally. |
| Member detail Product list | Member detail `section=products` | `ProductsListPage`; columns: Name, Brand, Category, Price, Status; has Add/Edit/status/delete actions based on permission. |
| Cross-vendor Product oversight | `/account/products` | Browser-observed read-only list: Name, Vendor, Brand, Category, Subcategory, Price, Discount, Status. No Add/Edit/Delete controls. |
| Public Product detail | `/products/:id` | `ProductDetail`; reads public `GET /api/v1/catalog/products/:id`. |
| Admin Product read endpoint | `GET /api/v1/products/:id` | Authenticated, permission-gated oversight GET. No separate cross-vendor Product detail page was found in the UI. |

The supplied example IDs are relationship examples only. Service checks described below, not the
sample IDs, establish the intended ownership/category constraints.

## 3. Deal specification

### 3.1 Purpose and relationships

`Deal` represents one service offer associated with one Member (`vendorId`), one Branch
(`branchId`), and one required top-level `SERVICE` Category (`categoryId`). Optional
`subcategoryId` identifies a category descendant accepted by the category/branch access checks.
Deal does not wrap a Product.

`DealPackage` stores the customer's selectable duration and prices. `DealTherapist` is an
explicit many-to-many join from Deal to Therapist. The service validates every linked Therapist
belongs to the same Member and Branch; the database does not implement that compound ownership
rule as a constraint.

### 3.2 Admin create/edit UI

**Create/edit route:** `/account/members/:vendorId/deals/new` and
`/account/members/:vendorId/deals/:dealId`.

The rendered page is divided into:

1. **Branch & Category** — Branch is selected first. Category/Subcategory options are populated
   from the selected Branch's category-access map. Branch is not changeable in edit mode.
2. **Details** — Title and Slug (required); Short description, Description, Notes, Policy, and
   Terms & Conditions.
3. **Pricing** — package repeater. At least one package is required; each package includes
   duration, selling price, and optional original price.
4. **Therapists** — select existing Therapists from the selected Branch, or create one inline
   using Therapist Type and Person Name.

The form validates Branch, Title, Slug, Category, package count, positive package duration,
non-negative selling price, and original package price >= selling price. API validation remains
authoritative. Optional empty strings are generally represented as `undefined` in the request
object, so JSON serialization omits those keys. `therapistIds` is sent as an array, including
`[]` if none are selected.

The Deal's top-level `durationMinutes`, `salePrice`, and `originalPrice` are not entered
independently. The frontend takes them from the package with the lowest `sellingPrice`; the
service then synchronizes them from the cheapest **active** package after inserting package
rows. If the cheapest package is inactive, the service's active-package selection determines the
stored cache instead of the frontend's unrestricted minimum. The form normally creates packages
active by default.

**Not rendered/submitted by this form:** `discountPercent`, legacy `images`, start/end dates,
booking limits, status, approval state, and media upload controls. Status and approval have
separate API operations.

### 3.3 Deal request contract and validation

Admin call:

```http
POST /api/v1/vendors/:vendorId/branches/:branchId/deals
```

The client sends `DealInput`, with IDs for the Member and Branch in the URL, not the JSON body.
The route requires `vendors.deals:create`, authenticates the request, and validates the body with
`DealCreateSchema`.

| Request key | API validation | Form behavior |
|---|---|---|
| `categoryId` | Required UUID | Required Branch-scoped Category select. |
| `subcategoryId` | Optional UUID | Optional; omitted if blank. |
| `title` | Required string, 1–200 chars | Required text input; trimmed only for empty check, submitted as entered. |
| `slug` | Required string, length 2–160, lowercase kebab-case | Required text input; entered by staff, not generated in this form. |
| `shortDescription` | Optional string, max 300 | Optional; empty value omitted. |
| `description` | Optional string, max 5,000 | Optional textarea; empty omitted. |
| `notes`, `policy` | Optional strings, each max 5,000 | Optional textareas; empty omitted. |
| `termsAndConditions` | Optional string, max 5,000 | Optional textarea; empty omitted. |
| `originalPrice`, `salePrice` | Required decimal **strings**, unsigned digits with optional decimal fraction of 1–2 places | Derived from cheapest package, converted using `String(number)`. |
| `durationMinutes` | Optional integer 1–1,440; service asserts required for a service Deal | Derived from cheapest package. |
| `discountPercent` | Optional integer 0–100 | Not displayed or sent by this Admin form. No computation occurs in create service. |
| `packages` | Required by create refinement to contain >=1; each item has positive integer duration, selling price >=0, optional original >=0, optional active flag, optional sort order >=0, optional UUID `id`; original >= selling | Repeater; durations/prices are numbers; package list is sent in JSON. |
| `therapistIds` | Optional array of UUIDs; service verifies Member+Branch alignment | Selected IDs are sent as an array; `[]` means none. |
| `images` | Optional array of valid URLs | Not sent by this form. |
| `maxBookings`, `availableBookings` | Optional non-negative integers | Not displayed or sent. |
| `startDate`, `endDate` | Optional ISO datetime strings | Not displayed or sent. |

The create schema refines packages to at least one and enforces each package's optional original
price to be no lower than selling price. The create schema's top-level decimal regex does not
itself require a positive amount; the package prices allow zero. Do not infer a stricter
price-minimum rule than the code provides.

### 3.4 Deal persistence and service rules

The route passes `req.params.vendorId`, `req.params.branchId`, the validated body, and
`actorIsAdmin=true` to `vendorService.createDeal`. The service:

1. Verifies the Branch exists and belongs to the Member.
2. Checks the category/subcategory relationship and vendor/branch SERVICE-category access.
3. Requires a duration for the service offering.
4. Verifies every supplied Therapist belongs to that same Member and Branch.
5. Checks the slug and translates database uniqueness races into a conflict.
6. In one Prisma transaction creates the Deal, package rows, and unique therapist links.
7. Sets Admin-created Deal status to `ACTIVE` and approval to `APPROVED`.
8. Re-reads the Deal with category/subcategory, packages, media, and Therapist link data; flattens
   the join rows into `therapists[]`.

The Member self-service endpoint calls the same service with `actorIsAdmin=false`, so new
self-service Deals start `DRAFT`/`PENDING` and notify Super Admins. The defaults differ by
caller; a sample `ACTIVE`/`APPROVED` response is consistent with the Admin-on-behalf route.
Public visibility requires the approved/active Deal and active Member and Branch.

### 3.5 Deal schema and nested models

Prisma model is `Deal`; monetary columns are `Decimal @db.Decimal(10,2)`. Dates are `DateTime?`;
`images` is `Json?`. No physical `@@map` is declared for Deal.

| Prisma field | Type / nullable | Default or constraint | Meaning / response notes |
|---|---|---|---|
| `id` | String, required | UUID default; primary key | Deal ID. |
| `vendorId` | String, required | FK Member; indexed; `onDelete: Cascade` | Owner Member; route path supplies it. |
| `branchId` | String, required | FK Branch; indexed; `onDelete: Cascade` | One Branch; route path supplies it. |
| `categoryId` | String, required | FK Category | Required primary category. |
| `subcategoryId` | String? | Optional Category relation | Null when absent; relation is optional. |
| `title` | String | Required | Display title. |
| `slug` | String | Required, unique | Unique identifier; public detail lookup is by UUID, not slug. |
| `shortDescription`, `description` | String? | Nullable | Short/full copy. |
| `originalPrice`, `salePrice` | Decimal(10,2) | Required | Synced display/list cache from cheapest active package; JSON Decimal values serialize as strings. |
| `discountPercent` | Int? | Nullable, no default | Explicit percentage; no backend computation on create. |
| `termsAndConditions`, `notes`, `policy` | String? | Nullable | Optional copy. |
| `images` | Json? | Nullable | Legacy URL array; not the current uploaded-media relation. |
| `maxBookings`, `availableBookings` | Int? | Nullable | Optional count fields; form does not expose them. |
| `startDate`, `endDate` | DateTime? | Nullable | Optional time bounds; form does not expose them. |
| `status` | `DealStatus` | `DRAFT` | `DRAFT`, `ACTIVE`, `INACTIVE`, `EXPIRED`; Admin service overrides on create. |
| `approvalStatus` | `DealApprovalStatus` | `PENDING` | `PENDING`, `APPROVED`, `REJECTED`; Admin service overrides on create. |
| `approvalRejectionReason` | String? | Nullable | Rejection details. |
| `durationMinutes` | Int? | Nullable | Synced default-duration cache; package rows carry selectable durations. |
| `createdAt`, `updatedAt` | DateTime | `now()`, `@updatedAt` | Timestamps. |

Indexes: `vendorId`, `branchId`, and `status`; unique `slug`.

| Related model | Important fields/constraints | Relationship |
|---|---|---|
| `DealPackage` | UUID ID, `dealId`, integer duration, selling price `Decimal(10,2)`, optional original price `Decimal(10,2)`, `isActive=true`, `sortOrder=0`, timestamps; unique `(dealId,durationMinutes)`, index `dealId`. | One Deal to many packages; Deal deletion cascades. |
| `DealTherapist` | UUID ID, `dealId`, `therapistId`, timestamp; unique pair, indexes on both IDs. | Explicit many-to-many; join deletion cascades to either side; same-Branch/Membership is enforced in service, not by a compound FK. |
| `DealImage` | ID, `dealId`, storage key, filename?, mime type, size, sort order default 0, primary default false, timestamps, index. | One Deal to many images; cascade on Deal deletion; migration enforces at most one primary image per Deal. |
| `DealVideo` | ID, unique `dealId`, storage key, filename?, mime type, size, timestamps. | Optional one-to-one; cascade on Deal deletion. |

Category/subcategory relations are declared without an explicit cascade action; do not describe
them as cascading. Deal's Member and Branch relations explicitly cascade.

### 3.6 Deal response, detail, and list UI

Create route returns HTTP 201 and `{ data: deal, error: null }`. The Admin service response
includes Deal scalar fields, Category/Subcategory `{id,name}`, all Deal packages ordered by
duration/sort order, Deal media rows/video, and `therapists[]` flattened to `{id,personName,
therapistType,isActive}`. This differs from public detail response selection and list projections.

The Admin edit page does not use a single-item GET. It calls the Member-wide Deal list
`GET /api/v1/vendors/:vendorId/deals`, finds `dealId`, and initializes form state. It navigates
back to the same `.../deals/:dealId` edit route after save; that route is a form, not a read-only
Deal detail screen. The Member Detail Deals tab displays title, branch, category, price, linked
Therapist count, and status. The cross-vendor list displays the fields in §2.3 and deep-links to
the Member.

The public detail endpoint `GET /api/v1/catalog/deals/:id` uses a UUID and a visibility filter.
Its allow-listed response contains ID, title, slug, descriptions, notes, policy, terms, cached
prices/duration/discount, legacy images, category/subcategory, limited Member and Branch data,
active package rows, media, and popular tags. It omits status/approval metadata, booking counts,
date bounds, and Therapist links.

Public Deal detail actually displays title, category, Member badge/link, package selector,
selected price/original/discount, media gallery/video, description, notes, policy,
terms/cancellation content, Branch address/directions/opening hours, quantity, cart and wishlist
actions, and related Deals. It does **not** display linked Therapists. Public visibility is
enforced by the API; missing or invisible Deals return 404.

### 3.7 Deal API endpoints relevant to Admin/detail

| Method/path | Permission | Use and response |
|---|---|---|
| `GET /api/v1/vendors/deals` | `vendors.deals:view` | Cross-vendor list; `{data,meta:{total,page,pageSize}}`; used by `/account/deals`. |
| `GET /api/v1/vendors/:vendorId/deals` | `vendors.deals:view` | Member-wide admin read list, includes branches and offerings; used by form edit loader and Member list. |
| `GET /api/v1/vendors/:vendorId/branches/:branchId/deals` | `vendors.deals:view` | Branch list. |
| `POST /api/v1/vendors/:vendorId/branches/:branchId/deals` | `vendors.deals:create` | Admin-on-behalf create; HTTP 201. |
| `PATCH /api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId` | `vendors.deals:edit` | Update scalar fields; optional packages and therapist IDs replace full sets when present. |
| `PATCH .../:dealId/status` | `vendors.deals:status_change` | Status change. |
| `PATCH .../:dealId/approve`, `PATCH .../:dealId/reject` | `vendors.deals:approve` / `vendors.deals:reject` | Approval actions; reject body carries `rejectionReason`. |
| `DELETE /api/v1/vendors/:vendorId/branches/:branchId/deals/:dealId` | `vendors.deals:delete` | Hard delete, with service constraints for history. |
| `GET /api/v1/catalog/deals`, `GET /api/v1/catalog/deals/:id` | Public | Public list/detail, separate select/visibility contract. |

Category options are fetched through vendor category/access endpoints; Branches are fetched by
Member; Therapists are loaded from the Member-wide Therapist endpoint and filtered by
`branchId` in the UI. No admin-on-behalf Deal image/video route was found in the inspected
`vendors.routes.ts`; self-service media routes do not imply admin form support.

## 4. Product specification

### 4.1 Purpose and relationships

`Product` is a direct purchasable retail entity with one required Member, one required primary
Category of type `PRODUCT`, and optional Subcategory. It has no `branchId`, no Deal relation,
and no stock quantity, SKU, inventory table, or inventory relation in the inspected schema.
`brand` is a plain string, not a Brand model.

### 4.2 Admin create/edit UI

**Create/edit routes:** `/account/members/:vendorId/products/new` and
`/account/members/:vendorId/products/:productId`.

The visible fields are Category; optional Subcategory and Type cascade; Name; Slug; Brand; Price;
Original price; Discount %; Badge; Summary; Description; Ingredients; Return policy; New; and
Featured. Name, slug, category, and price are required by the form. Category data is sourced from
active `PRODUCT` categories; `resolveCategoryTiers` maps the selected descendant to the request's
single `subcategoryId`. The form does not expose a Branch picker.

Empty optional string fields are converted to `undefined`, so they are omitted from serialized
JSON. Discount is converted from a non-empty text value to a number; `isNew` and `isFeatured` are
booleans. Slug is typed by the staff member, not automatically generated. Success navigates to
the Product edit route.

**Not rendered/submitted:** `benefits`, `howToUse`, legacy `image`, `gallery`, `imageAlt`,
uploaded image/video controls, and `isActive`. Product media upload routes exist in the API but
this create/edit page does not call them. Active status is managed separately.

On edit, the form fetches `GET /api/v1/vendors/:vendorId/products?pageSize=100` and searches the
returned rows locally; no single-item endpoint is used. The client-side loader can fail to find a
record outside the first 100 rows unless pagination behavior is otherwise changed.

### 4.3 Product request contract and validation

Admin call:

```http
POST /api/v1/vendors/:vendorId/products
```

The Member ID is in the URL, not the request body. The route requires
`vendors.products:create`, validates the UUID path parameter and applies `ProductCreateSchema`.

| Request key | API validation | Form behavior |
|---|---|---|
| `name` | Required string, 1–200 chars | Required text field. |
| `slug` | Required string, 2–160 chars, lowercase kebab-case | Required text field; not auto-generated. |
| `brand` | Optional string, max 150 | Optional text field; blank omitted. |
| `categoryId` | Required UUID | Required top-level Product Category selection. |
| `subcategoryId` | Optional UUID | Optional Subcategory/Type selection; blank omitted. |
| `description` | Optional string, max 5,000 | Optional; blank omitted. |
| `summary` | Optional string, max 2,000 | Optional; blank omitted. |
| `benefits`, `howToUse` | Optional string arrays; each entry max 300 | Accepted by API but not shown/submitted by this form. |
| `ingredients` | Optional string, max 3,000 | Optional; blank omitted. |
| `returnPolicy` | Optional string, max 2,000 | Optional; blank omitted. |
| `image` | Optional URL | Not in form request. |
| `gallery` | Optional array of URLs | Not in form request. |
| `imageAlt` | Optional string, max 300 | Not in form request. |
| `badge` | Optional string, max 50 | Optional text field; blank omitted. |
| `price` | Required decimal string; digits with optional decimal 1–2 places | Required text input; submitted as string. |
| `originalPrice` | Optional decimal string using same regex | Optional text input; no comparison validation to `price`. |
| `discount` | Optional integer 0–100 | Number conversion; no computation from the prices. |
| `isNew`, `isFeatured` | Optional booleans | Always submitted as checkbox booleans. |

The Product schema does not require `originalPrice >= price` and does not verify that
`discount` agrees with the difference between prices. The decimal regex disallows negative
values but accepts zero. Unknown form fields are not a substitute for an API schema field.

### 4.4 Product persistence and service rules

`POST /:vendorId/products` calls `productService.createProduct(vendorId, req.body)`. It checks
slug availability, checks that `subcategoryId` is below the selected category, and verifies that
the primary category is a Product category. It inserts `{...input, vendorId}` and includes
Category/Subcategory, ProductImage rows, and ProductVideo. Unique-slug database races are
translated to conflict errors.

Prisma defaults supply `isNew=false`, `isFeatured=false`, and `isActive=true` if absent. The
Admin form sends `isNew` and `isFeatured`, but not `isActive`. Product discount is persisted
as sent; there is no price-derived discount calculation in this create service.

### 4.5 Product Prisma schema and related media

Prisma model is `Product`; it has no `@@map`. Monetary fields are
`Decimal @db.Decimal(10,2)`; `benefits`, `howToUse`, and `gallery` are nullable JSON fields.

| Prisma field | Type / nullable | Default or constraint | Meaning / response notes |
|---|---|---|---|
| `id` | String, required | UUID default; primary key | Product ID. |
| `name` | String | Required | Display name. |
| `slug` | String | Required, unique | Stored slug; inspected detail API is UUID-based. |
| `brand` | String? | Nullable | Plain label. |
| `categoryId` | String, required | FK Category; indexed | Required primary category. |
| `subcategoryId` | String? | Optional Category relation | Optional descendant. |
| `description`, `summary` | String? | Nullable | Detail copy. |
| `benefits`, `howToUse` | Json? | Nullable | Intended string arrays per schema comments; API schema accepts arrays; Admin form omits them. |
| `ingredients`, `returnPolicy` | String? | Nullable | Optional metadata; omitted from the public detail select. |
| `image`, `imageAlt` | String? | Nullable | Legacy single URL and alternative text. |
| `gallery` | Json? | Nullable | Legacy URL array. |
| `badge` | String? | Nullable | Optional catalog label. |
| `price` | Decimal(10,2) | Required | Direct Product price. |
| `originalPrice` | Decimal(10,2)? | Nullable | Optional comparison price. |
| `discount` | Int? | Nullable | Optional manually supplied percentage; no consistency constraint. |
| `isNew`, `isFeatured` | Boolean | Default false | Catalog flags. |
| `isActive` | Boolean | Default true | Public availability flag; separate status endpoint. |
| `vendorId` | String, required | FK Member; indexed; `onDelete: Cascade` | Owning Member; route path supplies it. |
| `createdAt`, `updatedAt` | DateTime | `now()`, `@updatedAt` | Timestamps. |

Unique/indexes: unique `slug`; indexes on `categoryId` and `vendorId`. Category relations have
no explicit cascade action in the model; Member deletion is explicitly cascading.

| Related model | Important fields/constraints | Relationship |
|---|---|---|
| `ProductImage` | ID, product ID, storage key, optional filename, mime type, size, sort order default 0, `isPrimary=false`, timestamps; index on product ID. | One Product to many images; cascades with Product; migration enforces at most one primary image. |
| `ProductVideo` | ID, unique product ID, storage key, optional filename, mime type, size, timestamps. | Optional one-to-one; cascades with Product. |

### 4.6 Product response, detail, and list UI

Admin create returns HTTP 201 and `{data: product, error: null}`. `CATEGORY_INCLUDE` includes
Category/Subcategory `{id,name}`, ordered media image records, and optional video. Optional
columns not supplied can serialize as `null`; no media rows produce `mediaImages: []` and no
video produces `mediaVideo: null`. `isActive=true` follows the Prisma default.

`/account/products` is an authenticated, permission-protected, cross-vendor read-only overview.
Its observed columns are Name, Vendor, Brand, Category, Subcategory, Price, Discount, Status;
it supports search/status filtering and does not offer Add/Edit/Delete. The backend
`GET /api/v1/products/:id` exists for permission-gated oversight reads and returns the broader
admin Product shape, but the inspected oversight page does not navigate to a Product detail
screen.

The Member detail Product list displays Name, Brand, Category, Price, Status and has edit/status
actions. Its Product edit page loads the Member list, not the oversight GET.

Public `GET /api/v1/catalog/products/:id` returns a different allow-list: identity/name/slug,
brand, description/summary, legacy image/imageAlt, price/originalPrice/discount,
Category/Subcategory, limited Member fields, media, and popular tags. It omits
`benefits`, `howToUse`, `ingredients`, `returnPolicy`, `badge`, `isNew`, `isFeatured`, and
`isActive`.

The customer Product detail page renders gallery/video, brand, Member badge/link, name, price,
original price, discount, description (fallback `summary`), quantity, cart action, and related
Products. It does not show category, ingredients, return policy, benefits, how-to-use, badge,
new/featured flags, or inventory data. It also renders a static “In stock”/availability claim
and structured-data availability without a corresponding stock field or stock check in the
Product schema; availability is not evidence of managed inventory.

### 4.7 Product API endpoints relevant to Admin/detail

| Method/path | Permission | Use and response |
|---|---|---|
| `GET /api/v1/products` | `products:view` | Cross-vendor read-only oversight list; paginated and searchable. |
| `GET /api/v1/products/:id` | `products:view` | Admin oversight read; UUID; Member owners are scoped to their own Member, staff can read cross-vendor records subject to permission. |
| `GET /api/v1/vendors/:vendorId/products` | `vendors.products:view` | Member-scoped list with pagination/search/category/subcategory/status; returns data plus total/page metadata. |
| `POST /api/v1/vendors/:vendorId/products` | `vendors.products:create` | Admin-on-behalf create; HTTP 201. |
| `PATCH /api/v1/vendors/:vendorId/products/:productId` | `vendors.products:edit` | Member-scoped update. |
| `PATCH /api/v1/vendors/:vendorId/products/:productId/status` | `vendors.products:edit` | `{isActive:boolean}` status update. |
| `DELETE /api/v1/vendors/:vendorId/products/:productId` | `vendors.products:delete` | Member-scoped delete. |
| `POST /api/v1/vendors/:vendorId/products/:productId/images` | `vendors.products:edit` | Separate uploaded-media route; returns image record. |
| `DELETE .../images/:imageId`, `PATCH .../images/reorder`, `PATCH .../images/:imageId/primary` | `vendors.products:edit` | Separate media management. |
| `POST .../video`, `DELETE .../video` | `vendors.products:edit` | Separate Product video management. |
| `GET /api/v1/catalog/products`, `GET /api/v1/catalog/products/:id` | Public | Public list/detail with smaller visibility-filtered select. |

Product category list is obtained with the authenticated category client and filtered to
`PRODUCT`; it is not a Product media or response call.

## 5. Complete field mapping tables

Status labels in these tables describe evidence, not severity: **MATCH** means the mapped
value reaches persistence as expected; **TRANSFORMED CORRECTLY** covers validated conversion or
derivation; **OPTIONAL / INTENTIONALLY NULL** means absence is accepted; **NOT DISPLAYED IN UI**
and **UI FIELD NOT SUBMITTED** identify fields with no corresponding Admin control/request;
**RESPONSE ONLY** identifies relation/metadata returned by API rather than entered directly.

### 5.1 Deal scalar fields

| Field / UI label | UI component / frontend property | Request key | Validation | Prisma target | Response path / list/detail display | Status |
|---|---|---|---|---|---|---|
| Member | route parameter `vendorId` | URL `:vendorId` | UUID route validation on relevant scoped routes | `Deal.vendorId` | Admin response; Member-wide list; public limited vendor object | TRANSFORMED CORRECTLY; server uses path value. |
| Branch | Branch select, `form.branchId` | URL `:branchId` | Must exist and belong to Member | `Deal.branchId` | Admin branch object; list column | TRANSFORMED CORRECTLY; service scope check. |
| Category | Category select, `form.categoryId` | `categoryId` | UUID; SERVICE access; branch mapping | `Deal.categoryId` | `category`, `category.name` in list/detail | MATCH. |
| Subcategory | optional select, `form.subcategoryId` | `subcategoryId` | Optional UUID; child/branch access validation | `Deal.subcategoryId` | `subcategory` object | OPTIONAL / INTENTIONALLY NULL. |
| Title | Title text, `form.title` | `title` | 1–200 chars | `Deal.title` | Response; list; public detail heading | MATCH. |
| Slug | Slug text, `form.slug` | `slug` | 2–160 lower-kebab; unique | `Deal.slug` | Response; not the public detail lookup key | MATCH; staff-entered. |
| Short description | optional text, `form.shortDescription` | `shortDescription` | Max 300 | `Deal.shortDescription` | Public response; detail fallback | OPTIONAL / INTENTIONALLY NULL. |
| Description | optional textarea, `form.description` | `description` | Max 5,000 | `Deal.description` | Public response; detail content | OPTIONAL / INTENTIONALLY NULL. |
| Notes | optional textarea, `form.notes` | `notes` | Max 5,000 | `Deal.notes` | Public response; detail accordion | OPTIONAL / INTENTIONALLY NULL. |
| Policy | optional textarea, `form.policy` | `policy` | Max 5,000 | `Deal.policy` | Public response; detail accordion | OPTIONAL / INTENTIONALLY NULL. |
| Terms & Conditions | optional textarea, `form.termsAndConditions` | `termsAndConditions` | Max 5,000 | `Deal.termsAndConditions` | Public response; conditional detail accordion | OPTIONAL / INTENTIONALLY NULL. |
| Original price | Derived from minimum selling-price package | `originalPrice` | Required decimal string, max 2 decimals | `Deal.originalPrice` Decimal(10,2) | Response and public price; cache resynced from cheapest active package | TRANSFORMED CORRECTLY; not independently entered. |
| Sale price | Derived from minimum selling-price package | `salePrice` | Required decimal string, max 2 decimals | `Deal.salePrice` Decimal(10,2) | Response, list, public display/sort | TRANSFORMED CORRECTLY; cache resynced from cheapest active package. |
| Duration | Derived from selected package | `durationMinutes` | Optional 1–1,440 integer; service asserts required | `Deal.durationMinutes` Int? | Admin response/list and public fallback/cache | TRANSFORMED CORRECTLY. |
| Discount % | No form control | `discountPercent` | Optional integer 0–100 | `Deal.discountPercent` Int? | Public response; detail uses value or computes display fallback | NOT DISPLAYED IN UI / UI FIELD NOT SUBMITTED; not server-calculated. |
| Images URL array | No form control | `images` | Optional URL array | `Deal.images` Json? | Public response, legacy media fallback | UI FIELD NOT SUBMITTED; uploaded image relation separate. |
| Maximum bookings | No form control | `maxBookings` | Optional non-negative integer | `Deal.maxBookings` Int? | Admin data; omitted by public detail select | NOT DISPLAYED IN UI. |
| Available bookings | No form control | `availableBookings` | Optional non-negative integer | `Deal.availableBookings` Int? | Admin data; omitted by public detail select | NOT DISPLAYED IN UI. |
| Start/end dates | No form control | `startDate`, `endDate` | Optional ISO datetime | `Deal.startDate`, `Deal.endDate` | Admin data; omitted by public detail select | NOT DISPLAYED IN UI. |
| Status | Separate controls/actions | Not in create body | Enum `DRAFT/ACTIVE/INACTIVE/EXPIRED` | `Deal.status` | Admin list badge; public visibility filter | DATABASE DEFAULT is overridden by Admin service. |
| Approval | Separate approve/reject APIs | Not in create body | Enum `PENDING/APPROVED/REJECTED` | `Deal.approvalStatus` | Admin oversight list; public visibility filter | DATABASE DEFAULT is overridden by Admin service. |
| Rejection reason | No create form control | No create key | Optional string | `Deal.approvalRejectionReason` | Admin approval workflow | NOT DISPLAYED IN CREATE UI. |
| IDs/timestamps | Not editable | Generated | Prisma UUID/timestamp defaults | `id`, `createdAt`, `updatedAt` | Response; Created in oversight list | GENERATED BY BACKEND / DATABASE DEFAULT. |

### 5.2 Deal packages and therapist associations

| Nested field | UI / frontend source | Request key and type | Validation / persistence | Response and UI use | Status |
|---|---|---|---|---|---|
| Package `id` | Existing row only on edit | `packages[].id` UUID optional | Determines update vs new row during update | Included in response; not user-editable | RESPONSE/EDIT ONLY. |
| Duration | Number input, default 30 on new package | `packages[].durationMinutes` number | Positive integer; unique per Deal in DB | Response; customer duration selector | MATCH. |
| Selling price | Number input, initial 0 | `packages[].sellingPrice` number | >=0; Decimal(10,2) DB | Response; customer selected price | MATCH. |
| Original price | Optional number input | `packages[].originalPrice` number? | >=0 and >= selling price | Response; selected comparison price | OPTIONAL / INTENTIONALLY NULL. |
| Active | Default true in service | `packages[].isActive` optional boolean | DB default true; create service fills true | Public detail returns active packages only | DATABASE DEFAULT. |
| Sort order | Not independently rendered in create form | `packages[].sortOrder` optional integer | >=0, DB default 0 | Admin response ordering | DATABASE DEFAULT / UI FIELD NOT SUBMITTED. |
| Therapist ID | Branch-filtered checkbox selection | `therapistIds[]` UUID[] | Service requires Member+Branch match; duplicate IDs deduplicated | Admin response flattened to `therapists[]`; omitted by public select | MATCH; service-enforced association. |
| Therapist details | Inline create only exposes Type and Person Name | Separate Therapist create request, then ID added to Deal array | Same-Branch Therapy access checks apply | Admin list count/selected therapist names | Separate entity and request. |

### 5.3 Product fields

| Field / UI label | UI component / frontend property | Request key | Validation | Prisma target | Response path / list/detail display | Status |
|---|---|---|---|---|---|---|
| Member | route parameter `vendorId` | URL `:vendorId` | UUID path validation | `Product.vendorId` | Admin response/list; limited public vendor | TRANSFORMED CORRECTLY; server takes path. |
| Category | Category select | `categoryId` | Required UUID; primary Category must be PRODUCT | `Product.categoryId` | Admin/public Category object; Admin list | MATCH. |
| Subcategory | Subcategory/Type cascade | `subcategoryId` | Optional UUID; must be category descendant | `Product.subcategoryId` | Admin/public Subcategory object; Admin oversight list | OPTIONAL; selected tier maps into one key. |
| Name | Name text | `name` | 1–200 chars | `Product.name` | Admin response/list; public detail heading | MATCH. |
| Slug | Slug text | `slug` | 2–160 lower-kebab; globally unique | `Product.slug` | Response/list search; public detail lookup remains ID | MATCH; staff-entered. |
| Brand | Brand text | `brand` | Optional max 150 | `Product.brand` | Admin list and public detail badge | OPTIONAL / INTENTIONALLY NULL. |
| Price | Price text | `price` string | Required unsigned decimal string, <=2 decimals | `Product.price` Decimal(10,2) | Response/list/public detail | MATCH; JSON decimal is string. |
| Original price | Original price text | `originalPrice` string? | Optional decimal string; no relation-to-price rule | `Product.originalPrice` Decimal? | Response/list not in Member list; public comparison price | OPTIONAL / INTENTIONALLY NULL. |
| Discount % | Number input | `discount` number? | Optional integer 0–100 | `Product.discount` Int? | Admin oversight and public display | TRANSFORMED CORRECTLY; manually entered, not derived. |
| Badge | Badge text | `badge` | Optional max 50 | `Product.badge` String? | Admin response; not public select/detail UI | NOT DISPLAYED IN PUBLIC DETAIL. |
| Summary | Summary text | `summary` | Optional max 2,000 | `Product.summary` String? | Public detail fallback | OPTIONAL. |
| Description | Description text | `description` | Optional max 5,000 | `Product.description` String? | Public detail, fallback to summary | OPTIONAL. |
| Ingredients | Ingredients text | `ingredients` | Optional max 3,000 | `Product.ingredients` String? | Admin response; public select omits it | NOT DISPLAYED IN PUBLIC DETAIL. |
| Return policy | Return policy text | `returnPolicy` | Optional max 2,000 | `Product.returnPolicy` String? | Admin response; public select omits it | NOT DISPLAYED IN PUBLIC DETAIL. |
| Benefits / How to use | No form controls | `benefits[]`, `howToUse[]` | Optional arrays; each string max 300 | Nullable JSON columns | Not in public select/detail | UI FIELD NOT SUBMITTED. |
| Legacy image | No form control | `image` | Optional URL | `Product.image` String? | Public API and media fallback | UI FIELD NOT SUBMITTED. |
| Legacy gallery | No form control | `gallery` | Optional URL array | `Product.gallery` Json? | Not in current public select; resolver compatibility | UI FIELD NOT SUBMITTED. |
| Image alt text | No form control | `imageAlt` | Optional max 300 | `Product.imageAlt` String? | Public API image alt | UI FIELD NOT SUBMITTED. |
| Uploaded images/video | No controls or upload call on this page | Separate media endpoints, not create JSON | Upload middleware/service; ProductImage/ProductVideo | Admin create include and public media select | NOT DISPLAYED IN CREATE/EDIT UI; API support exists. |
| New / Featured | Checkbox controls | `isNew`, `isFeatured` boolean | Optional booleans | Boolean defaults false | Admin response; excluded from public select/detail | MATCH; explicit values sent. |
| Active | Separate status action | No create key | Boolean | `Product.isActive` default true | Admin status badges and public filter | DATABASE DEFAULT; status changed separately. |
| IDs/timestamps | Not editable | Generated | Prisma defaults | `id`, timestamps | Response | GENERATED BY BACKEND / DATABASE DEFAULT. |

## 6. Sample request and response observations

### 6.1 Supplied Deal example

The supplied example states the following sample request values. It is a subset/reference list,
not a reconstructed, independently captured HTTP body:

| Key | Supplied sample value |
|---|---|
| `vendorId` (path) | `f7d84747-f26b-4549-84cf-31fa864066b4` |
| `branchId` (path) | `c5deade0-b112-4c9d-8e3d-cac184d077ba` |
| `categoryId` | `5a7db456-ae95-43a8-a22f-c39d4192df58` |
| `subcategoryId` | `fdae127b-765c-4515-b970-47e64f7c52ee` |
| `title`, `slug` | `Luxury Swedish Full Body Massage`; `luxury-swedish-full-body-massage-noida-sec2` |
| `originalPrice`, `salePrice` | `"799"`, `"499"` (strings as supplied) |
| `durationMinutes` | `30` (number) |
| `therapistIds` | Array containing `fa2eed7f-050c-48ea-b0d1-74489affba47` |
| `packages` | Array of objects with duration, selling price, original price; sample did not provide numeric package values in the prompt. |

**Sample-reported response:** `status=ACTIVE`, `approvalStatus=APPROVED`,
`discountPercent=null`, `images=null`, empty `mediaImages`, null booking/date values, a package
with ID and `dealId`, and the selected Therapist in `therapists[]`. The status pair matches the
Admin create service. `discountPercent` remains null because it is optional and is not calculated
in Deal create logic. Null legacy images and empty uploaded-media relations are separate storage
surfaces, not contradictory. Null booking/date values are permitted if omitted. The supplied
summary does not provide complete nested response bodies, so no missing values are invented here.

### 6.2 Supplied Product example

The supplied example gives these request values; descriptions are not reproduced because their
full text was not part of the attached summary:

| Key | Supplied sample value |
|---|---|
| `vendorId` (path) | `f7d84747-f26b-4549-84cf-31fa864066b4` |
| `name`, `slug`, `brand` | `Radiance Glow Vitamin C Face Serum (30ml)`; `radiance-glow-vitamin-c-face-serum-30ml`; `Aura Botanicals` |
| `categoryId`, `subcategoryId` | `bc39439b-5364-47cd-8f7f-fe17c5469df0`; `a41f14ad-61d1-4cd0-969e-11fc12254662` |
| `price`, `originalPrice`, `discount` | `"710"`, `"799"`, `10` |
| `badge`, `isNew`, `isFeatured` | `hot`, `true`, `false` |
| Optional content | Description, summary, ingredients, return policy supplied in the example. |

**Sample-reported response:** `benefits`, `howToUse`, `image`, `gallery`, and `imageAlt` are null;
`mediaImages=[]`, `mediaVideo=null`, `isActive=true`, and Category/Subcategory objects are
included. These values align with an omitted optional input and Product Prisma defaults.
`discount=10` is a manually supplied integer; the service does not calculate it. The price
difference of 799 to 710 would round to about 11% if a formula were applied, but the API has no
consistency rule that requires such a formula. Whether the business expects auto-calculation is
a confirmation item, not a proven defect.

### 6.3 Response envelope and example shape

Routes use `sendData`: success is HTTP 200 or HTTP 201 as appropriate and
`{ "data": <resource>, "error": null }`; paginated lists add `meta`. Decimal database fields
serialize as JSON strings. A Zod or service error is represented by
`{ "data": null, "error": { "code", "message", "details" } }`.

Illustrative **shape only**, not a live response:

```json
{
  "data": {
    "id": "<server-generated UUID>",
    "vendorId": "<Member ID from route>",
    "branchId": "<Branch ID from route for Deal only>",
    "categoryId": "<Category ID>",
    "subcategoryId": null,
    "status": "ACTIVE",
    "approvalStatus": "APPROVED",
    "mediaImages": [],
    "mediaVideo": null
  },
  "error": null
}
```

Do not treat this abbreviated shape as the complete Deal or Product schema. The Admin Deal
response includes packages and flattened therapist data; Product includes Category/Subcategory
and media relations. The public detail endpoints use their separate allow-lists.

## 7. Detail-page availability and display requirements

### 7.1 Deal

| Classification | Verified state |
|---|---|
| Already implemented | Public UUID detail route/API; title, category, Member/Branch, package selector/pricing, description, notes, policy, terms, media, location/opening hours, cart, wishlist, related Deals. |
| Admin details available | Member-scoped list includes branch/category, cached price, therapist count and status; cross-vendor list includes active package summary, starting price, approval status and creation date. |
| Present in Admin create response but not public detail | Approval fields, booking counters, date bounds, therapist associations. |
| Persisted/accepted but missing from Admin form | `discountPercent`, image URL list, booking limits, start/end date fields. Media relation also not managed by the inspected admin Deal form. |
| Present in database but not rendered in public detail | Linked Deal Therapists; their link is not in the public Deal select. |
| Confirmation needed | Whether Admin must manage Deal images/video, dates/booking limits/discount, show linked Therapists publicly, and whether approval should differ by create actor. |

### 7.2 Product

| Classification | Verified state |
|---|---|
| Already implemented | Public UUID detail route/API; title, brand, vendor, current/comparison price, discount, description/summary, legacy/uploaded media, quantity and cart, related Products. |
| Admin list/detail availability | Member list supports edit/status/delete; cross-vendor overview shows name/vendor/brand/category/subcategory/price/discount/status. Admin GET by ID exists, but the inspected overview has no record-detail navigation/page. |
| Persisted/API-supported but absent from create/edit form | `benefits`, `howToUse`, `image`, `gallery`, `imageAlt`, uploaded media controls, and `isActive` control. |
| Present in database but omitted from public API/detail | `benefits`, `howToUse`, `ingredients`, `returnPolicy`, `badge`, `isNew`, `isFeatured`, `isActive`. |
| Displayed without data-backed inventory support | “In stock” and structured-data InStock availability; no stock field/check was found in Product schema/service. |
| Confirmation needed | Whether these absent metadata/media controls should be part of staff UI; whether discount is manual or formula-driven; whether inventory exists outside the inspected model/services. |

The public pages do not display all data merely because it exists in the Admin response or
Prisma model. Public API allow-lists are authoritative for what the detail components can read.

## 8. Discrepancy and decision register

Severity here describes practical impact of the documented gap; it is not a security finding.

| ID | Area / feature | Expected vs actual | Evidence / impact | Severity | Recommendation / decision | Verification |
|---|---|---|---|---|---|---|
| DP-01 | Admin Deal media | DB media relations exist, but create/edit form has no media controls; inspected admin Deal routes have no matching scoped media upload block. Admin cannot manage that media from this page. | `deal-form-page.tsx`, `vendors.routes.ts`, DealImage/DealVideo schema. | Medium | Confirm whether staff needs media management; if yes, add scoped UI/routes under a separately authorized feature task. | Source-verified absence; no write test. |
| DP-02 | Deal date/booking/discount fields | Schema accepts optional fields but Admin create form does not show or submit them. Records can remain null. | Deal schema/form/service; public detail select omits booking/date fields. | Medium | Team Lead to confirm whether fields are intentionally out of the Admin form and whether enforcement is required. | Source-verified. |
| DP-03 | Deal approval status | Admin create sets Active/Approved; Member self-service sets Draft/Pending, despite DB defaults Draft/Pending. Public gate requires Approved. | `createDeal`, Admin route passes `true`; self-service route passes `false`; visibility filter. | High business-policy decision | Confirm intended approval policy and align planning/UI/API only after decision. | Source-verified; sample status independently unverified. |
| DP-04 | Deal Therapist display | Admin relationship exists and Admin service returns `therapists[]`; public select and public detail page omit it. | `OFFERING_INCLUDE`, `PUBLIC_DEAL_SELECT`, `deal-detail.tsx`. | Medium | Confirm if public Therapist attribution is required; do not change without product approval. | Source-verified. |
| DP-05 | Product metadata | API/schema have benefits/how-to-use/images/alt but form has no fields; Product detail public select omits metadata such as ingredients/return policy/badge as well. | Product schema, form, `PUBLIC_PRODUCT_SELECT`, detail component. | Medium | Confirm which fields belong in staff entry and customer detail; expand separately if required. | Source-verified. |
| DP-06 | Product media | API has vendor-scoped Product image/video endpoints; Admin create/edit page does not invoke them. | `vendors.routes.ts`, `product-form-page.tsx`. | Medium | Confirm expected staff media workflow; if required, connect uploader after ID creation and on edit. | Source-verified. |
| DP-07 | Product discount | Discount is manually accepted, stored as integer, and not checked against original/current price. Example 799/710 with discount 10 is permissible. | Product schema/service; Product form. | Low / business decision | Confirm manual merchandising value vs automatic percentage. Avoid silently changing existing data. | Source-verified behavior; supplied values sample-reported. |
| DP-08 | Product stock label | Public detail says “In stock” and Product JSON-LD advertises InStock, but Product model has no stock inventory field. | Product detail JSX and Product Prisma model/service. | Medium | Confirm unlimited-stock policy or inventory roadmap; align user-facing claim accordingly. | Source-verified absence in inspected flow. |
| DP-09 | Admin Product edit lookup | Edit loader fetches first 100 Member Products and finds target locally; a product outside that page may not be found. | `product-form-page.tsx`, paginated list endpoint. | Low | Consider a Member-scoped single-record read if catalog size makes this reachable. | Source-verified; scale scenario not runtime-tested. |
| DP-10 | Supplied example IDs | Their present existence and cross-record relationships were not checked. Service code enforces the intended association. | Supplied references are not database proof; no API write/read by these IDs was performed. | Not a defect | Use read-only database/API fixture checks only when an authorized environment and data scope are available. | Not runtime-verified. |

No issue is inferred from `null` alone where the field is optional or defaulted. In particular,
Deal `discountPercent=null`, Product optional JSON/media nulls, and active/approved Admin Deal
statuses agree with the applicable schema/service path.

## 9. Validation and test matrix

**Test execution status:** automated tests were not run for this documentation-only task. Existing
test files were located for the Admin Deal list, Product list, Deal form, Product form, and related
pages. The table reports **Not Run**, not Passed, for unexecuted cases.

| Scenario | Evidence/expected contract | Status |
|---|---|---|
| Valid Admin Deal create | Create route validates DealCreateSchema and returns 201; service persists Deal/packages/links transactionally. | Not Run |
| Missing Deal title/slug/category | Zod required/format checks; form has client-side required checks. | Not Run |
| Invalid Deal price string | Decimal string regex; package numeric price >=0. | Not Run |
| No Deal packages | Create schema refinement requires at least one. | Not Run |
| Package original < selling | Create schema and form reject. | Not Run |
| Duplicate Deal slug | Service conflict check plus unique DB constraint/race mapping. | Not Run |
| Invalid Member/Branch pairing | Service scoped Branch check denies foreign Branch. | Not Run |
| Invalid category/subcategory access | Category relation/type/branch access checked by service. | Not Run |
| Therapist from another Member/Branch | Service checks every Therapist ID against same vendor+branch. | Not Run |
| Deal optional images/dates/booking fields omitted | Optional schema/nullable DB fields; Admin form omits these keys. | Not Run |
| Deal create status/approval | Admin-on-behalf route passes `true` and service sets Active/Approved; member path differs. | Not Run |
| Deal media empty | Admin response include yields media relation shape; no actual create fixture used. | Not Run |
| Deal detail/list navigation | Public detail and Admin lists exist; no live record-specific navigation exercised. | Not Run |
| Valid Product create | Product schema and category/slug checks; Product service inserts with Member from path and returns relations. | Not Run |
| Missing Product name/slug/category/price | Required schema; form performs required checks. | Not Run |
| Invalid Product decimal/discount | Decimal regex and integer discount 0–100. | Not Run |
| Invalid Product category/subcategory | Service checks category type and parent-child relationship. | Not Run |
| Duplicate Product slug | Pre-check plus unique DB constraint/race mapping. | Not Run |
| Product original-price/discount consistency | No schema/service consistency rule exists; behavior intentionally accepts provided values unless business says otherwise. | Not Run |
| Product image/media omitted | Null legacy media fields and empty relation are permitted; create form does not upload media. | Not Run |
| Product active default | Prisma `isActive=true`; create form does not set it. | Not Run |
| Product detail/list navigation | Read-only oversight list and public detail route exist; no live sample record was opened. | Not Run |
| Unauthorized/cross-vendor requests | Authentication/permission middleware and service ownership checks exist. | Not Run |

Browser verification was limited to safe page loads and reading labels/table headers. No create
request, payload capture, live detail lookup for a supplied ID, or database query was performed.

## 10. Team Lead summary

The Deal model stores Member, Branch, Category/Subcategory, copy, cached price/duration,
discount, optional dates/booking fields, lifecycle state and timestamps. Its real customer
selectable offerings are `DealPackage` records; Therapists are linked by `DealTherapist`.
Admin-created Deals are Active/Approved, while Member self-service Deals are Draft/Pending.
The Admin form correctly creates packages and optional same-Branch Therapist links, but does not
currently collect media, discount percentage, dates, or booking limits.

The Product model is an independent Member-owned retail catalog item with category hierarchy,
copy/metadata, decimal prices, optional manual discount, flags, and separate image/video media
models. Product is not branch-bound and has no inventory fields. The Admin form does not collect
benefits/how-to-use or media; product media endpoints exist separately. The Product discount is
not auto-calculated.

The source confirms Admin create/edit pages, Member-scoped and cross-vendor lists, and public
customer detail pages. Product has an Admin oversight GET by ID but no corresponding record
detail page in the inspected oversight UI. Deal's Admin edit loader fetches a Member-wide list;
there is no single-Deal Admin detail GET. API create responses and public detail responses are
different contracts.

**Team Lead decisions before behavioral changes:** confirm the Deal approval policy; decide if
Deal date/booking/media/discount fields belong in staff UI; decide whether public Deal detail
should show linked Therapists; confirm Product field/media coverage and manual-vs-derived
discount; clarify the Product “In stock” claim given the absence of stock data. The supplied
examples' UUID existence, exact network payloads/responses, and actual persisted rows were not
independently verified.

## 11. Source references

Line anchors refer to the inspected repository snapshot; page and function names are included to
make the references discoverable if line numbers move.

### Frontend routes, forms, and API types

- [MSD route table](../../apps/msd/src/app/routes.tsx) — Admin and public route declarations.
- [Admin Deal form](../../apps/msd/src/app/pages/account/members/deal-form-page.tsx) — `DealFormPage`, save/payload construction around lines 320–360; visible fields in the render around lines 370–520.
- [Admin Product form](../../apps/msd/src/app/pages/account/members/product-form-page.tsx) — `ProductFormPage`, save/payload construction around lines 205–245; rendered fields around lines 245–320.
- [Member Deals list](../../apps/msd/src/app/pages/account/members/deals-list-page.tsx) — `DealsListPage`, columns and row mapping near the top.
- [Member Products list](../../apps/msd/src/app/pages/account/members/products-list-page.tsx) — `ProductsListPage`, columns and pagination/search.
- [Cross-vendor Deal list](../../apps/msd/src/app/pages/account/members/deal-list.tsx) — `DealList`, list fields and vendor deep-link.
- [Cross-vendor Product list](../../apps/msd/src/app/pages/account/products/products.tsx) — `ProductManagement`, read-only overview columns.
- [Admin Deal/Product API types and functions](../../apps/msd/src/api/rbac/vendors.ts) — `DealInput`, `DealPackageInput`, `createDeal`, `listVendorDealsForAdmin`, Product fields and vendor-scoped functions.
- [Product oversight API client](../../apps/msd/src/api/rbac/products.ts) — `Product`, `listProducts`, `getProduct`.
- [Public catalog API types](../../apps/msd/src/api/catalog.ts) — `CatalogDeal`, `CatalogProduct`, `getCatalogDeal`, `getCatalogProduct`.

### Backend routes, validation, and services

- [API app mount](../../apps/msd-api/src/app.ts) — API prefix and router mounts.
- [Vendor and Deal routes](../../apps/msd-api/src/routes/vendors.routes.ts) — Admin Deal create/update/status, Member-wide lists, Product admin-on-behalf CRUD/media.
- [Product oversight routes](../../apps/msd-api/src/routes/products.routes.ts) — `GET /products` and `GET /products/:id`.
- [Public catalog routes](../../apps/msd-api/src/routes/catalog.routes.ts) — public Deal/Product list/detail GETs.
- [Deal/Branch/Therapist Zod schemas](../../apps/msd-api/src/schemas/vendor.schema.ts) — `DealFieldsSchema`, `DealPackageFieldsSchema`, `DealCreateSchema`, `DealUpdateSchema`, status schemas.
- [Product Zod schemas](../../apps/msd-api/src/schemas/product.schema.ts) — `ProductFieldsSchema`, `ProductCreateSchema`, update/status schemas.
- [Vendor service](../../apps/msd-api/src/services/vendor.service.ts) — `createDeal`, `updateDeal`, `syncDealPriceFromPackages`, `OFFERING_INCLUDE`, `flattenDealTherapists`, scoped ownership checks.
- [Product service](../../apps/msd-api/src/services/product.service.ts) — `CATEGORY_INCLUDE`, `createProduct`, `updateProduct`, ownership and slug checks.
- [Public catalog service](../../apps/msd-api/src/services/catalog.service.ts) — `PUBLIC_DEAL_SELECT`, `PUBLIC_PRODUCT_SELECT`, public detail getters and visibility-filtered lists.
- [Product model](../../apps/msd-api/prisma/schema.prisma#L1357) — `Product`, ProductImage and ProductVideo.
- [Deal model](../../apps/msd-api/prisma/schema.prisma#L1218) — `Deal`, DealPackage, DealImage, DealVideo, DealTherapist.
- [Deal enums](../../apps/msd-api/prisma/schema.prisma#L1763) — Deal lifecycle and approval states.
- [API response envelope](../../apps/msd-api/src/lib/http.ts) — `sendData` and `sendError`.

### Detail pages, tests, and relevant migrations

- [Public Deal detail](../../apps/msd/src/app/pages/deal-detail/deal-detail.tsx) — `DealDetail`.
- [Public Product detail](../../apps/msd/src/app/pages/product-detail/product-detail.tsx) — `ProductDetail`.
- [Deal form tests](../../apps/msd/src/app/pages/account/members/deal-form-page.test.tsx).
- [Product form tests](../../apps/msd/src/app/pages/account/members/product-form-page.test.tsx).
- [Deal list tests](../../apps/msd/src/app/pages/account/members/deals-list-page.test.tsx).
- [Product list tests](../../apps/msd/src/app/pages/account/members/products-list-page.test.tsx).
- Deal/Product schema history: `20260810112617_add_vendor_branch_deal`,
  `20260811075729_add_product`, `20260819090000_deal_packages`,
  `20260819100000_add_media_tables`, `20260827130000_direct_category_access`,
  `20260910091537_archive_legacy_product_deals`,
  `20260910091757_decouple_product_from_deal`, and
  `20261004223414_add_deal_therapist_link` under
  `apps/msd-api/prisma/migrations/`.
