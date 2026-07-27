# 08 — Orders, Payments, Cancellation, Refunds

An Order is the purchase record created at checkout; each OrderItem is a bookable
voucher. Payment history, cancellation, and refunds all hang off the order.

## Entities

### Order

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `orderNumber` | string | ✔ | | Human-readable, unique | `"MSD-2026-000481"` |
| `userId` | uuid | ✔ | | | |
| `contact` | object | ✔ | | Snapshot `{ name, phone, email }` from checkout step 1 | |
| `subtotal` / `savings` / `promoDiscount` / `giftCardApplied` / `payable` | Money | ✔ | | Totals snapshot (same shape as cart totals) | |
| `promoCode` | string | | null | Snapshot | |
| `status` | enum | ✔ | `pending_payment` | Lifecycle below | |
| `placedAt` | timestamp | ✔ | | | |
| `expiresAt` | timestamp | ✔ | +30 min | Unpaid orders auto-expire, inventory released | |
| `createdAt` / `updatedAt` | timestamp | ✔ | | | |

### OrderItem (1..n per order)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `orderId` | uuid | ✔ | |
| `dealId` | uuid | ✔ | + denormalised snapshot: `dealTitle`, `companyName`, `heroImageUrl` (order history survives deal edits/archival) |
| `pricingPlanId` | uuid | ✔ | + snapshot: `planName`, `durationMinutes`, `unitPrice`, `originalPrice` |
| `locationId` | uuid | ✔ | + snapshot: `locationName`, `addressLine` |
| `quantity` | int | ✔ | |
| `bookingDate` | date | ✔ | |
| `bookingTime` | time | ✔ | |
| `voucherCode` | string | ✔ | Unique per item — shown as QR/code, partner redeems it |
| `redeemBy` | date | | From deal `redeemByDaysAfterPurchase` |
| `itemStatus` | enum | ✔ | `pending \| confirmed \| redeemed \| cancelled \| refunded \| expired` |
| `redeemedAt` | timestamp | | Set by partner redemption |

### Payment (1..n per order — retries create rows)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `orderId` | uuid | ✔ | | |
| `provider` | enum | ✔ | `razorpay \| stripe` (Razorpay primary for INR) | |
| `providerOrderId` | string | ✔ | | `"order_Nxxxx"` |
| `providerPaymentId` | string | | On success | `"pay_Nxxxx"` |
| `method` | enum | | `upi \| card \| netbanking \| wallet \| gift_card` (from provider webhook) | |
| `amount` | Money | ✔ | | |
| `status` | enum | ✔ | `created \| authorized \| captured \| failed` | |
| `failureReason` | string | | Provider error message | |
| `capturedAt` | timestamp | | | |

> Card details never touch our API — the provider's checkout SDK handles them
> (the current checkout page's card fields become the provider widget at integration).

### Cancellation (0..1 per order item)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `orderItemId` | uuid | ✔ | |
| `requestedByUserId` | uuid | ✔ | |
| `reason` | enum | ✔ | `change_of_plans \| booked_by_mistake \| found_better_price \| provider_issue \| other` |
| `note` | text | | Free text |
| `policySnapshot` | object | ✔ | `{ freeCancelHoursBefore, partialRefundPct }` at request time |
| `outcome` | enum | ✔ | `full_refund \| partial_refund \| no_refund` — computed from policy vs booking time |
| `status` | enum | ✔ | `requested \| approved \| rejected` (auto-approved inside policy window) |
| `createdAt` | timestamp | ✔ | |

### Refund (0..n per order)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `orderId` | uuid | ✔ | |
| `orderItemId` | uuid | | Item-level when from a cancellation |
| `cancellationId` | uuid | | Source cancellation, if any |
| `amount` | Money | ✔ | |
| `destination` | enum | ✔ | `original_method \| gift_card_credit` |
| `providerRefundId` | string | | From gateway |
| `status` | enum | ✔ | `requested → approved → processing → processed \| rejected \| failed` |
| `reason` | text | ✔ | |
| `processedAt` | timestamp | | |

## Order status lifecycle

```
pending_payment ──(payment captured)──→ confirmed ──(all items redeemed)──→ completed
      │                                     │
      ├─(30 min timeout / failed)→ expired  ├─(all items cancelled)→ cancelled
                                            └─(refund processed)→ refunded (partial stays confirmed)
```

Item-level `itemStatus` drives the order rollup; mixed states keep the order `confirmed`.

## Endpoints

### Consumer

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/me/orders` | user | Order history (offset paginated, newest first, filter `?status=`) |
| GET | `/me/orders/:id` | user | Full detail: items, vouchers, payments, refunds |
| GET | `/me/orders/:id/invoice` | user | PDF invoice (generated, GST breakdown) |
| GET | `/me/payments` | user | **Payment history** — flat transaction list across orders |
| POST | `/me/order-items/:id/cancel` | user | Request cancellation `{ reason, note? }` → outcome per policy |
| GET | `/me/refunds` | user | Refund list + statuses |

### Payment webhooks / confirmation

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/payments/webhook/razorpay` | signature-verified | Capture/failure events → order transitions (idempotent by event id) |
| POST | `/orders/:id/confirm-payment` | user | Client-side fallback: verify provider signature after checkout widget success |

### Partner

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/partner/bookings?companyId=&date=&locationId=` | partner | Day sheet of confirmed bookings |
| POST | `/partner/redeem` | partner | `{ voucherCode }` → marks item `redeemed` (`409` if already redeemed/cancelled/expired) |
| GET | `/partner/payouts` | partner | Settlement summaries (deferred detail — open question) |

### Admin

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/orders` | admin, sales | Search all orders |
| POST | `/admin/refunds/:id/approve` / `/reject` | admin | Manual review queue (out-of-policy requests) |
| POST | `/admin/order-items/:id/cancel` | admin | Force cancel (provider issue) with full refund |

### GET /me/payments — response item

```json
{
  "id": "018f...",
  "orderNumber": "MSD-2026-000481",
  "date": "2026-07-14T10:02:11Z",
  "description": "Summer Glow Package × 1",
  "method": "upi",
  "amount": { "amount": 354820, "currency": "INR" },
  "status": "captured",
  "direction": "debit"
}
```

Refunds appear in the same list with `"direction": "credit"`.

## Zod schemas

`OrderResponseSchema`, `OrderListItemSchema`, `OrderItemResponseSchema`,
`PaymentResponseSchema`, `PaymentHistoryItemSchema`, `CancellationRequestSchema`,
`CancellationResponseSchema`, `RefundResponseSchema`, `RedeemRequestSchema`,
`RazorpayWebhookSchema`.

## Open questions

- [ ] Payment provider: Razorpay (stack default, INR-native) vs Stripe — confirm.
- [ ] Partner payout/settlement schema (frequency, commission deduction, ledger) — separate doc when the partner dashboard is scoped.
- [ ] Rebooking (change date/time after purchase) — v1 = cancel + rebuy, or a `POST /me/order-items/:id/reschedule`?
- [ ] Invoice: GST invoice issued by MSD or by the partner? Affects invoice fields.
