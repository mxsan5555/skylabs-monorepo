# MSD Backend Change Requirements

**Status:** Static repository analysis; documentation only.  
**Source:** User-pasted “MSD Demo – Feedback & Change Requirements.” The named standalone `Changes_Requirement.md` was not found in the workspace, so this pasted text is the source of truth for this analysis.  
**Scope:** `apps/msd`, `apps/msd-api`, shared location utilities, API routes/services/schemas, Prisma schema/migrations, OpenAPI registry, and relevant existing tests.

## 1. Executive summary

The backend already supports payment-authoritative order completion, cart finalization after successful payment, COD, customer order details, state/city and coordinate-based catalog filtering, public legal-page retrieval, vendor logo media, vendor deal/product management, voucher codes and redemption workflows. Consequently, several requirements are already implemented or need frontend/content integration rather than new backend systems.

Main gaps are customer-visible deal redemption status, product delivery history, popular-location/area search semantics, QR-specific 30-day validity, ratings/reviews and reward coins, booking-method configuration, therapist disablement policy, MyTherapist, and customer memberships. Some requests conflict with current code: COD exists; “Member” remains an internal vendor entity; vendor document lifecycle and therapist workflows are active. Resolve these with the Team Lead (TL) before behavior or schema changes.

**Inventory:** 23 atomic requirements: 2 implemented and verified, 6 partially implemented, 9 not implemented, 2 frontend-only, and 4 requiring TL confirmation. Statuses describe backend support and requirement fit. See §7 for IDs and evidence.

## 2. Source requirement inventory

The two source sections cover customer app (cart/checkout, order details, location/search, category filters, payment, legal content, deal QR) and admin/backend (vendor management, ratings/rewards, booking configuration, chatbot, membership). They are decomposed into the 23 traceable IDs in §7. The analysis preserves the supplied business meaning and does not assume prices, benefit rules, provider choice, or a complete booking-method list.

## 3. Architecture overview

- Express API is mounted below `/api/v1`; route registration is in `apps/msd-api/src/app.ts`. Swagger/OpenAPI is exposed by `src/openapi/registry.ts` and `/docs`.
- Main flow: route → Zod validation → service → Prisma. Customer ownership, vendor self-service scopes and admin permissions differ by route.
- Prisma schema/migrations live under `apps/msd-api/prisma`. Relevant models include `Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, `PurchaseEntitlement`, `Member` (vendor business), `MemberDocument`, `Branch`, `Therapist`, `Deal`, `DealPackage`, `Product`, and `WebsitePage`.
- Public frontend wrappers are under `apps/msd/src/api`; admin/vendor wrappers are under `apps/msd/src/api/rbac`. A frontend wrapper alone is not proof of backend support; route, service and model flows were checked for the features below.

## 4. Frontend dependencies inspected

- Checkout/cart: `apps/msd/src/app/pages/cart/cart.tsx`, `pages/order-result/order-result.tsx`, `apps/msd/src/api/cart.ts`, `apps/msd/src/api/orders.ts`.
- Order detail: `apps/msd/src/app/pages/orders/order-detail.tsx` and backend customer order reads.
- Location/category: `apps/msd/src/app/components/listing`, `pages/category/category.tsx`, public catalog wrappers, and `packages/shared-utils/src/india-locations.ts`.
- Legal: `apps/msd/src/app/pages/website-page/website-page.tsx`, `apps/msd/src/api/catalog.ts`, plus frontend fallback content.
- Vendor management: account pages in `apps/msd/src/app/pages/account` and `apps/msd/src/api/rbac` vendor wrappers.
- Voucher redemption: vendor portal pages and the voucher API wrapper; current flow is entitlement/code based, not a verified customer QR lifecycle.

## 5. Existing relevant APIs

Routes below are registered in `apps/msd-api/src/app.ts` under `/api/v1`. The endpoint inventory in §8 is representative, not a dump of the entire API.

| Module | Actual endpoint(s) | Auth / permission | Schema → service → data | Finding |
|---|---|---|---|---|
| Cart | `/cart...` | Authenticated customer, own cart | cart schemas → `cart.service.ts` → Cart/CartItem | Existing; cart is not cleared at order creation |
| Checkout/orders | `POST /orders/checkout`, `GET /orders/me[/:id]` | Authenticated customer, own records | order schemas → `order.service.ts` → Order/OrderItem | Existing; customer response needs review for safe entitlement projection |
| Payment | `POST /orders/me/:id/pay`, `/pay-cod`, verification/batch routes | Authenticated customer, own order | payment schemas → `payment.service.ts` → Payment | Razorpay and COD are implemented |
| Webhook | `POST /payments/webhook/razorpay` | No user auth; HMAC signature | raw-body signature → payment service | Server-authoritative success flow |
| Catalog | `/catalog/deals`, `/products`, facets/page routes | Public | catalog schemas → `catalog.service.ts` | Deal state/city/radius/distance supported; no review aggregates or popular-location facet |
| Legal | `GET /catalog/pages/:slug` | Public | `website-page.service.ts` → WebsitePage | Published fixed legal pages; frontend fallback also exists |
| Legal CMS | `/website-pages...` | CMS permission | website-page schema/service | Existing seeded/fixed rows; admin read/update |
| Vendor profile/media | `/vendors/me`, vendor media routes | Auth + vendor self gate (`members:custom`) | vendor/media schemas/services → Member/media | Logo upload/update support exists |
| Vendor items | `/vendors/me/deals...`, `/products...` | Vendor self gate; admin routes use scoped permissions | deal/product schemas/services | Creation routes exist and scope ownership |
| Voucher | `/vouchers/verify`, `/queue`, `/:code/start`, completion/shipping/evidence routes | Auth + vendor ownership checks | voucher schemas → `voucher.service.ts` → PurchaseEntitlement | Existing vendor redemption lifecycle |
| Admin vendor records | `/members...`, `/vendors...` | RBAC (`members:*`, `vendors.*`) | schemas/services → Member/Branch/etc. | Legacy Member terminology persists |

OpenAPI registration is in `apps/msd-api/src/openapi/registry.ts`. Relevant route tests are colocated under `apps/msd-api/src/routes`; service tests cover order, payment, voucher, vendor, media, catalog, and related behavior.

## 6. Status definitions

- **IMPLEMENTED AND VERIFIED:** backend behavior was confirmed through registered route and service/model flow.
- **PARTIALLY IMPLEMENTED:** some capability or data exists, but the requested behavior is not complete or not exposed on the required surface.
- **NOT IMPLEMENTED:** no relevant backend model/API/flow was found.
- **FRONTEND ONLY:** backend capability exists; remaining work is primarily UI/content hookup.
- **REQUIRES TL CONFIRMATION:** unclear or contradictory policy prevents a safe implementation decision.

## 7. Requirement-by-requirement gap analysis

| ID | Source / module | Existing backend support and frontend dependency | Gap / smallest required backend work | Status |
|---|---|---|---|---|
| MSD-BE-001 | §1.1 Cart reset | `order.service.ts` creates/reuses a pending order; `payment.service.ts` finalizes linked cart on confirmed payment. `apps/msd/src/api/orders.ts` emits cart update. | Ensure every confirmed payment path stays transactional/idempotent; frontend should refresh badge after success. | IMPLEMENTED AND VERIFIED |
| MSD-BE-002 | §1.2 Deal redemption | `PurchaseEntitlement` and vendor voucher actions exist; customer order include intentionally excludes entitlement internals. Frontend: `pages/orders/order-detail.tsx`. | Safely project customer-owned entitlement status into existing order detail response; never expose OTP hashes/challenges or vendor-only data. | PARTIALLY IMPLEMENTED |
| MSD-BE-003 | §1.2 Product timeline | Product order lines and vendor shipping/tracking/evidence workflow exist. | Customer-visible per-product status event history/timeline is not verified; define events and extend existing order response or persist events if current status is insufficient. | NOT IMPLEMENTED |
| MSD-BE-004 | §1.2 Address | Order stores shipping address/state/city/pincode; customer order response has shipping fields. | Data is order-level, requested display is product-card-only. Frontend should scope it to product cards; clarify mixed/multiple-address orders. | PARTIALLY IMPLEMENTED |
| MSD-BE-005 | §1.3 Location/search | Shared India location list; catalog accepts state/city; Branch stores address/coordinates. | Structured area vocabulary/filter was not found. Verify complete state selector; define area semantics before schema/API. | PARTIALLY IMPLEMENTED |
| MSD-BE-006 | §1.4 Popular locations | Category/catalog APIs and popular tags/treatments exist. | No popular-location catalog/facet or popularity source found; define editorial vs derived ranking and extend catalog filters/facets. | NOT IMPLEMENTED |
| MSD-BE-007 | §1.4 Distance ranges | `catalog.schema.ts` accepts coordinates, `radiusKm`, distance sort; `catalog.service.ts` calculates Haversine distance for deals. | Backend radius capability exists; agreed selectable bands and frontend integration are needed. Product distance semantics are absent. | PARTIALLY IMPLEMENTED |
| MSD-BE-008 | §1.5 No COD | `POST /orders/me/:id/pay-cod` and `createCodPayment` exist; frontend `api/orders.ts#payCod` and migration `20260813083014_add_order_contact_details_and_cod` also exist. | Source statement conflicts with code. Decide retain/hide/remove; do not change provider behavior until clarified. | REQUIRES TL CONFIRMATION |
| MSD-BE-009 | §1.6 Legal pages | Public `GET /catalog/pages/:slug`; CMS website-page list/read/update; frontend fallback. Current known fixed pages include privacy, terms, accessibility, cookies. | Need old-app page inventory/content; add only approved missing content/slugs. | PARTIALLY IMPLEMENTED |
| MSD-BE-010 | §1.7 QR and 30 days | Successful payment creates a unique opaque `PurchaseEntitlement.voucherCode`; backend vendor verification exists. Expiry fields/rules exist, but fixed 30-day QR lifetime and QR generation are not verified. | Decide what QR encodes and when 30 days starts; enforce server-side expiry and atomic one-use redemption. QR must not contain PII. | PARTIALLY IMPLEMENTED |
| MSD-BE-011 | §2.1 Vendor addresses | Member/Branch store address and map/coordinate fields; vendor/admin routes expose business/branch data. | Confirm All Members screen receives/displays existing map/location fields; do not fabricate landmarks or geocode without agreed source. | FRONTEND ONLY |
| MSD-BE-012 | §2.1 Optional documents | Document lifecycle/review exists; deal/product creation endpoints exist with vendor status/permission checks. | Clarify whether missing documents may block onboarding, activation, listing, payout or creation; separate document completeness from other safety/status gates. | REQUIRES TL CONFIRMATION |
| MSD-BE-013 | §2.1 Member→Vendor terminology | Prisma/API continue to use `Member`; vendor routes and frontend labels coexist. | Requirement appears UI-label scoped; do not rename DB/API contracts without explicit compatibility requirement. | FRONTEND ONLY |
| MSD-BE-014 | §2.1 Vendor logo | `Member.logoUrl`; `/vendors/me` and vendor media upload/update routes already exist with validation/ownership. | Connect/verify profile UI against existing routes; no new backend model indicated. | IMPLEMENTED AND VERIFIED |
| MSD-BE-015 | §2.1 Disable therapists | Therapist model, vendor CRUD, catalog, deal relations, cart and checkout are active. | “Disabled” scope is unclear. If sale must stop, gate catalog, CRUD, cart and checkout; preserve historical orders. | REQUIRES TL CONFIRMATION |
| MSD-BE-016 | §2.2 Ratings | No review/rating model, route or service found; catalog schema comments note no review data. | Define scale, purchase eligibility, moderation, edits and aggregation; then add review storage/API and catalog aggregates. | NOT IMPLEMENTED |
| MSD-BE-017 | §2.2 Reward coins | No coin wallet/ledger/reward flow found. | Define amount/value, eligibility, expiry/reversal and redemption; issue transaction-safe idempotent credits tied to eligible reviews. | NOT IMPLEMENTED |
| MSD-BE-018 | §2.3 Booking method | Booking date/time and branch hours exist; no vendor booking-method field/enum found. | Confirm allowed methods and whether scope is vendor/branch/service; then persist and enforce selected method. Do not invent the option list. | REQUIRES TL CONFIRMATION |
| MSD-BE-019 | §2.4 MyTherapist | No chatbot/conversation API or provider integration found. | Decide provider, user context, data access, retention, privacy, escalation, rate limits and failure behavior before designing API. | NOT IMPLEMENTED |
| MSD-BE-020 | §2.5 Cross-location membership | No customer membership domain or participating-location/redemption API found. `Member` is a vendor business. | Create a separate membership domain; validate eligible location and atomically account for use. | NOT IMPLEMENTED |
| MSD-BE-021 | §2.5 Tiers | No membership tier model/API found. | Diamond/Gold/Platinum/Silver names do not define benefits, prices, validity or transitions; approve catalog/rules first. | NOT IMPLEMENTED |
| MSD-BE-022 | §2.5 Coupon purchase | No membership coupon balance/purchase flow found. | Define quantity, expiry, allowed services, transfer/refund and redemption rules; then ledger paid entitlements. | NOT IMPLEMENTED |
| MSD-BE-023 | §2.5 Session purchase | No membership session balance/purchase flow found. | Define session unit, validity, partial completion/refund rules; then implement atomic balance ledger linked to payment. | NOT IMPLEMENTED |

### Detailed implementation notes for every requirement

#### MSD-BE-001 — Cart finalization

**Source:** §1.1. **Current implementation:** `apps/msd-api/src/routes/orders.routes.ts`; `services/order.service.ts#createOrderFromCart`; `services/payment.service.ts` finalization paths. Cart items intentionally survive checkout creation and are cleared only after payment confirmation. **Required behavior:** retain this boundary and ensure browser callbacks alone cannot clear the cart. **Database:** existing Cart/Order/Payment sufficient. **Security:** authenticated customer’s cart/order only. **Acceptance:** failed/pending payment preserves cart; successful payment clears linked cart exactly once, including retries/webhook duplicates. **Priority:** P0.

#### MSD-BE-002 — Customer deal redemption status

**Source:** §1.2 Deals. **Current implementation:** PurchaseEntitlement is linked to purchased units; vendor verification/action endpoints are in `routes/vouchers.routes.ts` and `services/voucher.service.ts`. Customer order response deliberately uses a narrower include. **Required behavior:** extend existing `/orders/me/:id` response with only status needed by the owner’s deal card, if the existing relation supports it. **DB:** likely sufficient. **Security:** exclude OTP challenge/hash, payout details and vendor-only evidence; enforce order owner. **Acceptance:** correct redeemed/not-redeemed state per entitlement; cross-customer lookup denied. **Priority:** P1.

#### MSD-BE-003 — Product delivery timeline

**Source:** §1.2 Products. **Current implementation:** order item/product and vendor shipping/tracking/evidence exist, but customer-facing event history is not established. **Required behavior:** first agree timeline milestones and whether current status/tracking suffice; if not, persist append-only per-product shipment events and expose them in the existing order detail. **DB:** any event model is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. **Security:** only order owner/vendor can see/write their scoped records; protect evidence URLs. **Acceptance:** product cards show timestamped milestones; deal cards do not receive product events. **Priority:** P1.

#### MSD-BE-004 — Delivery address

**Source:** §1.2 Delivery address. Order-level address snapshot already exists and is returned in customer order data. **Required behavior:** preserve checkout snapshot and render only with product cards. Clarify mixed carts and whether one order can have multiple delivery addresses. **Security:** order owner and authorized operations only. **Acceptance:** product cards show address; deal cards omit it. **Priority:** P1.

#### MSD-BE-005 — State/city/area

**Source:** §1.3. Shared India locations and catalog state/city query support exist; no structured area filter was found. Reuse current data first. TL must define area vocabulary/source (free text, locality list, geocoding) before a new field/filter. **Acceptance:** all supported states selectable and city/approved area filters narrow results predictably. **Priority:** P2.

#### MSD-BE-006 — Popular locations

**Source:** §1.4. Popular tags/treatments do not establish popular locations. No location popularity source/model/facet found. TL must choose editorial configuration or derived ranking and define state/category scope. Extend catalog facets/query where possible. Any persisted mapping is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. **Acceptance:** category results use approved configured locations, with no fabricated results. **Priority:** P2.

#### MSD-BE-007 — Distance ranges

**Source:** §1.4. `schemas/catalog.schema.ts` accepts `latitude`, `longitude`, `radiusKm`; `services/catalog.service.ts` uses Haversine distance for branch-based deal results. Reuse radius capability with agreed bands and wire active range to query. Product has no branch-distance semantics. **Acceptance:** selected range constrains results only with coordinates; no false distance claim when location is unavailable. **Priority:** P2.

#### MSD-BE-008 — COD discrepancy

**Source:** §1.5 says COD is absent. Actual code has COD route/service, frontend wrapper and migration. No change should be proposed until TL says whether COD is to remain, be hidden or removed. **Acceptance:** frontend and backend provider behavior match written decision. **Priority:** P0 decision.

#### MSD-BE-009 — Legal content

**Source:** §1.6. Public published WebsitePage retrieval and admin CMS exist; frontend fallback exists. Current known slugs are fixed. Compare actual old-app page inventory/content (not supplied) and approve additions. Existing WebsitePage may suffice; new page types/slugs must be explicit. **Acceptance:** approved pages are public, published and editable through intended CMS. **Priority:** P2.

#### MSD-BE-010 — QR validity

**Source:** §1.7. Per-unit unique voucher code and backend verification exist, but QR generation and exactly 30-day QR validity were not verified. TL must define start time and whether the voucher itself expires. Use opaque code only; validate expiry/vendor/entitlement state server-side; atomically prevent duplicate redemption. Any new expiry field is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. **Acceptance:** one QR per successful deal unit; valid for approved 30-day interval; expired/wrong-vendor/already-used QR rejected; no PII encoded. **Priority:** P1.

#### MSD-BE-011 — Addresses/landmarks

**Source:** §2.1. Branch and vendor address/map URL/coordinates are stored and exposed by relevant APIs. Remaining need appears display/data-quality. Do not infer landmark names from address. **Acceptance:** admin can identify saved location; absent map data is not fabricated. **Priority:** P2.

#### MSD-BE-012 — Optional documents

**Source:** §2.1. Document upload/review/reminders and vendor lifecycle exist; deal/product create routes have permission/status checks. TL must distinguish document completeness from activation, listing, payout and fraud/legal controls. No security gate should be removed by inference. **Acceptance:** missing documents are tolerated only at approved gates; vendor ownership and unrelated status checks remain enforced. **Priority:** P1 after policy.

#### MSD-BE-013 — Terminology

**Source:** §2.1. Prisma/API still call vendor business `Member`; frontend and vendor routes use Vendor terminology in places. Treat as UI label request unless TL explicitly requires contract change. No wholesale rename/migration proposed. **Acceptance:** approved admin labels change without breaking API clients. **Priority:** P3.

#### MSD-BE-014 — Logo

**Source:** §2.1. `Member.logoUrl` and vendor profile/media upload/update routes already exist with media validation and ownership handling. Frontend should use these routes. **Acceptance:** vendor can replace own logo; invalid media and cross-vendor mutation rejected; public vendor data returns current logo. **Priority:** P2 integration.

#### MSD-BE-015 — Therapists disabled

**Source:** §2.1. Therapist models/API/catalog/cart/checkout are active. “Disabled” could mean hide tools, block create, block customer sale, deactivate records, or all. If sale is disabled, enforce consistently in catalog, create/update, cart and checkout revalidation while retaining historical orders. **Acceptance:** approved scope is consistently enforced and history remains readable. **Priority:** P1 decision.

#### MSD-BE-016 — Ratings

**Source:** §2.2. No Review/Rating model, schema, route or service found. Define scale, eligible purchase state, one-review policy, moderation, edits and aggregation. New review storage is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. Enforce customer ownership and purchase eligibility server-side. **Acceptance:** only eligible reviews accepted and only approved reviews contribute to displayed aggregates. **Priority:** P2.

#### MSD-BE-017 — Reward coins

**Source:** §2.2. No coin wallet, ledger or rewards flow found. Define reward amount/value, eligibility, expiry, reversal and redemption rules. Use an auditable ledger with unique review linkage and transactional/idempotent credit. New ledger is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. **Acceptance:** duplicates cannot credit twice; ineligible/rejected review earns none; balances reconcile. **Priority:** P2; depends on review rules.

#### MSD-BE-018 — Booking methods

**Source:** §2.3. Existing scheduling fields/branch hours do not implement a vendor booking-method configuration. Walk-in is an example only. TL must define full list and vendor/branch/service scope. Persist validated approved values and enforce at booking/checkout. Proposed enum/field is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. **Acceptance:** create/update accepts only approved methods and booking honors them. **Priority:** P2.

#### MSD-BE-019 — MyTherapist

**Source:** §2.4. No chatbot API/provider integration found. Decide provider, user context, accessible data/actions, retention, privacy, escalation, rate limits and outage behavior first. No provider/model is assumed here. **Acceptance:** approved assistant respects authentication and data boundaries and safely handles provider failure. Conversation persistence requires approval. **Priority:** P3 pending decisions.

#### MSD-BE-020 — Cross-location membership

**Source:** §2.5. No customer membership domain; `Member` means vendor business. Membership must be a separate concept, validate eligible active participating locations, and atomically track use. Proposed models are `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`. **Acceptance:** ineligible locations denied and concurrent redemption cannot overspend. **Priority:** P1 after rules.

#### MSD-BE-021 — Tiers

**Source:** §2.5. No tier model; names alone do not define price, benefits, validity or transitions. Approve tier catalogue and snapshot purchased tier/benefits. **Acceptance:** purchased membership retains the approved version of its benefits. **Priority:** P1 decision.

#### MSD-BE-022 — Coupon purchase

**Source:** §2.5. No membership coupon purchase/balance. Define quantity, expiry, eligible services/locations, transfer/refund/cancellation. Link confirmed payment to an entitlement ledger; prevent concurrent duplicate use. **Acceptance:** coupon balance decrements exactly once under approved redemption rules. **Priority:** P1; depends on membership policy.

#### MSD-BE-023 — Session purchase

**Source:** §2.5. No membership session purchase/balance. Define session unit, validity, partial completion, expiry and refund rules; then link paid purchase to atomic auditable balance. **Acceptance:** balance never falls below zero; confirmed purchase creates the approved amount exactly once. **Priority:** P1; depends on membership policy.

## 8. Endpoint inventory (verified representative routes)

| Method | Actual endpoint | Auth / permission | Validation/service/data | Status |
|---|---|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/cart...` | Customer auth, own cart | cart schema → `cart.service.ts` → Cart/CartItem | Existing |
| POST | `/api/v1/orders/checkout` | Customer auth | `OrderCheckoutSchema` → `order.service.ts` | Existing; pending order only |
| GET | `/api/v1/orders/me`, `/me/:id` | Customer auth, own order | order query/UUID schemas → order service | Existing; safe deal status projection gap |
| POST | `/api/v1/orders/me/:id/pay`, `/pay-cod` | Customer auth, own order | payment service → Payment | Both exist |
| POST | payment verification and batch routes | Customer auth, own order(s) | payment schemas → payment service | Existing |
| POST | `/api/v1/payments/webhook/razorpay` | HMAC signature, no user auth | raw body → payment service | Existing |
| GET | `/api/v1/catalog/deals`, `/products`, facets | Public | catalog schemas → catalog service | State/city/radius support; no rating/popular-location facet |
| GET | `/api/v1/catalog/pages/:slug` | Public | publication check → WebsitePage | Existing fixed page set |
| GET/PATCH | `/api/v1/website-pages...` | CMS RBAC | page schema/service | Existing admin CMS |
| GET/PATCH/POST | `/api/v1/vendors/me...` and media routes | Auth + `members:custom` | vendor/media schemas/services | Existing profile/logo/media |
| GET/POST/PATCH/DELETE | `/api/v1/vendors/me/deals...`, `/products...` | Vendor self gate | deal/product schemas/services | Existing |
| POST/GET | `/api/v1/vouchers/verify`, `/queue`, `/:code/...` | Auth + vendor ownership | voucher schemas/service → PurchaseEntitlement | Existing vendor redemption |

Exact route registration is verified in `apps/msd-api/src/app.ts`; route files are in `apps/msd-api/src/routes`. OpenAPI entries are in `apps/msd-api/src/openapi/registry.ts`. This inventory does not imply an unlisted endpoint exists.

## 9. Database model and relation analysis

| Existing model | Relevant use | Gap/caution |
|---|---|---|
| Cart / CartItem | Customer cart and pending order linkage | Preserve payment-triggered clear boundary |
| Order / OrderItem | Customer/vendor snapshots, product/deal/therapist lines, shipping fields | No verified customer entitlement status or product event timeline |
| Payment | Order amount/provider/status/gateway identifiers | COD exists; server-side verification authoritative |
| PurchaseEntitlement | Unique voucher code per unit, order/customer/deal/vendor relation, fulfillment status/expiry | QR is not separately modeled; confirm 30-day policy source |
| Member / MemberDocument | Vendor business and document lifecycle | Legacy naming; document policy distinct from account status |
| Branch | Address, state/city, map URL/coordinates, hours | No structured area/popular-location relation established |
| Therapist | Vendor/branch relation and packages | Active in catalog, admin and checkout |
| Deal/DealPackage, Product | Purchaseable catalog items | No Review/Rating/reward relation found |
| WebsitePage | Fixed legal page records and structured body | Compare old app inventory; current set is fixed |

**Proposed, not current schema:** Review and reward ledger; membership plan/tier/purchase/coupon/session/participating-location/redemption entities; optional locality/popular-location mappings; product shipment event history; distinct QR expiry only if existing entitlement expiry cannot represent approved policy. Each is `PROPOSED DATABASE CHANGE — TL APPROVAL REQUIRED`; no schema or migration was created.

## 10. Authentication and RBAC impact

Customer cart/order/payment routes enforce authenticated self-service. Vendor self-service uses the vendor permission gate and service-level ownership scoping; admin routes use relevant `members`, `vendors.*`, `orders`, and CMS permissions. New order fields must preserve customer ownership and avoid vendor-only secrets. Therapist disablement must be enforced at all relevant APIs if it is intended to block backend usage. Document optionality must not remove ownership, active/suspended, fraud or other independent security gates. OpenAPI security declarations and route tests must match middleware.

## 11. Payment and transaction safety

Order creation revalidates availability and current price and links a pending order to the cart for retry idempotency. Cart items remain until payment succeeds. Razorpay webhook signature validation and server-side verification exist; COD confirms in a transaction and creates entitlements. Preserve these invariants. Future tests should cover duplicate callbacks, retry/idempotency, failure preserving the cart, and exactly-once entitlement generation. COD contradiction must be resolved first.

## 12. QR and redemption safety

Voucher code and vendor redemption lifecycle exist; QR representation and fixed 30-day validity are unverified. QR should contain only an opaque code. Backend must validate expiry, correct business/entitlement, and unused status at redemption. Use atomic state transition/uniqueness to prevent duplicate redemption. Clarify whether 30 days starts at purchase, issue or activation, and whether voucher expiry changes with QR expiry.

## 13. Vendor and therapist requirements

Vendor logo upload is implemented. Vendor/branch address and map fields exist. Deal/product creation APIs exist, but optional KYC must be evaluated separately from vendor activation/listing/payout/security gates. `Member` is backend terminology for vendor business; do not rename API/Prisma solely for a UI label request. Therapist functionality is active across model, APIs, catalog, cart and checkout; agree disablement scope and preserve historic orders.

## 14. Ratings and rewards

No review/rating or coin system was located. Before implementation, define rating scale, eligible completed purchase, moderation, edits, aggregation, reward value, expiry and redemption. Review eligibility and reward issuance must be server-computed. Reward credit should be ledgered transactionally, uniquely linked to an eligible review, idempotent and auditable. Public aggregates should follow approved moderation policy.

## 15. Booking configuration

Scheduling fields exist, but not a vendor booking-method setting. Walk-in is not a complete allowed-value list. TL must define supported methods, configuration scope (vendor/branch/service) and checkout/booking behavior. Persist validated values and enforce them rather than treating them as display-only.

## 16. MyTherapist chatbot

No chatbot/conversation API or external provider was found. Decide provider, access context, data sources/actions, persistence/retention, privacy, human escalation, rate limits and failure behavior before API design. This analysis does not select an AI provider/model.

## 17. Membership module

No customer membership model/API exists. Do not reuse vendor `Member`. Approve tier prices, benefits, duration, coupon/session quantities, expiry, participating-location eligibility, cancellation/refunds and transferability first. Then implement purchase/payment-linked entitlement and atomic location-validated coupon/session redemption. Do not implement redemption before purchase and benefit rules.

## 18. Future testing requirements

No tests were run for this documentation task. Future approved implementation should test: payment/cart success and idempotency; order ownership/safe entitlement projection; product event ordering and address scoping; state/city/area and distance boundaries; public legal publication access; QR expiry/wrong-vendor/duplicate redemption; vendor ownership and optional-document gates; therapist disable policy across catalog/cart/checkout; review eligibility and exactly-once rewards; booking method validation; chatbot access isolation/failure; membership payment, participating locations, concurrent redemption and balances. Update OpenAPI and API contract tests with route changes.

## 19. Priority and implementation sequence

| Priority | IDs | Work | Reason/dependency |
|---|---|---|---|
| P0 | 001, 008 | Preserve payment/cart invariants; resolve COD discrepancy | Payment correctness; contradictory source |
| P1 | 002–004, 010 | Customer order status, shipment timeline/address, QR validity | Fulfillment UX; QR policy decision |
| P1 | 012, 015 | Vendor document policy and therapist disablement | Access/visibility decisions first |
| P1 | 020–023 | Membership domain and purchase/redemption | Commercial rules must precede schema/API |
| P2 | 005–007, 009, 011, 014 | Location/filter/legal/address/logo integration | Mostly existing capability or frontend/content work |
| P2 | 016–017 | Reviews and reward ledger | Eligibility/reward policies first |
| P2 | 018 | Booking configuration | Allowed values and scope first |
| P3 | 013, 019 | Terminology/API scope and chatbot | Compatibility/privacy/provider decisions |

Suggested order: resolve TL questions; preserve payment invariants; agree fulfillment and QR contract; settle vendor/therapist policy; define reviews/rewards and booking; approve membership commercial rules; then integrate frontend and update OpenAPI/tests.

**Backend tasks:** safely extend current services/responses; add transactional ledgers only after rules are approved.  
**Frontend dependencies:** badge refresh, order cards/timeline/address, state/area/popular-location controls, legal inventory/navigation, logo integration.  
**Database decisions:** review/reward, shipment events, locality popularity, memberships, booking method, and possibly QR expiry.  
**External integrations:** chatbot provider; map/geocoding source only if structured landmarks are required.  
**Business decisions:** COD, KYC optionality, therapist scope, booking options, reward policy, QR duration, legal inventory, membership benefits/prices/validity/locations.

## 20. Team Lead questions

1. Should COD remain? It is implemented in both backend and frontend wrappers.
2. What exactly does therapist disablement mean, including existing records and orders?
3. Which documents are optional and which lifecycle gates may still require them?
4. Are Member→Vendor changes display labels only, or are API contract changes intended?
5. Which deal redemption states should the customer see? Should voucher code also be shown?
6. What product timeline milestones/events should be displayed, and where do carrier events come from?
7. Does 30-day QR validity start at payment, issuance or activation? Does the underlying entitlement expire too?
8. What old-app legal pages/content are in scope? Are more than privacy/terms/accessibility/cookies needed?
9. What defines popular location, canonical area, and city/area filtering source?
10. What booking methods are supported and at what scope?
11. What review eligibility/moderation and coin value/expiry/redemption rules apply?
12. Which chatbot provider, data access, privacy and retention policy should MyTherapist use?
13. What are membership prices, benefits, validity, quantities, location participation, transfer/refund and redemption rules?
14. For mixed carts, is one order-level address sufficient, and can an order have multiple delivery addresses?

## 21. Final recommendations

1. Treat this as a gap-analysis baseline; several missing/unclear features require business decisions.
2. Keep cart clearing payment-triggered and server-authoritative.
3. Extend existing customer order reads for safe redemption status where possible; never expose OTP/vendor internals.
4. Reuse current state/city/radius catalog capability; define area/popularity semantics before adding schema.
5. Keep customer membership separate from vendor `Member`; make purchase and use ledgers transactional.
6. Resolve §20 before source or schema changes.

## 22. Limitations and validation summary

- The standalone `Changes_Requirement.md` was absent; the pasted text was analyzed.
- Inspection was static. No app or database was run/accessed; no tests, migrations or seed operations were run.
- Endpoint inventory is representative for requested features; cited route registrations and key flows were checked. Confirm exact response contracts during implementation.
- No frontend/backend source, Prisma schema, migration or data was changed. Only this report was created.
- Proposed API/schema behavior is not asserted as current implementation; proposed database items require TL approval.
