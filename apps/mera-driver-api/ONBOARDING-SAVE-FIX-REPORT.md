# Add and Edit Registration Save correction — 2026-10-01

## Root cause and observed requests

Both failures were reproduced in Chromium against the local Angular UI (`localhost:4400`) and Express API (`localhost:3334`), using isolated synthetic drivers and real HTTP requests. No final-approval endpoint was called by the failing form.

- Add: first `Save & Next` created the same Driver using `POST /drivers` (201). The final Registration save used `PATCH /drivers/:id` with the full form snapshot, `status: "Verified"`, `stepCompleted: 4` and `subStepCompleted: 1`. It returned 422 `KYC_REVIEW_REQUIRED`.
- Edit: a previously approved Driver's final Registration save used the same PATCH path and carried its unchanged `status: "Verified"`. It also returned 422.
- The shared `updateDriver` service ran the approval guard whenever the incoming status was Verified, including when no approval transition occurred. Replaying the whole form also risked changing unrelated reviewed fields to form defaults.

Exact synthetic request payloads and responses are in ignored local artifacts `verification/artifacts/onboarding-save-before.json` and `onboarding-save-after.json`. They contain no authentication tokens or real driver records.

## Fixes

1. Add and Edit use the existing routes and Driver record. Every save sends only the active pill's fields and progress. Initial creation additionally supplies required identity fields; it does not save defaults from unvisited education, experience, licence or payment forms.
2. KYC and registration-fee status are read-only on Registration Payment. No approval or Paid state is submitted by this form. Amount, payment preference and receipt date remain profile inputs, not evidence of settled money.
3. The backend ignores a carried KYC decision on onboarding saves. An explicit transition from another status to Verified still requires the unchanged current-onboarding/licence/current-check conditions. Carrying an already Verified status in an ordinary edit does not rerun final approval.
4. Related KYC-sensitive edits still invalidate approval and return the Driver to Non-Verified. Existing check hashes/history retain the distinction between changed and unchanged items.
5. `Save draft` persists without marking the active pill complete. Reload retains saved fields, earlier completion indicators and the existing exact resume position. Final Registration validates its own pill; unrelated missing contact or photo fields do not prevent a partial record's payment-form save.
6. A separate `POST /drivers/:id/kyc-approval` with an empty body is available through the explicitly labelled Final KYC approval button on Driver Details. It requires `drivers:edit`; KYC verifiers without that permission are denied. Successful decisions are audited. Compatibility with existing authorized explicit status-transition callers is preserved.
7. The bank-payment method now maps through the existing frontend Driver DTO and save payload. City is also retained in the contact pill. Fee display derives from backend fee state rather than inferring Paid from an entered amount.
8. Save failures show their actual HTTP message. Onboarding completion, human approval, licence verification, fee settlement and backend trip eligibility remain separate.

The existing final approval policy checks all existing human-KYC pills and a current saved licence. The finance-only Registration Fee pill remains independent, as before this fix; trip eligibility still applies its required-fee policy. No approval conditions were relaxed.

## Verification

Final full suites: 399 backend tests across 27 files and 138 frontend tests across 18 files pass. Both production builds pass. The frontend build needed an authorized network-enabled rerun to retrieve the existing Google Fonts stylesheet; no font/config/dependency change was made. The existing shared-UI testing-file type-check warning remains. Scoped `git diff --check` passes.

| Case | Actual result |
| --- | --- |
| New pending-KYC Driver, final Registration Save | PATCH 200; onboarding completed when the other pills were already complete; KYC remained Non-Verified; zero money movements |
| Approved Driver, ordinary Registration edit | PATCH 200; approved status preserved |
| Approved Driver, changed identity field | PATCH 200; KYC returned to Non-Verified |
| Explicit premature approval through the details-page button | POST 422 `KYC_REVIEW_REQUIRED`; no approval |
| Draft update and reload | Saved amount persisted; prior progress retained; KYC remained pending |
| New Add draft and reload/Edit | POST 201; no completed pills; identity persisted; resumed Personal Details, pill 1 |
| KYC verifier attempting final approval | API regression test 403 |
| Current completed checks and valid licence | Existing successful final-approval tests and connected browser verification pass |

The browser harness uses component access to populate synthetic inputs/prepare an existing Edit row and to inspect the resume cursor. Tab/pill navigation, Save, Save draft and Final KYC approval clicks use the actual UI and API. Earlier completion flags are seeded for the final-step test; this is not a claim that all eleven forms were manually filled in this test. The separate connected UI harness verifies issue/correction, document replacement and final current-check approval.

All fixture IDs and associated fixture audit rows were removed. The final standalone onboarding verification preserved seven existing Drivers. Connected UI verification preserved seven Drivers, two Customers and one Booking. No existing data was reset or rewritten.

## Files changed for this correction

- `src/services/driver.service.ts`: actual transition guard, sensitive-change invalidation, draft/progress metadata handling.
- `src/schemas/business.schema.ts`: optional `completeStep` metadata; never a Driver column.
- `src/routes/drivers.routes.ts`: explicit permission-protected/audited approval action.
- `src/services/driver-approval.service.test.ts`, `src/routes/drivers.routes.test.ts`: pending save, draft, unchanged approval, sensitive edit and explicit premature/unauthorized approval regressions.
- Frontend `src/app/core/drivers/drivers-api.service.ts`: selective pill saves, draft metadata, city and bank-method mapping.
- Frontend `src/app/pages/account/drivers/drivers.ts`, `drivers.html`, `drivers.spec.ts`: pill-only Add/Edit saves, independent statuses, local validation, draft action and regressions.
- Frontend `src/app/pages/account/drivers/driver-details.ts`, `driver-details.html`: explicit approval action and real HTTP errors.
- `verification/onboarding-save-smoke.cjs`: before/after browser/network regression verification.

No migration is required for this correction. The separately ongoing resume work added only a nullable resume-profile column, documented in `DRIVER-RESUME-REPORT.md`. All intentional edits remain within the two authorized app paths. Existing work and the pre-existing root `TASK.md` modification are preserved.

There is no external blocker for these Add/Edit save corrections. Live IDSPay verification remains independently disabled; no provider call or gateway charge/refund/payout was made for this task.
