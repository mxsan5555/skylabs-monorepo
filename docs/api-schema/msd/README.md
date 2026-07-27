# MSD API Schema — Design Docs

Reviewable schema design for `apps/msd-api` (Express + TypeScript + Zod + zod-to-openapi +
Prisma + PostgreSQL). **No code exists yet** — these docs are the contract we agree on
before backend and frontend integration work starts.

Every doc follows the same format: entity field tables → enums → relationships →
endpoints → Zod schema names → open questions.

## Docs

| # | File | Domain |
|---|------|--------|
| — | [00-conventions.md](00-conventions.md) | API-wide conventions: auth, errors, pagination, money, IDs |
| 1 | [01-auth.md](01-auth.md) | Login: phone/email OTP, Google OAuth, JWT, sessions |
| 2 | [02-users.md](02-users.md) | User, profile, my-account, addresses, wishlist |
| 3 | [03-companies.md](03-companies.md) | Company (partner) registration, verification, locations, hours, staff |
| 4 | [04-categories.md](04-categories.md) | Categories + subcategories taxonomy |
| 5 | [05-deals.md](05-deals.md) | Deals, menus, packages, pricing plans, fine print, lifecycle |
| 6 | [06-search.md](06-search.md) | Search, filters (price/category/features/distance), map-based search |
| 7 | [07-cart-checkout.md](07-cart-checkout.md) | Server-side cart, promo/gift codes, slot availability, checkout |
| 8 | [08-orders-payments.md](08-orders-payments.md) | Orders/bookings, payment history, cancellation, refunds |
| 9 | [09-reviews.md](09-reviews.md) | Reviews & ratings, partner replies, moderation |
| 10 | [10-support.md](10-support.md) | Support tickets, FAQ, contact form |
| 11 | [11-content-navigation.md](11-content-navigation.md) | Header/footer links, nav, home sections (API-served content.json) |

## Entity relationship overview

```
User ─────────────┬─ Wishlist ── Deal
                  ├─ Cart ── CartItem ── Deal + PricingPlan
                  ├─ Order ── OrderItem ── Deal + PricingPlan
                  │     ├─ Payment (1..n)
                  │     ├─ Cancellation (0..1)
                  │     └─ Refund (0..n)
                  ├─ Review ── Deal / Company
                  ├─ Address (0..n)
                  └─ SupportTicket ── TicketMessage (1..n)

Company ──────────┬─ Location (1..n) ── OpeningHours / HolidayOverride
(owned by a User  ├─ StaffMember (0..n)
 with `partner`   ├─ MediaAsset (0..n)
 role)            └─ Deal (0..n)

Deal ─────────────┬─ PricingPlan (1..n)     ← duration-based price variants
                  ├─ MenuItem (0..n)        ← service menu lines
                  ├─ Package (0..n) ── PackageItem
                  ├─ DealCategory (1..n)    ← many-to-many to Category/Subcategory
                  ├─ MediaAsset (1..n)
                  └─ ReviewAggregate (computed)

Category ── Subcategory (1..n)
```

## Review checklist

- [ ] 00-conventions — money format, error envelope, pagination style agreed
- [ ] 01-auth — OTP provider + token lifetimes agreed
- [ ] 02-users — profile fields complete
- [ ] 03-companies — legal/verification fields complete for Indian businesses
- [ ] 04-categories — taxonomy depth (2 levels) confirmed
- [ ] 05-deals — pricing plan model covers all real deal shapes
- [ ] 06-search — filters match frontend + map needs
- [ ] 07-cart-checkout — slot model works for spa bookings
- [ ] 08-orders-payments — cancellation/refund policy windows agreed
- [ ] 09-reviews — moderation flow agreed
- [ ] 10-support — ticket categories agreed
- [ ] 11-content-navigation — which content stays in content.json vs moves to API
