# MSD Member, Branch, Therapist, Deal, and Product Create-Flow Verification

## Scope and evidence

This report traces the five Admin Panel create flows through the React form, API client, Express route, Zod validation, service logic, Prisma model, and the response shape defined by the code. It is a read-only source investigation with browser inspection; no create/update/delete API requests or database writes were made.

Evidence labels used below:

- **Source-verified** — established from the current frontend/backend implementation and schema.
- **Runtime-verified** — observed against the local application or API; protected screens were opened through the shared authenticated Admin Panel session, without writes.
- **Not runtime-verified** — requires an authenticated Admin Panel session or a live create request.

Local runtime checks:

| Check | Result |
|---|---|
| `GET http://localhost:3333/api/v1/health` | **Runtime-verified:** HTTP 200. The health route reports process liveness and does not query the database. |
| `GET http://localhost:4200/` | **Runtime-verified:** HTTP 200; the public MSD storefront loaded. |
| Authenticated Admin Panel | **Runtime-verified:** the shared browser session opened `/account/members/new`; the page rendered its five required Member fields. |
| Nested Branch/Therapist/Deal/Product create forms | **Runtime-verified, limited:** all four protected routes rendered their form shells and visible controls. They were opened with a placeholder, non-existent Member UUID; reference-data requests consequently returned 404 and dynamic option lists could not be verified. |
| Admin create request/response | **Not runtime-verified:** no create request was sent and no write was made. |

Field visibility was checked from both source and the rendered forms where noted. Dynamic choices could not be checked against a real Member, Branch, or category mapping.

## Summary

| Workflow | Admin create route and method | UI-visible fields | Important server behavior |
|---|---|---|---|
| Member | `POST /api/v1/members` | Business name; owner first/last name, email, mobile | Creates a new owner User and Member in a transaction; Member starts `ACTIVE`; welcome notice attempted after commit. |
| Branch | `POST /api/v1/vendors/:vendorId/branches` | State, branch name, address, city, PIN code, Google Maps URL, opening hours, category access | Creates the Branch first; then the UI sends category mappings in a separate `PUT`. |
| Therapist | `POST /api/v1/vendors/:vendorId/branches/:branchId/therapists` | Branch, therapist/service type, person name, gender, specialization category, bio, experience | Branch must have Therapy category access; optional specialization is checked against vendor/branch access. |
| Deal | `POST /api/v1/vendors/:vendorId/branches/:branchId/deals` | Branch, category/subcategory, title, slug, descriptions/notes/policy/terms, one or more price-duration packages, therapists | Admin-created Deal is persisted `ACTIVE` and `APPROVED`; its top-level price/duration fields are synced from the cheapest active package. |
| Product | `POST /api/v1/vendors/:vendorId/products` | Category/subcategory/type, name, slug, brand, price/original price/discount, badge, text fields, New and Featured | Product is vendor-level (not branch-level); status defaults active. Discount is accepted as entered; it is not calculated from prices. |

All successful create routes return HTTP 201 in the standard API envelope `{ data, error: null }`. Exact live response values were not captured because no authenticated create request was made.

## 1. Member

### Route correction

The Member-create form calls `createMember`, which issues:

```http
POST /api/v1/members
```

The API also mounts the Member admin routes at `/api/v1/vendors` as a deprecated alias for a transition period. Therefore `POST /api/v1/vendors` is an alias, but **`POST /api/v1/vendors/{id}` is not the create flow**: the `/:id` route is `GET` for reading and `PATCH` for updating a Member. The frontend does not send a Member ID when creating one.

### Admin Panel fields and request payload

The short “Add member” form groups its required fields under Business details and Owner details:

- Business name
- Owner first name
- Owner last name
- Owner email
- Owner mobile number

Client validation trims values, requires all five fields, enforces the business/person name limits and email/mobile formats, then asks for confirmation before submission. The submitted JSON has exactly these keys:

```json
{
  "businessName": "<trimmed business name>",
  "ownerFirstName": "<trimmed first name>",
  "ownerLastName": "<trimmed last name>",
  "ownerEmail": "<trimmed email>",
  "ownerMobile": "<trimmed 10-digit mobile>"
}
```

The server schema is strict, trims the strings, validates lengths/email, and normalizes the mobile identifier. The short form does not submit profile address, bank, KYC, category, or branch fields; those are handled later in the Member detail/onboarding screens.

### Backend persistence and response

`createMember` checks email/mobile availability, creates the owner User, grants the `member` role, and creates the Member in one Prisma transaction. The Member is created with status `ACTIVE`; initial business contact email/phone are copied from the owner email/mobile, and `contactPerson` is derived from the owner’s name. The documents deadline is initialized. After the transaction, the service attempts to send a welcome notice and records `welcomeSentAt` only when at least one delivery channel succeeds.

The route returns HTTP 201. Its `data` is the created Member/Vendor representation, with a safe owner summary, counts, document summary, and computed `profileCompletion`. The response does not contain authentication tokens or session data. The normal API error envelope reports validation failures as 422 and owner email/mobile conflicts as 409, with field-specific details where available.

### What the Admin UI does next

On success, the form navigates to `/account/members/:id`, where the Member detail page manages the rest of the profile. The create screen itself explicitly tells staff that the Member is active straight away and that the remainder of the profile is completed next.

## 2. Branch

### Route and request payload

The form calls:

```http
POST /api/v1/vendors/:vendorId/branches
```

The path supplies the owning Member ID; the JSON body is assembled as follows:

```json
{
  "name": "<branch name>",
  "address": "<optional; omitted when blank>",
  "city": "<optional; omitted when blank>",
  "state": "<optional; omitted when blank>",
  "pincode": "<optional; omitted when blank>",
  "mapLocationUrl": "<optional trimmed URL; omitted when blank>",
  "openingHours": "<optional weekday-hours object>"
}
```

In addition to the Branch create request, the UI saves category access using a separate request after the Branch has been created:

```http
PUT /api/v1/vendors/:vendorId/branches/:branchId/category-access
Content-Type: application/json

{ "mappings": [{ "categoryId": "<id>", "subcategoryIds": ["<id>"] }] }
```

An empty mapping list is also representable. Thus the Branch create and its category-access save are **not one atomic operation**.

### Admin Panel fields and validations

The Location section shows State, Branch Name, Address, City, PIN Code, and Map Location. Choosing a State enables the remaining location fields and determines the available city choices. Branch Name is required; the PIN code is constrained to six digits when provided; the map URL is checked client-side and resolved/validated server-side.

The Opening Hours section stores weekly weekday entries with `open` and optional `start`/`end` values in 24-hour `HH:MM` format. The Category Access section loads Service and Therapy categories and their subcategories.

The backend Branch schema also permits `country`, `phone`, and `email`, but this Add Branch UI does not render or submit those fields. Latitude/longitude are not form inputs: a submitted map URL is resolved server-side. The route returns the newly created Branch (HTTP 201); the category-access request returns the saved mapping rows separately.

If Branch creation succeeds but the category-access request fails, the UI displays “Branch saved, but categories could not be saved” and stays on the form rather than implying that both operations succeeded. The Branch is already persisted and will need its category mapping saved separately.

### Persistence

The Branch row is related to its Member through `vendorId`; it stores location, map URL/resolved coordinates, optional JSON opening hours, and active status. The Member/Branch ownership and category/subcategory constraints are checked in the service layer.

## 3. Therapist

### Route and request payload

The form submits to the selected branch:

```http
POST /api/v1/vendors/:vendorId/branches/:branchId/therapists
```

`vendorId` and `branchId` are path parameters, not body fields. The body is assembled as:

```json
{
  "therapistType": "<service or therapist type>",
  "personName": "<staff member name>",
  "gender": "<optional; omitted when blank>",
  "specializationCategoryId": "<optional category ID; omitted when blank>",
  "bio": "<optional; omitted when blank>",
  "experienceYears": "<optional number; omitted when blank>"
}
```

### Admin Panel fields and validations

The Add Therapist form shows:

- Branch (only branches currently carrying Therapy category access)
- Therapist Type / Service Name (required)
- Person Name (required)
- Gender
- Specialization (restricted to granted Therapy categories)
- Bio
- Experience (years)

The edit form displays the current Branch as fixed. The form converts non-empty experience to a number and omits blank optional text/category fields. `photoUrl` is accepted by the backend schema but is not an input on this form; uploaded therapist media is managed through separate media endpoints.

### Backend persistence and response

The backend validates required type/person names, checks the vendor/branch relationship, and requires the branch to have at least one Therapy category grant even if no specialization was selected. If a specialization is supplied, it must be in the vendor’s Therapy grants and available to the branch. The Therapist is stored with `vendorId` and `branchId`; the schema defaults `isActive` to true.

The create route returns HTTP 201 with the created Therapist and its media relations as included by the service. The form then navigates to `/account/members/:vendorId/therapists/:therapistId`.

## 4. Deal

### Route and request payload

The form submits a Deal to the selected Member and Branch:

```http
POST /api/v1/vendors/:vendorId/branches/:branchId/deals
```

The create form sends this body shape:

```json
{
  "categoryId": "<branch-accessible Service category ID>",
  "subcategoryId": "<optional; omitted when blank>",
  "title": "<title>",
  "slug": "<lower-kebab-case slug>",
  "shortDescription": "<optional>",
  "description": "<optional>",
  "notes": "<optional>",
  "policy": "<optional>",
  "termsAndConditions": "<optional>",
  "durationMinutes": "<cheapest package duration>",
  "salePrice": "<cheapest package selling price as a decimal string>",
  "originalPrice": "<cheapest package original price, or selling price, as a decimal string>",
  "packages": [
    {
      "durationMinutes": 60,
      "sellingPrice": 1000,
      "originalPrice": 1200
    }
  ],
  "therapistIds": ["<selected therapist ID>"]
}
```

At least one package is required. For each package, original price must be greater than or equal to selling price. The form derives the Deal-level price/duration values from the least expensive package; those fields are a compatibility/display cache, while the package rows are the selectable duration/price options. `therapistIds` is always sent as an array, including an empty array if no therapists were selected.

### Admin Panel fields and validations

The form sections are Branch & Category, Details, Pricing, and Therapists:

- Branch (required; locked on edit)
- Category (required and limited to categories mapped to the chosen branch)
- Subcategory (optional)
- Title and slug (required)
- Short description, description, notes, policy, terms and conditions
- One or more package entries with duration, selling price, optional original price
- Therapists assigned to the same branch; the form also supports creating a Therapist inline

The create form does not expose `discountPercent`, images, date bounds, or booking-capacity fields even though the API schema has corresponding optional Deal properties. The Deal create body does not contain `vendorId` or `branchId`; the server takes those from the URL.

### Backend persistence and response

The service verifies the selected Member/Branch, the Service category and optional subcategory grants, and that all linked Therapists belong to that exact Branch. It rejects duplicate slugs. Deal, package rows, and therapist links are written transactionally. Because this is the admin-on-behalf route, the service creates the Deal as `ACTIVE` and `APPROVED`; vendor self-service submissions follow a different draft/pending flow.

The server re-syncs the Deal’s cached top-level price/original-price/duration from its cheapest active package. The response is HTTP 201 with the Deal and included offering relations (category/subcategory, packages, and flattened therapist assignments as provided by the service). The UI navigates to `/account/members/:vendorId/deals/:dealId`.

## 5. Product

### Route and request payload

The Product form submits at Member scope, with no Branch parameter:

```http
POST /api/v1/vendors/:vendorId/products
```

The create payload contains:

```json
{
  "categoryId": "<Product category ID>",
  "subcategoryId": "<optional selected subcategory/type ID>",
  "name": "<product name>",
  "slug": "<lower-kebab-case slug>",
  "brand": "<optional>",
  "price": "<decimal string>",
  "originalPrice": "<optional decimal string>",
  "discount": "<optional integer percentage>",
  "badge": "<optional>",
  "summary": "<optional>",
  "description": "<optional>",
  "ingredients": "<optional>",
  "returnPolicy": "<optional>",
  "isNew": false,
  "isFeatured": false
}
```

The form turns a non-empty discount into a number and leaves it out when blank. Price fields are sent as strings. Blank optional values are omitted. `isNew` and `isFeatured` are sent as booleans.

### Admin Panel fields and validations

The form shows Category, optional Subcategory and Type, Name, Slug, Brand, Price, Original price, Discount %, Badge, Summary, Description, Ingredients, Return policy, New, and Featured. Name, slug, category, and price are required by client-side validation. The category picker is populated from Product categories. The optional Type selection is represented by the form’s selected category/subcategory value.

Although the backend schema supports image URL, gallery, and image-alt fields, this create form does not show or send them. Image uploads/media are separate from this form.

### Backend persistence and response

The API validates the slug format and uniqueness, decimal strings, and optional integer discount in the 0–100 range. The service checks that the selected category is a Product category and that the selected subcategory relationship is valid. `vendorId` comes from the URL and the Product row has no `branchId`. Database defaults set `isActive`, `isNew`, and `isFeatured` to true/false/false respectively when not provided; this form does provide the last two boolean values.

The service persists the supplied `discount` value as given; it does not derive a percentage from `price` and `originalPrice`. The create route returns HTTP 201 with the Product and its category/subcategory relations. The UI navigates to `/account/members/:vendorId/products/:productId`.

## Cross-cutting API response and errors

The API’s success envelope is `{ "data": ..., "error": null }`; the create routes use HTTP 201. Error responses use `{ "data": null, "error": { "code", "message", "details" } }`. Relevant cases include:

- 401 for unauthenticated requests
- 403 for missing permissions or a resource outside the requested Member/Branch scope
- 404 for missing scoped resources
- 409 for conflicts such as duplicate slugs or a Member owner email/mobile already in use
- 422 for Zod validation failures

The UI surfaces API errors in the relevant form. These are source-defined contracts; exact live envelopes and field values were not captured in this read-only run.

## Verification limits

- **Source-verified:** route methods/paths, frontend form fields and payload construction, request schemas, service-level checks and persistence, relevant Prisma relations/defaults, and response-envelope/status behavior.
- **Runtime-verified:** local frontend/API liveness; authenticated Admin Panel navigation; Member create controls; nested create-form controls using a placeholder Member UUID.
- **Not runtime-verified:** real Member/Branch/category option data, actual create payloads from browser DevTools, live database rows, live create responses, and post-create list/detail rendering. The nested forms' lookups using the placeholder UUID returned 404. No write requests were made.
- Unit tests exist for the Member form/create service and for Branch, Therapist, Deal, and Product forms. They were not run as part of this documentation-only investigation.

## Source references

Frontend forms and API clients:

- [Member Add form](../../apps/msd/src/app/pages/account/members/member-new-page.tsx)
- [Member API client](../../apps/msd/src/api/rbac/members.ts)
- [Branch form](../../apps/msd/src/app/pages/account/members/branch-form-page.tsx)
- [Therapist form](../../apps/msd/src/app/pages/account/members/therapist-form-page.tsx)
- [Deal form](../../apps/msd/src/app/pages/account/members/deal-form-page.tsx)
- [Product form](../../apps/msd/src/app/pages/account/members/product-form-page.tsx)
- [Vendor/Branch/Deal/Therapist/Product API client](../../apps/msd/src/api/rbac/vendors.ts)
- [Admin route table](../../apps/msd/src/app/routes.tsx)

API and data layer:

- [Member admin routes](../../apps/msd-api/src/routes/member-admin.routes.ts)
- [API route mounting](../../apps/msd-api/src/app.ts)
- [Vendor routes](../../apps/msd-api/src/routes/vendors.routes.ts)
- [Vendor schemas](../../apps/msd-api/src/schemas/vendor.schema.ts)
- [Product schema](../../apps/msd-api/src/schemas/product.schema.ts)
- [Vendor service](../../apps/msd-api/src/services/vendor.service.ts)
- [Product service](../../apps/msd-api/src/services/product.service.ts)
- [API response envelope](../../apps/msd-api/src/lib/http.ts)
- [Prisma schema](../../apps/msd-api/prisma/schema.prisma)
- [Member create service tests](../../apps/msd-api/src/services/member-create.test.ts)
- [Branch form tests](../../apps/msd/src/app/pages/account/members/branch-form-page.test.tsx)
- [Therapist form tests](../../apps/msd/src/app/pages/account/members/therapist-form-page.test.tsx)
- [Deal form tests](../../apps/msd/src/app/pages/account/members/deal-form-page.test.tsx)
- [Product form tests](../../apps/msd/src/app/pages/account/members/product-form-page.test.tsx)
