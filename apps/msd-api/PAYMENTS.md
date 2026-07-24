# Razorpay integration — setup & local testing

msd-api integrates Razorpay (test mode by default) for checkout payments. This
covers required env vars, how to get them, and how to exercise the full
payment lifecycle locally.

## Required env vars (`apps/msd-api/.env.local`)

| Var | Where it's used | Required for |
|-----|------------------|---------------|
| `RAZORPAY_KEY_ID` | Client-side (`Razorpay Checkout` widget) + server-side order creation | `POST /checkout` |
| `RAZORPAY_KEY_SECRET` | Server-side: creates orders, fetches payments, signs the checkout-success signature | `POST /checkout`, `POST /orders/:id/confirm-payment` |
| `RAZORPAY_WEBHOOK_SECRET` | Server-side: verifies the `X-Razorpay-Signature` header on incoming webhooks | `POST /payments/webhook/razorpay` |

All three are read as **optional** in `env.ts` — the app boots fine without
them. Routes that need Razorpay return `503 payment_gateway_not_configured`
instead of crashing, so masters/deals/cart stay testable without any Razorpay
account at all.

## Getting `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`

1. Sign up / log in at https://dashboard.razorpay.com (a Razorpay account is
   free; test mode needs no business verification).
2. Make sure the dashboard is in **Test Mode** (toggle top-left).
3. Settings → API Keys → **Generate Test Key**. Copy both values into
   `.env.local` — the secret is only shown once.

Test key IDs look like `rzp_test_xxxxxxxxxxxxxxxx`.

## Getting `RAZORPAY_WEBHOOK_SECRET`

This is a **separate** secret from `KEY_SECRET`, tied to a specific webhook
endpoint you register in the dashboard (Settings → Webhooks → Add New
Webhook). For a publicly reachable staging/prod URL:

1. Add a webhook pointing at `https://<your-domain>/api/payments/webhook/razorpay`.
2. Subscribe to at least `payment.captured` and `payment.failed`.
3. Razorpay shows you the secret once at creation — put it in the deployment's
   env, not in git.

**For local dev**, since `localhost` isn't reachable from Razorpay's servers,
this repo doesn't require a real webhook registration — `.env.local` just
needs *some* secret so the signature-verification code path is exercised. A
random one was generated for you (`crypto.randomBytes(32).toString('hex')`).
Two ways to actually test webhook delivery locally if you want the real thing
end-to-end:
- **Razorpay CLI**: `razorpay-cli listen --url localhost:4300/api/payments/webhook/razorpay`
  forwards real test-mode events and prints the CLI-specific secret to use.
- **ngrok**: tunnel `localhost:4300`, register the ngrok URL as a dashboard
  webhook, use the secret Razorpay gives you for *that* webhook.

Without either, you can still verify the handler's logic (signature
rejection, idempotent capture, DB status transitions) by POSTing a
self-signed synthetic payload — see "Testing" below.

## Payment lifecycle (what the code does)

1. `POST /checkout` — re-validates the cart, creates an `Order`
   (`pending_payment`) + `OrderItem`s, calls Razorpay's Orders API, creates a
   `Payment` row (`status: created`), returns `{ orderId, payment: { provider,
   providerOrderId, amount, keyId } }`.
2. Frontend opens `new window.Razorpay({ key: keyId, order_id: providerOrderId, ... })`.
3. **Success**: the widget's `handler` fires client-side with
   `razorpay_payment_id`/`razorpay_order_id`/`razorpay_signature`. The
   frontend POSTs these to `/orders/:id/confirm-payment`, which verifies the
   HMAC (`order_id|payment_id` signed with `KEY_SECRET`), fetches the payment
   from Razorpay, and marks it `captured` → `Order.status = confirmed` →
   every `OrderItem.itemStatus = confirmed`, and clears the buyer's cart.
4. **User closes the modal**: `modal.ondismiss` fires client-side only — no
   server call, no `Payment` row exists yet beyond `created`, the `Order`
   stays `pending_payment` (auto-expires after 30 min, checked lazily on
   read) and the cart is untouched so the user can retry.
5. **Payment fails** (declined card etc.): Razorpay fires `payment.failed` —
   both a client-side event (`razorpay.on('payment.failed', ...)`, shown
   inline) and, once a webhook is registered, a server-side webhook — the
   webhook handler marks the `Payment` row `failed` with `failureReason`; the
   `Order` stays `pending_payment` so the user can retry the same checkout.
6. `POST /payments/webhook/razorpay` is the source of truth for both
   `payment.captured` and `payment.failed` — it's idempotent (keyed on
   `providerOrderId`, a no-op if already `captured`), so it's safe if both the
   client-side confirm and the webhook land for the same payment.

## Test cards (Razorpay test mode)

| Scenario | Card number | Expiry / CVV / OTP |
|----------|-------------|---------------------|
| Success | `4111 1111 1111 1111` | any future date / any 3 digits / `1234` |
| Failure (generic decline) | `4000 0000 0000 0002` | same |

Full list: https://razorpay.com/docs/payments/payments/test-card-upi-details/

## Testing without a browser

`apps/msd-api` has a vitest suite (`npx nx test msd-api`) covering:
- `lib/razorpay.ts` signature verification (valid/invalid/tampered payloads)
- `payments.service.ts` capture/fail idempotency
- the webhook route's signature rejection + event handling

These don't need real Razorpay credentials — they sign payloads with a test
secret the same way Razorpay does. What they **can't** replace: actually
clicking through the hosted Checkout.js iframe (that's Razorpay's UI, outside
this codebase) — do one real test-mode payment yourself once keys are in
place, using the card table above.
