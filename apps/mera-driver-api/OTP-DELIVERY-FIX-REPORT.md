# OTP delivery fix — 3 October 2026

## Findings

The earlier local mobile OTP attempt failed before any provider HTTP response, with network `EACCES`. A read-only HEAD request to the configured SMS gateway's public origin reproduced EACCES in the sandbox and returned HTTP 200 with approved network access. No credentials, API parameters, message or OTP were sent in that check. The current API on port 3334 is running the rebuilt code with approved network access.

No newer request from the reported browser was present in this API during investigation; the latest original local challenge was the earlier mobile-login attempt. The exact failed request URL was requested from the user. Gateway reachability does not prove API credentials, sender/template acceptance, balance or delivery to a handset.

Two actual UI bugs were found: Sign-in navigated to the OTP screen even when sending failed; Resend ignored errors and restarted its cooldown regardless of delivery. Both are fixed in the existing components. Authentication/ownership rules remain unchanged.

## Changes

* Existing SMS request contract and configured endpoint are retained. Configuration, blocked-network, timeout, authentication, rate-limit, rejected-response and unavailable-provider failures now produce safe HTTP 503 `OTP_*` errors instead of generic `SERVER_ERROR`. HTTP 200 without a successful provider result remains rejected; no automatic retry or fake delivery success was added.
* Provider logs no longer print full responses, error messages, recipients, OTPs or credentials. Only static failure categories, timing and HTTP status are logged.
* Failed sends retain their challenge record but expire that exact undelivered challenge. Verification cannot use that failed code. Existing challenge history and account-enumeration protection are preserved.
* SMTP has bounded connection/greeting/socket timeouts, verifies intended-recipient acceptance, validates the port, and recreates cached transport after credential changes. SMTP acceptance is not claimed as proof of final inbox delivery.
* Sign-in displays the real backend failure and stays on Sign-in. Duplicate in-flight requests are blocked. Resend displays errors and starts its existing cooldown only after success.

## Files

Backend:

* src/providers/otp-delivery-error.ts
* src/providers/sms/connectExpress.provider.ts and connectExpress.provider.test.ts
* src/providers/email/smtp.provider.ts and smtp.provider.test.ts
* src/services/otp.service.ts
* src/routes/auth.routes.test.ts
* verification/otp-connectivity.cjs
* verification/otp-delivery-smoke.cjs
* verification/artifacts/otp-send-failure.png, otp-resend-failure.png and otp-delivery-results.json

Frontend:

* src/app/pages/sign-in/sign-in.ts and sign-in.spec.ts
* src/app/pages/otp/otp.ts, otp.html and otp.spec.ts

All intentional edits remain within the two permitted apps. The pre-existing root TASK.md and other work were preserved. No migration or data reset was needed.

## Verification

* Backend: **483 tests / 33 files passed**, including 27 new provider tests. No live provider is invoked by automated tests.
* Frontend: **173 tests / 22 files passed**, including Sign-in failure/navigation and Resend failure/cooldown tests.
* Both TypeScript checks and both production builds passed. Existing Driver Details CSS and shared test-setup warnings remain.
* Real local browser failure paths passed against an isolated API on port 3335 with SMS_API_KEY explicitly empty: real HTTP 503, truthful UI, expired challenge and no SMS. Browser requests were redirected only by the verification harness; production frontend API configuration was not changed.
* Verification cleaned only captured fixture challenge IDs. Original challenge count was preserved; 7 Drivers and 12 Users remain.
* Rebuilt normal API on port 3334 restarted with approved network access. No automatic real SMS, Razorpay or IDSPay call was made.

## Remaining live check

Real provider acceptance and handset delivery remain unverified. The user must retry their own login against the running API. If it fails, the exact request URL and new safe `OTP_*` response identify the next issue; secrets and OTP values must not be shared. Do not treat the fixture configuration failure or public-origin HTTP 200 as a successful live OTP delivery.

Evidence: [send failure](verification/artifacts/otp-send-failure.png), [resend failure](verification/artifacts/otp-resend-failure.png), [results](verification/artifacts/otp-delivery-results.json).
