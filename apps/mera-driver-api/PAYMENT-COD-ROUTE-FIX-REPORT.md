# Driver routes, PDF and COD/Razorpay correction — 2026-10-01

This continuation preserves the existing implementation. All edits stayed in the two permitted app paths; existing TASK.md and app work remain intact. No schema/migration/data reset was needed. Migration status remains 16 applied migrations, schema up to date. Local verification fixtures were cleaned, preserving 6 Drivers, 2 Customers and 1 Booking.

## Root causes

1. The running Express process on port 3334 was an old Nx-launched build. Before restart, /health succeeded but /workflow/catalog, /workflow/driver/overview and /workflow/drivers/2486a8ba-c616-4fdb-a385-58416909458e/overview all returned route-not-found. Current Angular and Express source already agreed: environment.apiUrl is http://localhost:3334; createApp mounts workflowRoutes at /workflow; driver-owned overview is singular /driver/overview; staff record overview is plural /drivers/:id/overview. No alias or duplicate endpoint was added. The identified stale API child and its Nx executor were restarted with the rebuilt application on the same port; frontend 4400 and data were preserved. /health now exposes a non-sensitive workflow revision marker cod-razorpay-v2. Protected overview routes return authentication errors without credentials, and succeed for authorized users.
2. Driver View embeds a staff workflow overview. That old-server 404 was associated with the PDF/detail experience; the binary PDF endpoint itself is /drivers/:id/profile.pdf and requires drivers:export. The frontend previously labelled every PDF error as a permission problem. It now parses JSON error Blobs and displays the actual HTTP status/message, including route, permission, renderer and connection failures.
3. Booking checkout omitted the payment-method selector and booking creation relied on legacy payment defaults. It now offers Cash on Delivery (COD) and Razorpay, stores the selected existing paymentMode, explicitly creates unpaid bookings, and never creates a collection from a selection.
4. Razorpay callback previously sent only payment ID. It now sends payment ID, order ID and signature. The backend resolves the owned saved order, verifies HMAC using server-only secret, then fetches the provider payment and requires captured INR funds matching saved order/amount. A callback or UI success cannot mark Paid. Signature construction follows the official Razorpay server integration contract: https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/.

## Payment and settlement behavior

Backend quote and saved pricing determine booking amount. COD remains unpaid/collection-pending until the existing permission-protected Accounts confirmation records actual funds, transaction reference, actor, time and reason. Unpaid or incomplete trips cannot generate driver payable/earned commission. Customer details, driver trip/request views, Dispatch, existing admin Booking list, Accounts and invoice show the selected method and payment status.

Selecting Razorpay creates a real booking first, then starts checkout using its backend order. Only the public Key ID is returned to checkout. Modal dismissal and payment.failed show clear messages without collecting money. Captured webhook handling uses original raw-body signature verification and unique provider payment references. Duplicate callbacks/webhooks use the existing idempotent ledger; failed events cannot downgrade paid intents; a delayed captured event can reconcile a failed intent. A definite rejected order is marked failed; a timeout/uncertain creation stays processing and blocks automatic duplicate orders pending reconciliation.

Payout/refund actions remain authorized manual settlement confirmations requiring a transaction reference and audit reason; they do not represent a transfer request as a completed transfer or initiate provider/bank transfers. Existing balance checks prohibit payout before completed settlement and require recovery before refunding paid-out driver share.

## Credential inspection, without values

The populated file is apps/mera-driver-api/.env.local. Git check-ignore confirms it and the backend .env are ignored. No credential files were edited or committed. The backend loader reads this file before other modules during local development, retains existing host-variable precedence, then reads backend .env only as fallback. Startup of the rebuilt server confirmed this local file was loaded. Production requires platform-injected environment variables; the loader deliberately skips local files in production.

| Variable | Local configuration |
| --- | --- |
| RAZORPAY_KEY_ID | Populated; prefix identifies test mode |
| RAZORPAY_KEY_SECRET | Populated; server-only |
| RAZORPAY_WEBHOOK_SECRET | Separately populated; server-only |
| IDSPAY_DL_API_ID | Populated; server-only |
| IDSPAY_DL_API_KEY | Separately populated; server-only |
| IDSPAY_DL_TOKEN_ID | Populated; server-only |

No missing variables among those six. Populated IDSPay credentials are not proof of validity. Its exact srv2/validation/dl method, response contract/codes and token lifecycle remain unconfirmed; live calls and success mapping stay disabled. No IDSPay endpoint was called.

## Verification

- Backend: **325 tests / 24 files passed** (previous 310 preserved). New regression checks cover mounted singular/plural workflow routes, own-driver resolution, staff overview/export permissions, binary PDF type/filename/bytes, COD/Razorpay unpaid creation, callback HMAC/captured validation, duplicate signed webhooks, failed/delayed events, saved amount, rejected order and uncertain-order duplicate prevention.
- Frontend: **126 tests / 16 files passed** (previous 120 preserved). Added COD/Razorpay selection, saved booking ID checkout, callback signature fields, modal cancellation and actual JSON Blob error handling.
- Both Nx production builds passed. Existing Angular font retrieval required approved external network access; no root or shared dependency/configuration change was made. Existing shared-ui test compiler warning remains outside scope.
- Running browser: Angular localhost:4400 and rebuilt backend localhost:3334. Driver login/Trip Requests/Accept, customer owned booking and shared trip progression, admin Dispatch/Accounts, verifier limits and suspension/ownership checks passed against real PostgreSQL. COD checkout stayed unpaid with zero collected/commission/payable until actual authorized collection.
- PDF: authorized real backend downloads for partial (6 pages), complete (10 pages), completed-trip (9 pages), actual partial list download (6 pages), actual complete browser download (10 pages) and invoice (1 page). Header signature %PDF-, non-empty bytes and required section text verified; pages visually inspected. Unit routes additionally assert application/pdf and attachment filename under drivers:export. Blob errors retain their actual HTTP reason.
- Controlled Razorpay test-mode checkout: real backend test order and fully rendered Razorpay iframe showed ₹10 and Test Mode. **No payment was submitted.** Booking remained unpaid; ledger contained zero collection. Two unpaid test-mode orders were created while checking initial/full rendering; local fixtures were removed. No live charge, refund or payout was initiated.
- Signed provider-event fixtures against real local HTTP/PostgreSQL separately verified failed attempt/unpaid/zero totals, delayed capture, duplicate capture counting once, late failure retaining Paid, no earning before trip completion, and forged callback rejection. These are explicitly fixtures, not real gateway payment confirmation.

Evidence: verification/artifacts/results.json, connected-results.json, payment-webhook-fixture-results.json, razorpay-test-checkout-results.json, razorpay-test-checkout.png and pdf-results.json. Scripts: ui-smoke.cjs, connected-smoke.cjs, checkout-test-mode.cjs and payment-webhook-fixtures.cjs. The current API is left running on port 3334 with NODE_ENV=development so the ignored local backend environment loads; the original Angular service is preserved.

## Files changed in this correction

Backend: src/app.ts (runtime marker); src/routes/workflow.routes.ts and new workflow.routes.test.ts; src/services/trip-workflow.service.ts, workflow.service.test.ts, payment-provider.service.ts, payment-provider.service.test.ts and booking-invoice.service.ts. Frontend: new core/http-error.ts/spec.ts; pages/account/drivers/drivers.ts; pages/workflow/workflow.ts/html/spec.ts; pages/account/trips/bookings/bookings.ts. Verification: existing ui/connected scripts extended with configurable ports/direct API checks and COD totals; new controlled-checkout and signed-webhook-fixture scripts, artifacts and reports. No new migration.

## Remaining external verification

- A controlled captured Razorpay test payment plus real provider-delivered webhook/callback round trip has not been submitted/verified. Local webhook secret is configured, but provider dashboard subscription and a reachable webhook endpoint must be checked. Production/live mode settlement and automated bank/provider payout/refund execution are not claimed complete.
- IDSPay request structure and human KYC remain implemented; exact endpoint contract is still required before live verification despite populated credentials.
- Production binary PDF requires installed/configured Chromium. Local backend generation works.
