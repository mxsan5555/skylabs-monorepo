> Superseded workflow: see EXPLICIT-REVIEW-DL-REPORT.md. Authorized assigned-reviewer DL checks no longer require consent, phone OTP or Driver login. The notes below are historical evidence, not current prerequisites.

# IDSPay confirmed request contract ? 5 October 2026

This report supersedes the earlier method/headers contract blocker in DRIVER-DETAILS-KYC-UI-REPORT.md. All intentional edits are inside the two permitted apps; existing WIP and records were preserved. No migration was required.

## Former blocker and correction

src/providers/idspay/dl.provider.ts previously declared DL_REQUEST_CONTRACT:DlRequestContract|null=null. requireDlContract() threw IDSPAY_REQUEST_DETAILS_MISSING before the transport could run. The user has now confirmed POST, raw JSON and Content-Type: application/json for the exact srv2/validation/dl URL. That constant is populated, the unconditional rejection is removed and dlRequestEnabled() returns true. No Bearer authentication or extra provider headers were added.

The backend request uses the existing client and exact body fields api_id, api_key, token_id, dlNumber and dob. Configuration maps IDSPAY_DL_API_ID, IDSPAY_DL_API_KEY and IDSPAY_DL_TOKEN_ID respectively. URL and credential outer whitespace are trimmed. All required names are populated in ignored backend .env.local; URL matches the exact endpoint. Values were not printed or modified. Existing environment loading/precedence remains: host environment, then local backend .env.local, then .env fallback in local development. Production deployment still supplies server environment values.

DL outer whitespace is trimmed, while internal spaces/hyphens/case in the saved request value are preserved. The supplied spaced example is covered by a transport assertion; normalization without spaces is used only for comparison/hash applicability, not an unsupported provider input conversion. DOB is explicitly converted to DD-MM-YYYY with calendar validation.

Previously disabled, provider-not-called preflights can no longer hide the enabled action behind an obsolete cached result. Only those known obsolete guard attempts are superseded. Actual prior attempts remain cached unless the reviewer explicitly rechecks. Existing row lock, assignment/admin authorization, driver consent, bounded 10-second request, no automatic retries, audit history and input-change handling remain.

No provider calls were added to onboarding typing, blur, DOB changes, save or submission. No frontend component, route, permission or KYC policy was changed. API success does not change human checks, final approval, payment or availability.

## Response checks

The existing supplied-response parser is retained and exercised: nested success status, matching returned DL/DOB and holder policy, Active licence, applicable valid dates and returned classes. NA transport dates do not create transport entitlement. HTTP 200 + result_code 103 remains Invalid / no record found with the actionable message. Unknown, contradictory, masked, malformed, expired, mismatched, authentication and network outcomes cannot produce a green verified result.

Positive response tests use synthetic identities in the supplied schema, with mocked transport only. They are not live verification. The exact code-103 failure sample is already covered. Success/invalid persistence and restoration are now covered at the service layer, including no human-KYC mutation and no credential/raw-response persistence.

## Actual browser / live status

The local API was restarted from production build hash 04c7fd416db3d3ed. The existing frontend server was reused.

verification/idspay-review-consent-smoke.cjs used an existing assigned reviewer and saved Driver record via the actual review page. GET returned dl.enabled=true and consented=false. Clicking Verify DL sent the real application POST, which returned HTTP 412 with DL_CONSENT_REQUIRED: The driver must consent to verification of the current saved licence and DOB. Reload worked; a before/after hash of the Driver, current checks and audit history was unchanged.

**IDSPay was not reached. There is no actual provider HTTP/result to report and live success is not claimed.** Read-only inspection of the seven existing drivers found no recorded own verification consent. The intended real driver for the single paid check was also not specified. The user was asked to identify that driver and have current consent recorded through the existing portal. No consent was invented or recorded on behalf of a driver, and no synthetic DL was sent to production.

The former method/body/header blocker is resolved. The exact remaining live-check prerequisites are an identified intended saved real driver and their current recorded consent (and a linked account where required by the existing consent flow). Credential validity/token validity can only be assessed by that authorized controlled request; no token-refresh behavior was invented.

The historical kyc-dl-workflow-smoke.cjs uses synthetic fixture DLs and previously relied on a disabled provider. It now fails before creating fixtures when production transport is enabled, preventing accidental paid fixture calls. Unit transport fixtures remain the safe automated provider test path.

Browser evidence: verification/artifacts/idspay-enabled-consent-required.png and idspay-enabled-browser-results.json. The browser check used a short-lived local signed token for the existing assigned reviewer; it did not create users, alter accounts or modify the Driver record.

## Checks

- Backend full suite: 536 tests / 36 files passed.
- Provider/request/parser/service focused tests passed; final full suite includes both additional service persistence/cache cases.
- Frontend Nx test target passed: 205 tests / 26 files, existing outputs reused from cache because frontend source is unchanged.
- Both app TypeScript noEmit checks passed.
- Both production builds passed; frontend production target reused its matching cache and backend compiled successfully.
- No real payment, refund, payout, bulk provider check or data reset.

## Changed files

apps/mera-driver-api/.env.example ? replace obsolete disabled-contract comment only.
apps/mera-driver-api/src/providers/idspay/dl.provider.ts ? confirmed contract and enabled transport.
apps/mera-driver-api/src/providers/idspay/dl.provider.test.ts ? exact POST/JSON headers/fields and preserved internal spacing/config trim.
apps/mera-driver-api/src/services/driver-dl.service.ts ? supersede obsolete blocked preflights only.
apps/mera-driver-api/src/services/driver-dl.service.test.ts ? deliberate retry, invalid/success persistence, restoration, cache and human-KYC separation.
apps/mera-driver-api/verification/kyc-dl-workflow-smoke.cjs ? stop synthetic fixture calls to enabled production transport.
apps/mera-driver-api/verification/idspay-review-consent-smoke.cjs ? actual read-only browser/consent gate verification.
apps/mera-driver-api/verification/artifacts/idspay-enabled-consent-required.png
apps/mera-driver-api/verification/artifacts/idspay-enabled-browser-results.json
apps/mera-driver-api/IDSPAY-CONFIRMED-CONTRACT-REPORT.md

No frontend source, schema, migration, real credentials, root/shared source or existing financial/KYC record edits.
