# MSD Demo – Feedback & Change Requirements

## 1. Customer-Facing Application (Frontend)

### 1.1 Cart and Checkout
- After a customer successfully completes checkout and payment, the cart counter should reset to **zero**.

### 1.2 Order Details
- **Deals:** Add a redemption status within each deal card, showing whether the deal has been redeemed or is yet to be redeemed.
- **Products:** Display a delivery-status timeline within each product card.
- **Delivery address:** Display the address within product cards only. It is not required for deal cards.

### 1.3 Location Selection and Search
- Remove the **“Type a city”** option from the location selector in the header.
- Display a list of all states in the location selector.
- Allow users to distinguish or filter search results by **city or area**.

### 1.4 Category Filters
- On the category page (example: `/category/massage`), provide filtering based on popular locations.
- Display the distance filter in selectable ranges, similar to the existing price-range filter.

### 1.5 Payment
- There is currently **no Cash on Delivery (COD) option**.

### 1.6 Policies and Legal Pages
- Add the policies, Terms & Conditions, and other relevant informational pages from the old MSD application to the new MSD application.

### 1.7 Deal QR Codes
- Generate a QR code for every successful deal purchase.
- Each generated QR code should remain valid for **30 days**.

---

## 2. Admin Panel and Backend Requirements

### 2.1 Members / Vendor Management
- On the **All Members** page:
  - Display business addresses with identifiable Google Maps landmarks.
  - Vendor documents should not be mandatory. However, vendors should be able to create deals and products.
- Replace the label **“Member”** with **“Vendor”** in the relevant Admin Panel areas, as membership will be managed through a separate module.
- Add an option for vendors to upload or update their business logo on the vendor profile page.
- Therapists should be disabled.

### 2.2 Deals and Products
- Add rating functionality for all deals and products.
- Introduce a customer reward mechanism in which customers receive coins for submitting reviews.

### 2.3 Vendor Booking Configuration
- Add a booking-method field during vendor creation, with options such as **Walk-in** and other applicable booking methods.

### 2.4 MyTherapist Chatbot
- Add a chatbot named **“MyTherapist”**.

### 2.5 Membership Module
- Add a membership module that supports use across participating locations, so members can visit eligible locations according to their membership benefits.
- Support the following membership purchase models:
  - Coupon purchase
  - Session purchase
- The proposed membership tiers listed in the demo notes are:
  - Diamond
  - Gold
  - Platinum
  - Silver

## 3. Implementation Status (Source Audit, 2026-11-03)

Status definitions: **Implemented** means the requirement is present in the current code; **Partial**
means some of the necessary behavior or data exists but the stated user-facing behavior is incomplete;
**Not implemented** means no matching feature was found. The old application was not supplied, so
content parity with it cannot be confirmed.

### 3.1 Customer-facing requirements

| Requirement | Status | Finding |
|---|---|---|
| 1.1 Reset cart counter after successful payment | Partial | The API clears cart items when a payment or COD order is confirmed. The header count is held by `CartCountProvider`, which reloads on cart mutation events; the checkout success path has no explicit count refresh. A signed-in purchase was not completed in the browser, so the visible badge reset remains unverified. |
| 1.2 Deal redemption status on order item cards | Partial | `PurchaseEntitlement` persists voucher code and entitlement status, and vendor voucher verification exists. The customer order detail renders a single order progress indicator and generic item cards; it does not display each deal's redemption state on its card. |
| 1.2 Product delivery timeline on product cards | Partial | Fulfilment data stores carrier, tracking number, shipped time and delivery evidence. The customer page has one order-level progress indicator, not a per-product event timeline; the product card itself does not render delivery events. |
| 1.2 Delivery address on product cards only | Partial | `Order.shippingAddress` is displayed in a separate order section only when the order contains a product. It is not shown within each product card. Deal-only orders do not show the address. |
| 1.3 Remove the "Type a city" option | Implemented | The header picker is a search over partner cities and has no separate "Type a city" selection. It does not accept an arbitrary city as a location. |
| 1.3 List all states in the header location selector | Not implemented | The header picker lists cities returned by the partner-catalog locations (four entries were visible during this audit), not a complete list of Indian states. The shared state list is used in checkout/forms, but not in this picker. |
| 1.3 Search/filter by city or area | Partial | The picker can match partner city and state names. There is no area field/filter in that picker, so an area-level search is not supported there. |
| 1.4 Category popular-location filter | Not implemented | The category filter has visitor location, distance and catalog facets, but no "Popular locations" section or curated location facet. |
| 1.4 Selectable distance ranges | Implemented in code; not fully browser-verified | The filter renders selectable distance buckets from catalog facets (for example, within a distance), and disables them until coordinates are available. The location-disabled state prevented end-to-end range selection during this browser run. |
| 1.5 Cash on Delivery | Implemented | Checkout has Online and COD choices; the API has a COD payment provider and order flow. The requirement's statement that COD does not exist is stale. |
| 1.6 Policies and informational pages | Partial | Current routes exist for Privacy, Terms, Return/Refund and Cookie policies, as well as About, Help Center, Contact, Careers and How it Works. Their text was not compared against the old application because its source content was not provided. |
| 1.7 QR code for each successful deal purchase, valid 30 days | Not implemented | Voucher codes and verification exist, but there is no QR integration or per-voucher expiry field. The `EXPIRED` verification result is only a placeholder and cannot currently be returned. |

### 3.2 Admin and backend requirements

| Requirement | Status | Finding |
|---|---|---|
| 2.1 Business address and identifiable Google Maps location | Partial | Vendor/branch address and a Google Maps URL are supported; the API resolves supported Maps links to coordinates. There is no dedicated landmark field, and display of a landmark on the All Members list was not found. |
| 2.1 Documents optional; vendors can create deals/products | Not implemented as stated | The documented business rule says incomplete documents do not block publishing, and active vendors have deal/product tools. However, the current vendor-create form requires at least one KYC document before creating a new vendor. This UI gate conflicts with the requirement and the written rule; completing every document is not required by the rule. |
| 2.1 Replace "Member" with "Vendor" in admin areas | Not implemented | Admin routes and screens still use Member/Members labels. Keep the internal model, role and permission keys unchanged unless separately approved; this requirement is primarily a UI terminology change. |
| 2.1 Upload/update a business logo | Partial | The Vendor Profile has a one-image "Profile Image" upload using the vendor media API. It can be uploaded/updated, but the UI does not identify it as a business logo and the old `logoUrl` field is a legacy URL field. Confirm whether the existing profile image is intended to satisfy the logo requirement. |
| 2.1 Disable therapists | Not implemented | Therapist listings, detail pages, admin/member CRUD and backend routes are active. No global therapist-off switch was found. |
| 2.2 Deal/product ratings and reviews | Not implemented | Planning explicitly defers ratings/reviews until the open ST-22 reviews task is designed and built. No review model or customer review API was found. |
| 2.2 Reward coins for reviews | Not implemented | No reward wallet/ledger, coin balance or review reward flow was found. |
| 2.3 Booking method on vendor creation | Not implemented | No booking-method field/enum was found in the vendor schema or UI. |
| 2.4 MyTherapist chatbot | Not implemented | No chatbot UI, conversation API or chatbot data model was found. |
| 2.5 Membership tiers and cross-location benefits | Not implemented | No membership plans, customer memberships, session/coupon purchase records, redemption API or membership screens were found. |

Primary evidence: [MSD routes](../../apps/msd/src/app/routes.tsx), [checkout](../../apps/msd/src/app/pages/checkout/checkout.tsx),
[location picker](../../apps/msd/src/app/components/city-picker-dialog/city-picker.tsx),
[category filters](../../apps/msd/src/app/components/filter-panel/filter-panel.tsx),
[customer order detail](../../apps/msd/src/app/pages/orders/order-detail.tsx),
[purchase item card](../../apps/msd/src/app/components/purchase-line-card/purchase-line-card.tsx),
[Prisma schema](../../apps/msd-api/prisma/schema.prisma),
[voucher service](../../apps/msd-api/src/services/voucher.service.ts),
[vendor profile tabs](../../apps/msd/src/app/pages/account/members/vendor-profile-tabs.tsx),
[vendor create form](../../apps/msd/src/app/pages/account/members/vendor-profile-form.tsx),
[MSD planning](./PLANNING.md),
[MSD tasks](./TASKS.md).

## 4. Implementation Contract for Open/Partial Requirements

This is an implementation proposal, not an approved schema/API change. The repository workflow
requires business rules and test cases to be reviewed before schema or API changes. MSD owns its
own schema and API; do not add membership or review data to a shared database.

### 4.1 Existing schema/API to reuse

- Keep `Order`, `OrderItem`, `Payment`, `PurchaseEntitlement`, `Member`, `Branch`, `Deal`,
  `Product`, `VendorImage` and the existing catalog/order/vendor routes as the foundation.
- `Order.shippingAddress` and its city/state/pincode fields already store checkout's delivery
  address. Display it only for product fulfilment and associate it with the relevant product card.
- `PurchaseEntitlement` already stores a unique voucher code, fulfilment kind/status, carrier,
  tracking number and shipped time. Add the missing customer projection/UI and, if a true history
  is needed, a delivery-event table rather than pretending a current status is a timeline.
- COD already uses `PaymentProvider.COD`; do not create a second payment method or duplicate
  order flow.
- Reuse the vendor media uploader/storage pipeline for the profile image. If the owner confirms
  it is the business logo, relabel the tab and ensure the first vendor image is used consistently
  as the logo. Otherwise add a distinct logo storage reference and upload operation.

### 4.2 Proposed schema, API and validation

| Feature | Schema/data changes | API/UI changes | Validation and authorization |
|---|---|---|---|
| Cart count | No schema change. | After verified online payment or accepted COD completion, refresh the shared cart-count state after the server clears the cart. Do not clear the cart on a failed or abandoned online payment. | Test successful card, COD, declined payment, closed payment window and retry. The counter must equal the server cart quantity on header, mobile tab bar and cart page. |
| Deal redemption and QR | Add `PurchaseEntitlement.expiresAt` (or `validUntil`), set by the server to the approved 30-day window. Reuse its unique voucher code as the QR payload; do not store a QR image unless a business need requires it. | Return voucher status and expiry in the customer's order detail response; render a QR on each eligible deal item. Extend vendor verification to reject expired vouchers and display redeemed/unused/expired. Candidate routes: customer `GET /orders/me/:id` with entitlements; existing vendor voucher verification route for validation. | Generate only after the chosen successful-payment event; unique, unguessable code; expiry is server-computed, never client-supplied; verify ownership, order/payment state, expiry and status atomically; never put customer PII in QR contents. Test duplicate scans, replay, expiry boundary, refund/cancel and unauthorized access. Decide how COD orders become eligible. |
| Product delivery and address | Add `ProductDeliveryEvent` related to `PurchaseEntitlement` with status, event time, actor/source, public note and optional carrier/tracking data. Keep the address snapshot on `Order` unless each line can ship to a different address. | Member/vendor API appends shipment events; customer order API returns chronologically ordered events. Render the timeline and product-only delivery address in the product card; do not display the address for deal/therapist items. | Strict status-transition allowlist (for example ordered, processing, shipped, out-for-delivery, delivered, exception/returned); server timestamps; only the owning vendor or permitted staff can append; customer reads only own order. Validate carrier/tracking lengths and safe link schemes. |
| States, city/area and popular locations | Use the existing shared India state/city data for the complete state list. Add optional `Branch.area` and `Branch.landmark` if the business confirms they are distinct from the existing address. A curated `PopularLocation` table is optional; otherwise derive location options from active partner branches. | Populate the header with all states and dependent city/area choices. Add `city`/`area` filters to catalog queries and facet responses; category page adds the popular locations facet. Keep filter state shareable in the URL. | State must be from the canonical list; city must belong to the selected state; area must belong to a live partner branch/location. Trim and bound search input. Distance bucket must be from server facets and disabled without valid coordinates. Maps URL must pass the existing supported-Google-Maps resolver. |
| Optional KYC and Vendor naming | No new table required for optionality; `MemberDocument` remains a follow-up record. `Branch.landmark` is only needed if a separate landmark value is approved. Keep DB model `Member` and existing permissions stable. | Remove the KYC-document prerequisite from the vendor-create UI; leave upload/review/reminder flows available after creation. Update only customer/admin-facing copy from Member to Vendor where requested. Ensure active vendors can create products/deals before KYC is complete. | API and UI must agree: empty documents are accepted at creation; missing documents do not block deal/product create or publish; document uploads still enforce existing file type/size/magic-byte checks. Test both direct API and the vendor/admin UI with zero documents. |
| Therapist shutdown | No new data model is required if the shutdown is permanent; if it is reversible/configurable, use a server-owned feature flag/settings value. Preserve historical therapist/order references. | Hide public therapist listings/details and creation links; reject new therapist create/publish/purchase operations while disabled. Decide whether existing profiles are archived or hidden. | Enforce on API as well as UI; existing paid order history and entitlements must remain readable. Test stale direct URLs and API calls, plus rollback/re-enable if supported. |
| Ratings and review coins | Add `Review` linked to `User` and the purchased `OrderItem` (deal or product), with rating, body, moderation status and timestamps. Add append-only `RewardLedger` entries with unique `reviewId`/idempotency key and signed coin delta; derive balance from the ledger. | Customer submit/list endpoints; public catalog review summary/list endpoints; staff moderation endpoints; customer reward balance/history endpoint. Expose rating summaries on deal/product cards only after real reviews exist. | Rating is integer 1-5; review must belong to a completed/eligible purchase by that customer; one review per eligible line unless edited; strict body length and text sanitization; moderation and rate limits; coin grant is server-set, exactly once, reversible only with an auditable adjustment. No fabricated ratings. |
| Booking method | Add a `BookingMethod` enum and vendor/branch configuration (or a join table if multiple methods are supported). | Add the field to vendor create/edit and return it from member/profile/catalog APIs. Candidate values such as Walk-in, Online, Phone or WhatsApp are tentative, not approved. | Reject unsupported values; require a valid method for bookable service types; product purchases must not accidentally inherit a service booking method. |
| MyTherapist | If conversations must persist, add `ChatConversation` (owner, status, timestamps) and `ChatMessage` (conversation, role, content, createdAt, provider metadata). Avoid storing provider secrets or unnecessary health data. | Add a customer chat UI and server-mediated message endpoint, conversation history endpoint and optional human handoff. | Conversation ownership check, strict request schema, bounded message size/history, rate limit, output sanitization, data-retention policy and safe failure behavior. Keep the bot to wellness/product information; do not present it as a medical diagnosis service. |
| Membership | Add `MembershipPlan` (tier, purchase model, price, validity, benefits, eligible locations), `MembershipPurchase` (customer, plan, payment/status/date range), and `MembershipRedemption` or session ledger (purchase, location, units, redeemed time, idempotency key). Tier values: Diamond, Gold, Platinum, Silver. | Public plan list; customer purchase/active-membership/history endpoints; authenticated redemption/check-in endpoint that accepts an eligible location; admin plan management. Use existing payment service rather than a parallel gateway. | Money uses decimal INR; purchase model is exactly Coupon or Session; enforce active period, tier benefits, remaining sessions/coupon uses, eligible participating location, ownership and atomic/idempotent redemption. Prevent replay/double-spend and define cancellation/refund effects. |
| Policies/content parity | No schema change if current CMS `WebsitePage` rows and public content APIs cover the supplied pages. | Import approved old-app copy into the existing CMS/legal pages; add a route only if a required old page has no current route. | Compare page inventory and text with the old app; business/legal owner approves policy text, effective date and links before release. Validate rich text through the existing allowlist sanitizer. |

### 4.3 API and delivery standards

New/changed backend endpoints belong in `apps/msd-api`, under `/api/v1`. Use strict Zod body/query
schemas, OpenAPI registration, current API envelopes/error codes, UUID checks, server-side
permission/ownership checks and audit logs for staff mutations. Validate files by size, MIME and
magic bytes; do not trust a filename or client-provided expiry, payment status, coin amount or
membership balance. Return 422 for invalid input, 401/403 for auth/permission failures, 404 for
foreign owned records where the existing API convention applies, 409 for invalid state transitions
or duplicate/idempotency conflicts.

Any schema change needs an expand/contract migration and `down.sql`, migration rehearsal and
updated `DATABASE.md`; API changes require `API.md` and OpenAPI updates; acceptance cases belong
in `TESTING.md`; approved business rules belong in `PLANNING.md`; tasks are ticked only after
implementation and verification. No application/schema/API change was made as part of this audit.

## 5. Decisions Required Before Implementation

1. Define what makes a purchase "successful" for QR activation, especially COD, and whether expiry
   is exactly 30 x 24 hours from payment confirmation or calendar-day based.
2. Confirm whether one review is allowed per purchased item, whether reviews need moderation, the
   coin reward amount, reward caps and how/where coins can be redeemed.
3. Define membership price, duration, benefit rules, coupon/session quantities, location eligibility,
   redemption rules, tier comparison and refund/cancellation behavior.
4. Approve booking-method values and whether they apply to a vendor or each branch.
5. Confirm whether "disable therapists" means remove them permanently, hide them from new sales,
   or temporarily switch the feature off; preserve existing order records either way.
6. Confirm that the current one-image Vendor Profile upload is the business logo, and define the
   landmark value/source for the All Members display.
7. Supply the old MSD policy/content source for an accurate migration comparison.

## 6. Website and Test Run

### Browser route smoke test

Tested `http://localhost:4200/` on 2026-11-03. Public routes tested included home, categories,
`/category/massage`, deals, products, therapists, explore, blog, about, help center, contact,
careers, become-member, how-it-works, privacy, terms, return/refund policy, cookies, showcase,
wishlist and sample deal/product detail pages. The tested pages returned the SPA successfully
(HTTP 200) and the sampled detail pages rendered their expected heading. `/cart`, `/checkout` and
`/account` showed the sign-in/guard flow when unauthenticated; authenticated checkout, payments,
admin actions and order-specific data were not exercised.

The header location dialog showed partner cities with their state labels, not every state. The
category filter exposed Distance but no Popular locations control. A phone-width check was
attempted, but the browser reported a 585 CSS-pixel viewport after requesting 390 pixels; this is
not a valid 390-pixel mobile verification. The first page open emitted one anonymous 401 console
resource error; it did not recur as a failed response in the subsequent route sweep. Lit dev-mode
and React Router future-flag warnings were also present.

### Automated tests

`npx.cmd nx run msd:test` on 2026-11-03: **failed** - 116 test files passed and 68 failed; 832
tests passed and 24 failed (856 total). Several failures share a Vitest mock error: the
`@skylabs-monorepo/shared-auth/react` mock does not provide `getTokenStore`; an SSR test also
reported `document is not defined`. Focused location and vendor-profile tests passed (23 tests).
The focused category, checkout and customer order-detail suites failed to load for the same
`getTokenStore` mock error. This differs from the zero-failure baseline recorded in
`TESTING.md` (2026-10-29) and should be reconciled before relying on the full-suite baseline.

This was a documentation/status audit, not a signed-in end-to-end checkout. No payment was
submitted, no vendor/customer data was changed, and no backend or database migration was run.
