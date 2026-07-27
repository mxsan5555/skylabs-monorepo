# 07 — Cart, Availability & Checkout

Server-side cart replacing today's `msd_cart` localStorage (guest carts merge on login).
Checkout converts a cart into an Order (08-orders-payments).

## Entities

### Cart

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | uuid | ✔ | | |
| `userId` | uuid | | null | Null for guest carts |
| `guestToken` | string | | null | Opaque token in a cookie for guest carts |
| `promoCode` | string | | null | Applied promo (validated at checkout too) |
| `giftCardCode` | string | | null | Applied gift card |
| `expiresAt` | timestamp | ✔ | +30 days | Idle carts purged |
| `createdAt` / `updatedAt` | timestamp | ✔ | | |

One active cart per user (or guest token).

### CartItem

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `cartId` | uuid | ✔ | | |
| `dealId` | uuid | ✔ | Must be `live` | |
| `pricingPlanId` | uuid | ✔ | Must be an active plan of the deal — **new vs frontend** `CartItem` | |
| `locationId` | uuid | ✔ | Chosen redeemable branch | |
| `quantity` | int | ✔ | 1..10, capped by `maxPerCustomer` + inventory | |
| `bookingDate` | date | | Chosen date (may be picked at checkout instead) | `"2026-07-20"` |
| `bookingTime` | time | | Chosen slot start | `"14:30"` |
| `priceSnapshot` | Money | ✔ | Plan price when added — repriced + flagged if plan changed | |

> Frontend migration: `CartItem` in `types/index.ts` gains `pricingPlanId` and
> `locationId`; `selectedDate`/`selectedTime` → `bookingDate`/`bookingTime`.

### Cart totals (computed, returned on every cart response)

```json
{
  "subtotal":        { "amount": 449800, "currency": "INR" },
  "savings":         { "amount": 100000, "currency": "INR" },
  "promoDiscount":   { "amount": 44980,  "currency": "INR" },
  "giftCardApplied": { "amount": 50000,  "currency": "INR" },
  "payable":         { "amount": 354820, "currency": "INR" }
}
```

`savings` = Σ(originalPrice − price) — matches the cart page's existing Discount row.

### PromoCode (admin/marketing-managed)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `code` | string | ✔ | Unique, uppercased | `"WELCOME20"` |
| `kind` | enum | ✔ | `percent \| fixed` | |
| `value` | int | ✔ | Percent (1–100) or paise | `20` |
| `maxDiscount` | Money | | Cap for percent codes | |
| `minSubtotal` | Money | | Eligibility floor | |
| `scope` | enum | ✔ | `all \| category \| company \| deal` (+ `scopeId`) | |
| `firstOrderOnly` | bool | ✔ | The "Welcome Offer 20%" on home = `WELCOME20` with this flag | |
| `usageLimitTotal` / `usageLimitPerUser` | int | | | |
| `validFrom` / `validUntil` | timestamp | ✔ | | |
| `isActive` | bool | ✔ | | |

### GiftCard

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `code` | string | ✔ | Unique, redeemable code |
| `initialBalance` / `balance` | Money | ✔ | Partial redemption supported |
| `purchasedByUserId` | uuid | | Buyer (gift cards purchasable later — order kind `gift_card`) |
| `recipientEmail` | string | | Delivery target |
| `status` | enum | ✔ | `active \| depleted \| expired \| disabled` |
| `expiresAt` | timestamp | | Product says "never expire" today → null |

## Availability (slot check)

Slots are derived, not stored: location opening hours (03-companies) minus existing
confirmed bookings vs per-slot capacity.

```
GET /deals/:slug/availability?pricingPlanId=&locationId=&date=2026-07-20
```

```json
{
  "date": "2026-07-20",
  "slots": [
    { "time": "10:00", "available": true },
    { "time": "11:00", "available": true },
    { "time": "12:00", "available": false, "reason": "full" }
  ]
}
```

- Slot grid = plan `durationMinutes` rounded to 30-min starts within opening hours.
- `capacityPerSlot` lives on Location (default, e.g. 3 concurrent) — simple v1 model.
- Checkout re-validates; a taken slot returns `409 SLOT_UNAVAILABLE`.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/cart` | user or guest token | Current cart, hydrated items + totals |
| POST | `/cart/items` | user/guest | Add `{ dealId, pricingPlanId, locationId, quantity, bookingDate?, bookingTime? }` |
| PATCH | `/cart/items/:id` | user/guest | Change quantity / date / time / plan |
| DELETE | `/cart/items/:id` | user/guest | Remove |
| DELETE | `/cart` | user/guest | Clear |
| POST | `/cart/merge` | user | Merge guest cart on login `{ guestToken }` |
| POST | `/cart/promo` | user/guest | Apply `{ code }` → new totals; `422 PROMO_INVALID / PROMO_NOT_ELIGIBLE` |
| DELETE | `/cart/promo` | user/guest | Remove promo |
| POST | `/cart/gift-card` | user/guest | Apply gift card code |
| GET | `/deals/:slug/availability` | public | Slot availability (above) |
| POST | `/checkout` | **user only** | Validate everything → create Order + PaymentIntent (08) |

### POST /checkout

```json
// request
{
  "contact": { "name": "Asha Rao", "phone": "+919812345678", "email": "asha@example.com" },
  "items": [
    { "cartItemId": "018f...", "bookingDate": "2026-07-20", "bookingTime": "14:30" }
  ]
}
// 201
{
  "orderId": "018f...",
  "payment": {
    "provider": "razorpay",
    "providerOrderId": "order_Nxxxxx",
    "amount": { "amount": 354820, "currency": "INR" },
    "keyId": "rzp_live_xxx"
  }
}
```

Validation sequence: items still live → plans active → inventory + `maxPerCustomer` →
slots free → promo/gift card still valid → repriced totals equal client-confirmed totals
(else `409 CART_CHANGED` with fresh cart). Order starts `pending_payment` (08).
Checkout requires auth — matches the current `/sign-in?next=/checkout` frontend flow.

## Zod schemas

`CartResponseSchema`, `CartItemAddSchema`, `CartItemUpdateSchema`, `CartMergeSchema`,
`PromoApplySchema`, `AvailabilityQuerySchema`, `AvailabilityResponseSchema`,
`CheckoutRequestSchema`, `CheckoutResponseSchema`, `PromoCodeSchema`, `GiftCardSchema`.

## Open questions

- [ ] Guest cart: cookie-based `guestToken` vs requiring login to add — current UX allows anonymous carts, keep it?
- [ ] Slot granularity 30 min ok? Per-location configurable start interval?
- [ ] Should promo + gift card stack? (Assumed yes: promo first, then gift card against payable.)
