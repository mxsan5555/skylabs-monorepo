> Superseded workflow: see EXPLICIT-REVIEW-DL-REPORT.md. Authorized assigned-reviewer DL checks no longer require consent, phone OTP or Driver login. The notes below are historical evidence, not current prerequisites.

> Superseded by DL-PHONE-CONSENT-REPORT.md: login creation is optional; phone-OTP consent now supports Drivers without a User. Historical verification below describes the earlier owner-only workflow.

# DL consent workflow verification

## Confirmed cause and selected record
Selected assigned-review Driver: KAPIL, `a08a1605-4bd1-4962-a4c6-d9e6e89edfca`. Saved DL and DOB exist. Consent is absent (zero consent records), not stale or incorrectly linked. No login User is linked. The protected preflight returns HTTP 412 `DL_CONSENT_REQUIRED` before any provider request. The former owner consent control was not discoverable in the normal DL onboarding form.

## Implementation
The existing own Driver DL form now offers the explicit checkbox: ?I agree to verification of my submitted driving licence through IDSPay.? Record verification consent uses the authenticated owner's existing `/drivers/me/dl-consent` endpoint and current saved submission hash. Unchecked or unsaved changed inputs cannot submit consent. The existing audit stores actual owner actor, driver_portal source, timestamp and normalized DL/DOB submission reference. A stale expected reference returns 409 without recording consent. History is retained after corrections or account relinking.

Assigned review shows Driver consent required, distinguishes absent/stale/incorrectly linked consent, explains the existing Create Driver User prerequisite where necessary, and provides refresh. Verify DL/Retry remain disabled without consent; the backend guard independently enforces it. Window focus refreshes review readiness. No provider calls were added to typing, blur, consent, save or submission. No new schema/migration, consent bypass, final approval requirement or human checklist auto-pass.

## Files changed for this consent task
- Backend: `src/services/driver-dl.service.ts`, `src/services/driver-dl.service.test.ts`, `src/services/driver-pill.service.ts`, `src/routes/driverSelf.routes.ts`.
- Frontend under `src/app`: `core/drivers/dl-verification-api.service.ts`, `core/drivers/pill-review-api.service.ts`, `shared/inline-dl/inline-dl.ts`, `shared/inline-dl/inline-dl.html`, `shared/inline-dl/inline-dl.spec.ts`, `pages/driver/profile/profile.html`, `pages/account/kyc-assignments/pill-review.ts`, `pages/account/kyc-assignments/pill-review.html`.
- Browser evidence: `verification/dl-consent-workflow-smoke.cjs`, updated `verification/idspay-review-consent-smoke.cjs`, their artifacts, and this report. The existing-record harness initially used an incorrect assigned-to-me preflight URL; corrected to the existing canonical `/drivers/:id/dl-verification/preflight`, then passed. No duplicate endpoint was added.

## Verification
Full backend: 537 tests / 36 files passed. Full frontend: 206 tests / 26 files passed. Both TypeScript checks and production builds passed; backend build hash 09f1e49a400cb502.

Actual local browser fixture workflow passed: explicit owner checkbox, unchecked/unsaved protection, owner actor/source/timestamp/hash persistence, reload, reviewer readiness refresh, unrelated reviewer consent denial, DOB correction invalidation, stale consent 409 and preflight 412. Tracked fixture Driver and Users were cleaned. Synthetic DLs were never submitted to IDSPay. Screenshots: `verification/artifacts/dl-owner-consent-recorded.png`, `dl-review-consent-ready.png`, `dl-review-stale-consent.png`; results `dl-consent-workflow-results.json`.

Read-only selected real-record browser check passed: disabled reviewer Verify DL, discoverable next action, canonical API HTTP 412 and unchanged Driver/check/audit snapshot after reload. Evidence: `verification/artifacts/idspay-enabled-consent-required.png` and `idspay-enabled-browser-results.json`.

## Live status and exact remaining prerequisite
IDSPay was NOT reached. No actual provider result exists for this verification run. Confirmed POST/application-json integration remains enabled with server-side credentials; the blocking condition is genuine consent for the selected saved record, not an unconfirmed request contract. Authorized staff must use existing Create Driver User to link its login, then the actual driver must review saved DL/DOB and explicitly record consent in their own portal. A reviewer cannot consent for that driver. After that genuine action, the assigned reviewer can perform one deliberate live check. No consent was fabricated or recorded on the real Driver; existing records and history remain unchanged.
