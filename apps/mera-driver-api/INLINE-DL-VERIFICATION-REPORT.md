# Inline Driving Licence verification

Date: 5 October 2026. All intentional edits are inside `apps/mera-driver` and `apps/mera-driver-api`. Existing work, records and migrations were retained. No schema change or migration is needed: this extends the existing DL audit/preflight service and onboarding pill saves.

## Implemented field behavior

Both staff Add/Edit onboarding and the driver's own profile use the existing Documents Details → Driving License Details form. The DL field's blur triggers the inline controller after complete input. It does not call on keystrokes. Missing DOB shows exactly “Please complete Date of Birth in Personal Details”, with no save/check/provider request. DOB is sourced from the same driver's Personal Details.

For an existing saved Driver, the existing partial-save API saves only the licence pill before checking. The controller verifies that saved DL/DOB match the current inputs; an unsaved conflicting DOB must first be saved in Personal Details. Blur never creates another Driver, saves unrelated pills or completes onboarding. If Add Driver has no ID yet, the user is instructed to save its existing draft first.

Existing driver consent is required for the exact saved submission and current linked login account. The driver can explicitly record it inline. Staff cannot impersonate that consent; staff onboarding shows an actionable instruction if it is absent. A staff-created Driver with no linked login needs the existing Create Driver User flow before obtaining portal consent; no staff-imputed consent policy was invented. Staff uses existing `drivers:edit`/`drivers:view` permissions. The KYC verifier's existing assigned-review preflight endpoint and checklist remain unchanged.

The same audit-backed service handles inline requests, normalized DL/DOB matching, row locking and history. Repeated unchanged blurs do not initiate another check; concurrent non-retry requests reuse the existing attempt under the Driver row lock. Retry is explicit and uses the existing bounded limiter (10 requests/minute per IP on this authenticated surface). No automatic paid retry is enabled.

Inline states include Not checked, Checking DL…, unavailable/retry and consent/input errors. Presentation code also distinguishes confirmed valid, expired, explicit no-record and identity mismatch DTOs. A tick requires an enabled provider, an actual provider call, confirmed identity and a real current expiry. Unknown, malformed, incomplete or blocked evidence cannot show a tick. Those presentation branches were tested with clearly identified DTO fixtures; they are not claimed as live provider results.

Input/driver changes clear applicability immediately. Generation and identity guards reject delayed responses for old DL/DOB or a previously opened Driver, including responses after the view is destroyed. Restored state applies only to matching normalized inputs. History remains visible separately from the current applicable result.

Confirmed dates may fill only blank fields. Conflicting entered dates are preserved with a discrepancy warning. Missing/NA/malformed dates are never filled. Date changes do not trigger another verification loop. Because live verification remains blocked, no real provider date autofill was performed or claimed.

Driver Details already consumes this same DL state. The driver dashboard now displays it explicitly; the existing Drivers DataTable has a separate optional DL API column. Existing manual licence status/filter behavior remains separate and is labelled “Licence (human review)”; it is not relabelled as an API result. List status enrichment is limited to the server-paginated records, never all Driver records.

## Backend routes and safeguards

- `GET/POST /drivers/me/dl-verification`: ownership is resolved from the authenticated user; browser IDs/verification flags are rejected and cannot establish ownership.
- `GET /drivers/:id/dl-verification`: existing `drivers:view` staff permission.
- `POST /drivers/:id/dl-verification`: existing `drivers:edit` staff permission, exact saved-input comparison, consent and row-locked audit/preflight service.
- Existing `POST /drivers/me/dl-consent` and `POST /drivers/:id/dl-verification/preflight` are reused/preserved.

The new endpoints do not accept a Verified flag, approve KYC, pass checklist items, activate an account, collect fees, change availability or bypass trip eligibility. Only restricted metadata/history is returned; credentials and raw provider responses are not returned or persisted. Blocked preflights are explicitly labelled as provider-not-called in the UI.

## Provider contract and live-call status

**Live call status: disabled; no production request made.** The existing `DL_CONTRACT_CONFIRMED = false` remains unchanged. The exact configured endpoint remains `https://javabackend.idspay.in/api/v1/prod/srv2/validation/dl`. The existing request builder uses `api_id`, `api_key`, `token_id`, saved `dlNumber` and explicitly validated `DD-MM-YYYY` DOB. HTTP 200 alone is never verification evidence.

Read-only configuration inspection confirmed all four variable names are populated in the ignored backend `.env.local`: `IDSPAY_DL_API_URL`, `IDSPAY_DL_API_ID`, `IDSPAY_DL_API_KEY`, `IDSPAY_DL_TOKEN_ID`. No values were printed or moved to Angular. The existing backend local environment loader reads that file. Actual browser preflights reached Manual review required with `IDSPAY_CONTRACT_UNCONFIRMED`, rather than missing-config success or Invalid DL.

Exact remaining blockers:

1. Authoritative HTTP method and required headers for the supplied `srv2/validation/dl` endpoint.
2. Token expiry, refresh/renewal behavior and whether token reuse has constraints.
3. The actual redacted success and result-code-103 response samples with confirmation that they belong to this exact endpoint. The current repository contains synthetic structural/negative tests, not those supplied samples.
4. Confirmed field mapping for active status, issue date, transport/non-transport validity, vehicle classes and result codes. No entitlement is inferred from the website's Commercial/Non-commercial business category.

The public [IDSPay DL PLUS page](https://www.idspay.in/driving-licence-verification-plus) documents a different `api.idspay.in/v3/kyc/dl-plus/verify` endpoint and authentication format. It was inspected for context and was not substituted for the configured srv2 endpoint. It cannot confirm this integration's contract.

The existing fail-closed parser and transport error tests are retained. Without the exact fixtures/contract, live execution, confirmed success parsing and applicable provider validity mapping remain blocked. Enabling one flag is not sufficient or authorized to declare those parts complete.

## Files changed for this task

Backend, relative to `apps/mera-driver-api`:

- `src/services/driver-dl.service.ts`, `driver-dl.service.test.ts`.
- `src/services/driver-list.service.ts`.
- `src/routes/drivers.routes.ts`, `drivers.routes.test.ts`, `driverSelf.routes.ts`, `driverSelf.routes.test.ts`.
- `verification/inline-dl-smoke.cjs`, its screenshots/results in `verification/artifacts`, and this report.

Frontend, relative to `apps/mera-driver/src/app`:

- `core/drivers/dl-verification-api.service.ts`, `drivers-api.service.ts`.
- `shared/inline-dl/inline-dl.ts`, `inline-dl.html`, `inline-dl.spec.ts`.
- `pages/account/drivers/drivers.ts`, `drivers.html`.
- `pages/driver/profile/profile.ts`, `profile.html`.
- `pages/driver/dashboard/dashboard.ts`, `dashboard.html`.

Earlier work-tree edits outside this list were preserved, not recreated or attributed to this task.

## Verification

Final test/build/browser results are recorded after the final layout check. Browser verification uses temporary local fixture Users/Drivers and the actual running UI/API/database. Fixtures are removed by tracked IDs; there is no destructive reset or bulk seed. No SMS, payment, refund, payout, paid location request or IDSPay call is made by these checks.

### Final results

- Backend: **519 tests / 35 files passed** using `nx run mera-driver-api:test`. New coverage includes stale-input rejection, normalized duplicate preflight reuse, current owner consent after relinking, timestamp restoration and own/staff/customer/cross-driver authorization. Existing parser/transport tests cover malformed/unknown responses, expired/mismatched/masked structural evidence, missing configuration and timeout. No provider-confirmed success fixture is claimed.
- Frontend: **204 tests / 25 files passed** using `nx test mera-driver --watch=false`. New restricted-DTO fixtures test complete/expired/no-record/mismatch/unavailable presentation, missing DOB, no keystroke calls, duplicate/in-flight suppression, stale DL/DOB/driver responses, consent, restore/applicability and date discrepancies/autofill. These are UI/policy fixtures, not fabricated IDSPay success responses.
- TypeScript: `tsc --noEmit` with each app's `tsconfig.app.json` passed.
- Both production builds passed. Final backend webpack hash: `067d859001399e94`; frontend production initial bundle remains approximately 984 kB. Existing Driver Details CSS warning (4.70 kB versus the 4 kB warning threshold) and shared test setup type-check warning remain; shared/root files were not changed to suppress them.
- `git diff --check -- apps/mera-driver apps/mera-driver-api` passed.
- Chromium on actual `http://localhost:4400` and `http://localhost:3334`: verified native DL input focus-loss, missing DOB with no check, DOB saved through Personal Details, explicit own consent, licence-pill partial save, spinner, contract-blocked result, repeated blur, two concurrent unchanged requests retaining one audit attempt, reload/history, changed input clearing applicability, stale saved-input rejection, cross-driver/anonymous denial, staff retry, consistent dashboard/list/details result, guarded premature KYC approval and 390px layout without horizontal overflow.
- Spinner evidence briefly holds the actual local API response to make the busy state inspectable; it does not supply a mocked provider response. All API/browser checks retain `providerCalled:false`.
- Fixture cleanup preserved before/after counts: **14 Users, 7 Drivers, 3 Customers, 1 Booking, 0 MoneyMovements, 24 OTP challenges**. No original record was reset, seeded over or reassigned. No migration was added.

Machine-readable evidence: `verification/artifacts/inline-dl-results.json`.

Screenshots:

- `verification/artifacts/inline-dl-missing-dob.png`
- `verification/artifacts/inline-dl-checking.png`
- `verification/artifacts/inline-dl-driver-contract-blocked.png`
- `verification/artifacts/inline-dl-restored-history.png`
- `verification/artifacts/inline-dl-changed-input-cleared.png`
- `verification/artifacts/inline-dl-staff-onboarding.png`
- `verification/artifacts/inline-dl-dashboard-status.png`
- `verification/artifacts/inline-dl-details-status.png`
- `verification/artifacts/inline-dl-mobile.png`

**Completed locally:** inline input/blur/save/consent/preflight/history/access flow and fail-closed presentation. **Blocked externally:** real IDSPay execution, exact-response success mapping and real provider date autofill until the contract and exact response fixtures listed above are confirmed. No mocked green tick is reported as a live verification.
