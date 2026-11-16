# Registration Fees Add/Edit fix — 3 October 2026

## Scope and preservation

Git status and the existing workflow report were inspected first. All intentional changes are inside the two permitted apps. Existing work, including the pre-existing root TASK.md modification, was preserved. No reset, destructive seed, production payment, refund, payout or IDSPay call was made. Original local counts remain 7 Drivers, 12 Users and 0 MoneyMovements. Verification created isolated generated-ID fixtures and removed only those fixtures, their receipts, audit entries and temporary historical Master option.

## Causes and fixes

* Registration Fees displayed payment inputs unconditionally and offered no usable Paid/Unpaid choice. The existing Material radio, select, text-field, checkbox, card and button components now provide a conditional section. Unpaid omits mode, amount, date and selected receipt on the client; the backend also strips stale hidden values. Both final save and partial save retain onboarding progress without making a payment or KYC decision.
* Edit defaulted a missing registration payment mode to **Bank Account**, which is an account-details method rather than a configured registration payment mode. Missing mode is now blank and validates when completing a Paid entry. Historical modes remain readable. An unchanged trusted paid legacy record can be edited without manufacturing missing receipt metadata.
* The previous Driver Status control changed **account/login state**, using a different category. It now uses the existing **statuses / Driver Status Master**, stores its ID, and shows it immediately after Registration Fees. Only active options can be newly selected; the saved inactive option remains readable and cannot be newly applied to another record. Status-change permission and an audit reason are enforced server-side for real changes. An unchanged selection needs no reason. The Master choice never changes login state, human KYC verdict or eligibility.
* Receipt selection previously retained a filename without actually saving the file. Optional receipts now use the existing protected, versioned Driver document upload endpoint. Receipt upload/replacement does not revoke KYC approval or create a human KYC check/payment confirmation. Existing receipt names reappear through the real Details → Edit URL.
* Selecting Paid is an entry choice, **not proof of collection**. The form displays the independent recorded status. Details can be saved as a draft; reopening uses the actual backend ledger status. Authorized cash confirmation requires a separate explicit actual-cash checkbox, transaction reference and audit reason, then calls the existing Accounts movement endpoint. Backend fee-policy/balance checks and idempotency remain authoritative. Razorpay still requires the existing verified capture flow; the form cannot mark an online payment paid.
* Paid → Unpaid cannot delete/reverse a ledger. UI explains the required Accounts correction/refund action; API returns `409 FEE_CORRECTION_REQUIRED` while net received funds exist. Existing originals, receipt versions and ledger history remain intact.
* Final KYC approval checks were preserved. Payment form payloads contain no KYC approval or account status. The existing explicit final-approval guard remains tested.
* Mobile form actions now wrap instead of clipping Save Changes.

## Existing configuration, not invented defaults

The existing statuses Master has one active option, **Verified**. This is displayed as an administrative Master choice and is explicitly separate from the KYC verdict. No new status category/options or automatic backfill were added for this fix. Additional business choices must be configured in that existing Master.

All seven original Drivers currently have an optional fee policy with amount zero. The form reports that an amount must be configured before collection; it does not invent ₹500. Browser verification used a **temporary ₹370 policy** to prove policy-driven behavior, then removed its fixture. Real fee policies/records were not changed.

## Additive migration

`prisma/migrations/20261003130000_driver_status_master/migration.sql` adds nullable Driver.driverStatusMasterId and a restrictive foreign key to existing MasterListItem. Existing `status` is the human KYC verdict and `accountStatus` gates login, so neither was repurposed. No existing values were overwritten. Migration status was checked before deployment; final status: **22 migrations, schema up to date**.

## Files changed for this fix

Frontend, relative to apps/mera-driver:

* src/app/pages/account/drivers/drivers.html — fee/status layout, conditional fields, collection action, mobile wrapping.
* src/app/pages/account/drivers/drivers.ts — entry state, conditional validation/payload, policy display, Master selection/reason, protected receipt save, trusted cash confirmation.
* src/app/pages/account/drivers/drivers.spec.ts — regression tests including unchanged paid legacy edit.
* src/app/core/drivers/drivers-api.service.ts — existing DTO mapping, Master ID/name/policy/receipt and existing Accounts calls.
* src/app/pages/account/customers/customers.spec.ts — bracket-access typo fix in an already pending test; no customer behavior change.

Backend, relative to apps/mera-driver-api:

* prisma/schema.prisma and the migration above.
* src/schemas/business.schema.ts — Master ID/reason and non-persisted fee-entry choice.
* src/services/driver-preferences.service.ts — existing statuses included in existing onboarding-options API.
* src/services/driver.service.ts — stale-field exclusion, collected-fee protection, Master validation/audit, separate receipt handling.
* src/routes/drivers.routes.ts — existing save routes pass trusted actor/permission context.
* src/services/driver-list.service.ts — Master name on existing paginated records.
* src/services/driver-details.service.ts — readable Master fields, no duplicate relation object.
* src/services/driver-pill.service.ts — read-only finance context; receipt is not a KYC approval check.
* src/services/registration-form.service.test.ts — backend regressions.
* verification/registration-fee-smoke.cjs, verification/artifacts/registration-*.png, verification/artifacts/registration-fee-results.json and this report.

No duplicate save/payment endpoint or Angular component was introduced.

## Verification results

* Backend suite: **456 tests / 31 files passed**.
* Frontend suite: **169 tests / 20 files passed**.
* Both app TypeScript checks passed.
* Both production builds passed through the existing Nx backend build/dependency graph. Initial sandbox font download failed with EACCES; network-enabled retry passed. Existing Driver Details CSS budget warning remains (4.70 KB vs 4 KB warning budget); frontend test setup has the existing shared-ui compilation warning.
* `git diff --check` passed.
* Real browser at localhost:4400 with API localhost:3334: New Add Paid/Unpaid toggles, no-policy collection rejection, Paid validation, Unpaid final save with stale values excluded; Edit partial save; backend policy amount; real Master selection/reason; optional protected PDF receipt upload; explicit audited fixture cash receipt; duplicate reference idempotency; ledger-backed Paid reload; actual Details → Edit route; UI/API reversal rejection; saved inactive Master; details field projection; 390px mobile layout all passed.
* All original counts restored and no temporary status Master rows remain.

Evidence:

* [New Unpaid](verification/artifacts/registration-new-unpaid.png)
* [New Paid validation](verification/artifacts/registration-new-paid.png)
* [Paid details, collection still unconfirmed](verification/artifacts/registration-paid-details-unconfirmed.png)
* [Paid edit protected from reversal](verification/artifacts/registration-edit-paid-protected.png)
* [Inactive saved Master](verification/artifacts/registration-inactive-master-retained.png)
* [Mobile with saved receipt and usable actions](verification/artifacts/registration-mobile.png)
* [Exact safe request payloads and preserved counts](verification/artifacts/registration-fee-results.json)

## OTP error reported during final verification

The latest local challenge was a mobile login challenge. SMS configuration and template placeholder are present in ignored backend .env.local. Prior running-server logs showed ConnectExpress connection failure **EACCES**, before any provider HTTP response: the local API process was sandboxed without outbound network access. The current backend was restarted on port 3334 with approved network access. No authentication bypass, fake OTP success or automatic SMS resend was introduced. **Actual SMS delivery still requires the user's manual retry**; provider balance/DLT acceptance cannot be claimed from configuration presence. No secrets, OTP values or full identifiers were printed.

Live Razorpay payment/capture and IDSPay remain outside this local fixture verification. Existing provider-confirmation tests passed; no production provider call was made.
