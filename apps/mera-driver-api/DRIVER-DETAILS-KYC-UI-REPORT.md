# Driver Details and Assigned KYC Review implementation / verification

Verified locally on 5 October 2026. Intentional changes stay inside apps/mera-driver and apps/mera-driver-api. Existing uncommitted work was preserved. No schema or migration change, reset, seed, financial action or live provider call was made.

## Screens and preserved contracts

- Driver Details: /account/drivers/:id/details remains a full read-only page. Existing admin shell, blue theme, sky-card, sky-badge, sky-accordion, Material buttons/menu/dialog and authenticated previews are reused.
- Assigned KYC Review: /account/kyc-assignments?review=:driverId continues to open the existing permission/assignment-scoped review component. Main sections and all existing onboarding pills/checks remain.
- Protected endpoints retained: GET /drivers/:id/details; GET /drivers/assigned-to-me/:id/pill-review; PATCH /drivers/:id/pill-review; POST /drivers/:id/dl-verification/preflight; POST /drivers/:id/kyc-approval; authenticated /uploads/drivers/...; /drivers/:id/resume.pdf and /drivers/:id/profile.pdf.
- No duplicate component, checklist system, role, endpoint or PDF generator was introduced. Booking/payment/dispatch logic was not edited.

## Presentation and causes

Assigned KYC Review inherited ../masters/masters.css, whose global admin-page rule forced a 1,000px maximum width. It now uses a small page-local stylesheet; Masters screens are untouched. The existing review component uses desktop checklist/document columns and stacks on mobile. A reactive dependency cycle exposed by synchronous test responses was fixed by tracking account/driver inputs while performing cache cleanup and load work untracked.

Driver Details has a prominent owned profile photo, initials/missing state, readable contact/location, short ID, four independent status badges and three summary cards. Exact trip blockers come directly from the existing eligibility response. Profile totals and review counts are dynamic. Resume Preview remains; the authorized Download PDF menu contains Resume PDF and Full Driver Report.

Every saved field remains in the existing section inventory, grouped into Personal & Contact, Education & Health, Licence & Employment, Payment & Bank and Additional Saved Fields. The right column contains section-wise KYC summaries, current documents, previous versions and reviewer/date/reason history. Friendly labels extend the existing pill metadata rather than defining another checklist. Final approval remains guarded by shared backend readiness and now requires a confirmation dialog. Blocked/submitting actions stay disabled.

The shared protected photo resolver supports saved owned paths, legacy filenames, current registered Profile Photo records and permitted legacy image data. It excludes other drivers' paths and archived-only photos. Both screens fetch registered images through existing authenticated endpoints and retain blob cleanup. Missing/damaged files are reported without losing saved fields; new documents are loaded when Details readiness is refreshed. The existing photo upload/replacement flow itself was preserved.

Assigned review shows actual driver/reviewer names, reviewed/total, pending/issues/stale counts. Pass persists immediately through the existing API. Raise Issue reveals only that row's reason editor, requires a reason, and saves immediately with feedback/errors. Cancel does not write a decision. Documents for the active section appear alongside the checklist; all current/previous documents remain accessible. Dates and saved history reasons are readable. Delayed responses for a previously opened driver are ignored and object URLs are cleaned up.

## KYC and IDSPay preserved / completed independent work

No provider calls occur during form typing, blur, Save changes, Save & Next or submission. Verify DL remains an explicit assigned-review action using saved fields, consent, assignment and the existing administrative policy. Human Pass/Issue decisions and final approval remain separate from DL API results, fees and availability.

The in-progress IDSPay parser now maps the supplied srv2 nested success fields and explicit result_code 103. HTTP 200 alone is insufficient. Identity/name, calendar dates, active status, applicable returned validity and returned vehicle classes are validated. Masked, incomplete, ambiguous, contradictory and unknown results remain unsuccessful/manual review. NA dates are not invented; non-transport validity is not converted into transport entitlement. Code 103 has the requested actionable invalid/no-record message. Only restricted assessments/references/hashes are persisted, not full responses or secrets. Failed/preflight history is preserved and input changes invalidate applicability.

The old unconditional DL_CONTRACT_CONFIRMED=false / parser refusal has been replaced by a narrower request-contract guard in src/providers/idspay/dl.provider.ts (DL_REQUEST_CONTRACT is null). The service now contains the authorized bounded transport/persistence path with row-lock duplicate prevention, explicit retry and authentication/timeout handling. Missing automatic token refresh is not an activation prerequisite.

Configuration was checked without exposing values: IDSPAY_DL_API_URL, IDSPAY_DL_API_ID, IDSPAY_DL_API_KEY and IDSPAY_DL_TOKEN_ID are populated in ignored backend .env.local; URL matches the exact supplied endpoint and has no outer whitespace. token_id is mapped from IDSPAY_DL_TOKEN_ID. Existing host environment > local .env.local > .env precedence is retained. Credentials were neither changed nor committed.

**Actual live verification remains blocked:** no authoritative working request/documentation confirming the exact endpoint's HTTP method and required headers was supplied or found. JSON field mapping/DOB format and supplied response schema are implemented; an example or synthetic fixture is not evidence of a working production request. Token lifetime/refresh behavior is not invented and does not form a blanket prerequisite. No production request was made to discover these details. Browser Verify DL persisted a real blocked preflight, not a fabricated success.

## Test/build evidence

- Backend full suite: 534 tests / 36 files passed. Final display-metadata changes additionally passed the focused photo, pill-review and Details suite: 17 tests / 3 files.
- Frontend final full suite: 205 tests / 26 files passed.
- Both app TypeScript --noEmit checks passed.
- Both production builds passed. Final backend webpack hash: e02a168b161aba09. The local API was restarted from that build; the existing frontend dev server/HMR was reused.
- Frontend builds initially hit sandbox Google Fonts network access; authorized rerun passed. Existing shared test-setup compilation warning remains; shared files were not edited.
- Parser positive tests are synthetic identities substituted into the supplied schema, explicitly labelled offline fixtures. The exact code-103 response and masked schema are covered. These tests are not a real IDSPay verification.

## Actual browser verification

Both scripts below passed against localhost:4400 / localhost:3334 using temporary tracked fixtures and cleanup.

kyc-dl-workflow-smoke.cjs:
- Real password login for driver, assigned verifier and admin.
- No DL POST on blur, partial save or Save & Next.
- Driver and unrelated verifier denied; assigned and explicitly permitted admin access retained.
- Raise Issue reveals its reason input; actual API save and reload preserve the reason; Pass immediately saves.
- Protected current and previous image/PDF previews; review mobile layout has no page overflow.
- Explicit Verify DL saves/restores the configuration/contract-blocked result; concurrent unchanged requests reuse the attempt; no automatic human Pass.
- Pending checks: readiness disables approval and actual backend approval returns 422.
- Current required checks passed through assigned checklist APIs on the isolated fixture: browser confirmation performs real final approval successfully; reload shows KYC Approved.
- Approved fixture's exact sole trip blocker is Driver is offline; optional unpaid fee is not presented as a trip blocker.
- DOB correction invalidates review/result applicability, preserves history and blocks approval again.
- Existing completed drivers were diagnosed read-only: one has 1 blocked human check; affected driver 59a68392-b31b-47ce-9c12-a48a736b5441 has 44 blocked checks despite 11/11 forms. No existing decisions or records were modified.
- Counts before/after cleanup: 14 users, 7 drivers, 3 customers, 1 booking, 1 money movement, 24 OTP challenges.

details-layout-smoke.cjs:
- Current profile image, real replacement upload/save version 2, previous image history, current image/PDF inline previews.
- Saved field count agrees with the backend section inventory.
- Both menu PDF downloads return non-empty %PDF bytes; original document download works.
- Partial/missing-photo and damaged-photo records show initials; missing original and damaged document show clear messages.
- Read-only staff can view the permitted screen/photo but cannot edit/export/approve; customer and unauthenticated requests are denied.
- Desktop and 390px mobile layout; existing Edit route/return navigation; no captured page errors.
- Counts before/after: 7 drivers, 14 users, 13 roles. Uploaded fixture files were removed only by tracked owned paths.
- Details harness uses short-lived local signed tokens; password login is verified by the KYC harness. No supplied approved screenshot attachment was available; the current components and textual agreed layout were used.

## Evidence files

verification/artifacts/details-layout-complete.png
verification/artifacts/details-documents-desktop.png
verification/artifacts/details-layout-mobile.png
verification/artifacts/details-layout-missing.png
verification/artifacts/details-layout-damaged.png
verification/artifacts/kyc-review-issue-desktop.png
verification/artifacts/kyc-review-documents-desktop.png
verification/artifacts/kyc-review-mobile.png
verification/artifacts/kyc-approval-current-checks-approved.png
verification/artifacts/kyc-approval-stale-after-correction.png
verification/artifacts/details-resume-download.pdf
verification/artifacts/details-full-report-download.pdf
verification/artifacts/details-layout-results.json
verification/artifacts/kyc-dl-workflow-results.json

## Intentional files changed in this continuation

Frontend (under apps/mera-driver/src/app):
- pages/account/drivers/driver-details.ts, driver-details.html, driver-details.css, driver-details.spec.ts
- pages/account/kyc-assignments/kyc-assignments.ts, kyc-assignments.html, kyc-assignments.css
- pages/account/kyc-assignments/pill-review.ts, pill-review.html, pill-review.css, pill-review.spec.ts
- core/drivers/pill-review-api.service.ts

Backend (under apps/mera-driver-api/src):
- providers/idspay/dl.provider.ts, dl.response.ts, dl.response.test.ts
- services/driver-dl.service.ts, driver-dl.service.test.ts
- services/driver-photo.service.ts, driver-photo.service.test.ts
- services/driver-pill.service.ts, driver-details.service.ts, driver-approval.service.test.ts

Verification/report (under apps/mera-driver-api):
- verification/kyc-dl-workflow-smoke.cjs, verification/details-layout-smoke.cjs and named evidence artifacts
- DRIVER-DETAILS-KYC-UI-REPORT.md

No new migrations, credentials, root/shared source edits or database corrections.
