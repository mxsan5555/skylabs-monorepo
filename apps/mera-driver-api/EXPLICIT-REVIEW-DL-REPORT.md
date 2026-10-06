# Explicit assigned-reviewer DL verification

## Confirmed cause and revised behavior
The former `dlVerificationPreflight` service searched current audit history for matching driver consent and threw HTTP 412 DL_CONSENT_REQUIRED before the provider call. Reviewer controls also disabled Verify DL/Retry on !consented. The driver form and separate phone-consent page supplied the mandatory agreement controls. Inspection confirmed Create Driver User itself had no licence/consent prerequisite; normal permission, identity conflict, duplicate protection and same-record linking were already independent.

The current flow is website three-field application -> one incomplete Driver without a User -> staff saves DL/DOB/documents -> assigned reviewer explicitly clicks Verify DL -> current backend result is persisted. Driver User creation can occur before/after, or never. No consent, phone or login condition is evaluated by verification, and no absent consent is recorded as granted.

## Authorization and confirmed provider contract
Existing canonical POST `/drivers/:id/dl-verification/preflight` remains protected by `kyc-assignments:view`, assignment to the authenticated reviewer, or the existing explicit administrative `drivers:assign` policy. Customers, drivers, ordinary profile editors and unrelated reviewers cannot invoke it. Saved Driver DL/DOB are read and validated on the backend. Browser DL/DOB/Verified flags cannot override them. Missing/malformed fields return actionable HTTP 422 before a provider call.

The provider contract is unchanged: POST https://javabackend.idspay.in/api/v1/prod/srv2/validation/dl, Content-Type application/json, raw JSON api_id/api_key/token_id/dlNumber/dob. Existing server-only environment mapping, whitespace trimming, saved internal DL spacing, DD-MM-YYYY conversion, bounded timeout and deliberate retries remain. No Bearer/provider headers or refresh behavior were invented.

Fail-closed parsing remains: nested success code/type AND returned identity/licence status/applicable current validity are required. HTTP 200 with result_code 103 is Invalid / no record found. Expired, mismatch, authentication/network failure and unknown/malformed response remain unsuccessful. NA transport dates never create transport entitlement; website business category is not used as a licence entitlement.

## Persistence, concurrency and separation
Verification audits store the actual staff actor, current normalized DL/DOB submission and saved-name hash, outcome, safe provider reference and completion timestamp. Existing consent/audit history is retained as historical metadata. Consent state is removed from the active readiness DTO rather than fabricated.

Driver row locking protects paid requests and concurrent profile writes. Matching attempts are cached; retries are explicit. A correction to DL/DOB/name makes old evidence inapplicable while retaining history. PostgreSQL default now() uses transaction start time: explicitly setting audit createdAt after response completion fixes coalescing of overlapping deliberate retries. Browser concurrency verification confirmed two overlapping retries cause exactly one fixture provider request. A concurrent input correction waits for the lock, then the former result becomes Not checked for the new saved submission.

API success does not mutate human checks, final KYC, fee state, availability, User linkage or trip readiness. Existing KYC approval/eligibility rules and optional login creation remain unchanged. Form typing/blur/save/application submission have no provider action. Driver form status is read-only.

## Removed consent-only surfaces
After tracing their frontend/service/test consumers, removed:
- Public GET `/drivers/dl-consent/:token`, POST `.../otp`, POST `.../confirm`.
- Staff POST `/drivers/:id/dl-consent-challenge` and owner POST `/drivers/me/dl-consent`.
- Frontend `/dl-consent/:token` page and its consent-only component/template/spec.
- Backend `src/services/dl-phone-consent.service.ts` and its obsolete consent-only tests; unused `saveDlConsent` and consent-match helpers.
- Consent API methods, checkbox/link/OTP controls, mandatory status/blockers and create-login-first guidance in affected onboarding/reviewer UI.

No consent records, OTP records, existing Users or account links were removed. Existing normal login OTP/SMS services remain. Reserved `dl-consent:` OTP identifiers are still rejected by normal login so old persisted challenges cannot become portal sessions. Historical consent labels remain in authorized history views. Old consent-only verification harnesses are explicitly retired before running, because their former expect-412 checks could otherwise send an unintended real provider request.

## User interface
Assigned review retains existing blue cards, main sections/pills, Pass/Issue checklist and authenticated document previews. DL panel shows saved DL/DOB, current result, explicit Verify DL/Retry, green tick only for valid confirmed evidence, expiry, readable reasons and last check/reviewer. Consent/login state does not disable the action. Mismatches identify returned DL number or DOB discrepancies when supported by saved provider checks. Driver form keeps current status/history only, with no verification or consent controls. Details and full report retain audit history without describing consent as a prerequisite or the confirmed contract as unconfirmed.

## Changed files for this task
Backend under apps/mera-driver-api:
- `.env.example`: current authorization comment, no secrets changed.
- `src/services/driver-dl.service.ts`, `.test.ts`: removed gate/mutations; staff metadata, completion-time retry protection and revised regression coverage.
- `src/routes/drivers.routes.ts`, `src/routes/driverSelf.routes.ts`: removed unused consent endpoints/imports; verifier route protections unchanged.
- `src/services/otp.service.ts`: retired-challenge rejection message; normal OTP functionality preserved.
- `src/services/driver-report.service.ts`: current workflow wording, removed active consent prerequisite display.
- Deleted `src/services/dl-phone-consent.service.ts` and `.test.ts`.
Frontend under apps/mera-driver/src/app:
- `app.routes.ts`: removed unused consent-page route.
- `core/drivers/dl-verification-api.service.ts`, `pill-review-api.service.ts`: active DTO/API cleanup, readable invalid state.
- `shared/inline-dl/inline-dl.ts`, `.html`, `.spec.ts`: read-only status, historical records, no consent actions.
- `pages/account/kyc-assignments/pill-review.ts`, `.html`, `.spec.ts`: explicit authorized action independent of consent/login, last-check information, legacy history labels and regression coverage.
- `pages/account/drivers/driver-details.html`: accurate historical challenge/consent labels.
- Deleted `pages/dl-consent/dl-consent.ts`, `.html`, `.spec.ts`.
Evidence/docs: new `verification/explicit-review-dl-smoke.cjs` and artifacts; retirement guards in `dl-phone-consent-smoke.cjs`, `dl-consent-workflow-smoke.cjs`, `idspay-review-consent-smoke.cjs`; supersession notes in three earlier reports; this report.

## Verification evidence
- Full backend suite passed: 539 tests / 36 files. Retired phone-consent tests were replaced with current no-consent reviewer/historical-record/retry coverage; normal login, ownership, customer/admin separation, payments/bookings and KYC suites remain passing.
- Full frontend suite passed: 207 tests / 26 files. Initial Nx Next-plugin worker failed to start; rerun with process-local NX_DAEMON=false and NX_ISOLATE_PLUGINS=false passed without root configuration edits.
- Both TypeScript checks passed; backend rechecked after the completion timestamp fix.
- Both final production builds passed. Final backend hash 4328a313ee06475d. Existing root Nx commands/build outputs were used; no intentional shared/root source edits.
- Browser workflow passed at localhost:4400 with a separate fixture API on 3335 and real local test records: existing Become a Driver three-field form/application save, no User/provider call; staff saved inputs/assignment; enabled reviewer Verify DL without login or consent; all six outcomes (API verified, Invalid / no record found, Expired, Mismatch/Invalid, Provider failed, Manual review required); staff/time metadata and reload persistence; unauthorized/unassigned/driver/customer rejection; missing saved DL/DOB; cached duplicate call; concurrent deliberate retries with one request; in-flight correction invalidates old evidence; optional account creation with duplicate rejection; driver form typing/blur/partial save/reload with zero provider calls; human KYC remains pending.
- First harness run stopped on an HTML label-attribute selector although the Material field's bound label property and actual UI were present. Corrected the harness to inspect the existing property; final run completed. No timeout increase or mocked application success response was used.
- Fixture provider outcomes are synthetic confirmed-schema test data, not live provider evidence. The fixture API intercepts provider transport and rejects other outbound fetch destinations. Eight fixture IDSPay requests, ZERO real IDSPay/SMS requests. All tracked fixture Users/Drivers were cleaned; follow-up query found zero remaining fixture records.
- Migration status read-only: 24 applied, no new migration/schema change/reset.

Artifacts: `verification/artifacts/explicit-review-dl-results.json`, `explicit-dl-45.png` through `explicit-dl-50.png` (six result states), and `explicit-dl-readonly-owner.png`. Verified API restarted on the final build on port 3334; existing frontend server was reused. Screenshots visually inspected.

## Actual live status and remaining external verification
Request integration is enabled for authorized explicit reviewer actions. No implementation prerequisite involving login, consent or SMS remains. No real IDSPay request was made during this task and no live success is claimed. Configured credential/token acceptance and the response for an intended real saved Driver remain unverified until a controlled authorized live action. Method/body/header details are confirmed, not a blocker. Real existing Driver records, linked accounts, consent history and finance/trip records were not modified by this task.
