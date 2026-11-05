# Assigned-review DL verification and final KYC readiness

Scope: only `apps/mera-driver` and `apps/mera-driver-api`. Existing working-tree changes, records, payment history, document versions, onboarding hierarchy, RBAC, PDFs and portal separation were preserved. No migration or database correction was required. All 24 existing migrations are applied.

## Confirmed approval rejection

The existing completed Driver `59a68392-b31b-47ce-9c12-a48a736b5441` was inspected without editing it. Its actual 11 onboarding completion keys are present and its saved licence expiry is current. Of 49 required human checks, **5 are Passed, 43 Pending and 1 Issue (`field:firstName`)**. The five DL-form checks have current Pass decisions; the other required checks do not. There are no stale checks on this particular snapshot.

The rejected condition is the current human checklist, not the disabled DL provider. A real HTTP 422 from the final-approval endpoint was compared with the read-only Details readiness response: their exact blocking reasons agree. The existing driver's reviews, status and fields were not changed. The complete field-by-field blockers are in `verification/artifacts/kyc-dl-workflow-results.json`.

Previously the generic error did not identify which condition failed. The 11/11 indicator describes completed forms, not reviewed forms. `kycApprovalReadiness()` now computes both the Details readiness and the locked approval transition from the same pill definitions, saved completion keys, licence-date policy and current item/version hashes. It exposes Passed, Pending, Issue and Review required after changes. Finance-only registration fees, offline availability and unconfirmed provider status do not become new KYC requirements.

Details disables final approval when blocked or processing, lists each reason and checklist status, and links to the existing KYC assignments screen for that driver. Readiness refreshes on return/window focus, manual refresh and rejected approval. Explicit approval revalidates even a record already labelled Verified; ordinary edits carrying unchanged Verified remain ordinary edits.

## Revised DL workflow

- Driver and staff onboarding show saved DL evidence read-only. Blur, typing, DOB/date changes, Save changes and Save & Next do not trigger verification or a separate draft save.
- Own KYC still records the driver's explicit consent for the exact saved DL/DOB. Consent itself makes no provider request.
- The existing assigned review has Verify DL, a checking state and explicit Retry / Recheck beside saved DL details and protected licence previews. Existing human Pass/Issue controls are unchanged.
- `POST /drivers/:id/dl-verification/preflight` is the canonical existing action. It accepts only deliberate retry intent, reads DL/DOB from the saved record, and requires `kyc-assignments:view` plus assignment or the existing administrative `drivers:assign` policy. Drivers and unrelated verifiers cannot run it.
- The retired form execution routes (`POST /drivers/me/dl-verification` and `POST /drivers/:id/dl-verification`) return 403 with a clear review-required message. Existing read-only status/history GETs remain available under their previous ownership/permission rules.
- Row locking and reuse of an unchanged saved attempt prevent concurrent first-check requests from creating duplicate attempts. A deliberate retry is separate. Changed DL/DOB invalidates applicability and consent without deleting earlier audit history. Late UI responses for another review are ignored.
- Neither the review action nor an API result marks human items Pass, grants final approval, collects a fee or changes online availability.

## Browser verification

Real local browser: `http://localhost:4400`; real API: `http://localhost:3334`; local PostgreSQL. The browser harness creates isolated users/driver records and cleans only their tracked IDs. It never mocks a successful provider response or calls a production provider.

The interrupted save expectation was a harness path mismatch (`/drivers/me/pill` is the actual route). The subsequent failure was an exact button-name mismatch: the wired button still said “Verify DL · unavailable.” Its label is now Verify DL; unavailable verification is displayed as the result, not as an invalid licence. Network evidence confirms the save returns HTTP 200. The review action returns a persisted contract-blocked result, with `providerCalled:false`.

Completed checks:

- Driver fills and blurs the DL field and uses Save changes and Save & Next through the actual onboarding API (HTTP 200), with zero verification POSTs.
- Assigned reviewer explicitly checks the saved record; result persists, restores after reload, and does not Pass a human item.
- Driver, ordinary profile editor and unrelated verifier execution denied; existing explicit administrative access retained.
- Concurrent unchanged actions reuse one persisted attempt.
- Pending readiness disables the approval button and direct API approval returns exact 422 blockers.
- Current checks are recorded through the assigned human checklist API for the isolated fixture; authorized browser final approval succeeds with HTTP 200 and Verified survives reload.
- Own DOB correction invalidates KYC approval/current hash and DL applicability. Old verification history survives; new verification requires renewed current consent. Stale reasons and blocked approval survive reload.
- Mobile Details at 390px has no horizontal overflow.
- Completed existing drivers diagnosed read-only; only fixture records reviewed/approved/corrected.

Evidence under `verification/artifacts/`: `kyc-dl-form-read-only.png`, `kyc-dl-assigned-contract-blocked.png`, `kyc-dl-review-restored.png`, `kyc-approval-pending-exact-reasons.png`, `kyc-approval-current-checks-approved.png`, `kyc-approval-stale-after-correction.png`, `kyc-approval-mobile.png`, and `kyc-dl-workflow-results.json`.

Database counts before and after the completed reload-verification run: 14 users, 7 drivers, 3 customers, 1 booking, 1 money movement and 24 OTP challenges. The money movement was already present before this run; it was not created or altered by the harness. Fixtures were removed, existing records retained.

## Tests/builds

- Backend: **525 tests passed in 35 files** (`vitest run --config apps/mera-driver-api/vite.config.ts`).
- Frontend: **203 tests passed in 26 files** (`nx run mera-driver:test`). Superseded automatic-check tests were replaced by read-only form and deliberate assigned-review coverage; existing provider/parser tests remain.
- Both application TypeScript checks passed.
- Both production builds passed; backend build hash `82496cb69cabbeb9`. Final frontend build passed with 983.93 kB initial bundle.
- Existing warnings remain: Details CSS 4.70 kB exceeds its 4 kB warning budget; shared frontend test setup is bundled without TypeScript compilation. No shared/root source changes were made to silence these.
- Scoped `git diff --check` passed. The unrelated pre-existing `TASK.md` modification was preserved.

## Live IDSPay status

**Request structure preserved; real provider verification blocked; manual final KYC workflow verified.**

`DL_CONTRACT_CONFIRMED=false` is preserved. Endpoint remains `https://javabackend.idspay.in/api/v1/prod/srv2/validation/dl`; credentials remain server-side in the ignored backend `.env.local`. No real IDSPay, Razorpay, refund, payout or paid location request was made.

Exact remaining blockers: authoritative HTTP method and required headers for this endpoint; token expiry/refresh/reuse behavior; the exact redacted success/103 samples with endpoint provenance; and confirmed returned validity/class-field mapping for the applicable licence policy. Existing synthetic parser/transport fixtures are not proof of a live provider success. HTTP 200 alone and incomplete/unknown responses remain fail-closed. No production call was made to discover the contract.

## Files changed for this task

Backend:

- `src/routes/driverSelf.routes.ts`, `src/routes/driverSelf.routes.test.ts`
- `src/routes/drivers.routes.ts`, `src/routes/drivers.routes.test.ts`
- `src/services/driver-dl.service.ts`, `src/services/driver-dl.service.test.ts`
- `src/services/driver-pill.service.ts`, `src/services/driver.service.ts`
- `src/services/driver-approval.service.test.ts`, `src/services/driver-details.service.ts`
- `verification/kyc-dl-workflow-smoke.cjs`, generated evidence listed above, this report

Frontend:

- `src/app/core/drivers/dl-verification-api.service.ts`, `pill-review-api.service.ts`
- `src/app/shared/inline-dl/inline-dl.ts`, `inline-dl.html`, `inline-dl.spec.ts`
- `src/app/pages/account/drivers/drivers.ts`, `drivers.html`, `driver-details.ts`, `driver-details.html`
- `src/app/pages/driver/profile/profile.ts`, `profile.html`
- `src/app/pages/account/kyc-assignments/kyc-assignments.ts`, `kyc-assignments.html`, `pill-review.ts`, `pill-review.spec.ts`

The older `INLINE-DL-VERIFICATION-REPORT.md` describes the superseded automatic workflow and is retained as historical evidence; this report describes the current workflow.
