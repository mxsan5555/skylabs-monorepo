> Superseded workflow: see EXPLICIT-REVIEW-DL-REPORT.md. Authorized assigned-reviewer DL checks no longer require consent, phone OTP or Driver login. The notes below are historical evidence, not current prerequisites.

# Driver record, optional login and DL consent

## Correction implemented
Driver User creation is OPTIONAL. Inspection found no DL-success/consent gate in the existing createAndLinkDriverUser service or Driver-list account action. Normal drivers:assign permission, same-record linking, contact-conflict rejection, Driver row lock and duplicate protection remain unchanged. The previous requirement existed in owner-only consent matching and reviewer guidance. Removed the guidance to create a login first; added a phone-verified consent path independently of User linkage.

The Become a Driver three-field application, staff onboarding and existing records are preserved. Login creation, consent, licence verification, human KYC, payments, availability and trip eligibility remain separate. No new trip rules, schema changes or migrations.

## Two consent paths
1. Linked owner: existing driver portal checkbox and /drivers/me/dl-consent remain ownership-protected, explicitly accepted and bound to saved DL/DOB; newly recorded consent also binds normalized phone.
2. Pre-login: assigned reviewer or explicitly authorized administrator uses Get Driver Consent on the existing review screen. It generates a cryptographically random limited-purpose link from the selected route record, with expiry derived from existing OTP configuration. The driver opens /dl-consent/:token, requests OTP to the saved masked phone, then explicitly agrees before Verify phone and record consent. OTP alone cannot record agreement. No User, UserRole, login JWT or refresh session is created.

Consent links are hashed in existing AuditLog storage. OTP hashes use existing OtpChallenge and SMS provider, with an isolated dl-consent identifier namespace rejected by normal auth request/verify services. Challenge expiry, existing configured attempt limits, resend cooldown, public rate limits, row-lock serialized issuance/confirmation and replay rejection protect the flow. Phone/DL/DOB changes invalidate the challenge and consent without deleting history. New verification results bind phone as well as DL/DOB and saved name.

Existing AuditLog requires a staff User foreign key: phone-consent events retain the challenge initiator there, explicitly record actual agreeing actorType=phone_verified_driver, actorDriverId, source=phone_otp, submission/phone hashes and challengeId in metadata, with createdAt as timestamp. No owner User is fabricated and staff initiation is not evidence of agreement. Review history labels the consenting driver separately from its initiating reviewer.

Reviewer UI shows saved DL/DOB, masked phone, consent status, Get Driver Consent, private link and Refresh consent readiness. Missing login is not a verification blocker. Consent recording never calls IDSPay. The existing explicit Verify DL endpoint retains assignment/admin policy, current consent validation, bounded timeout, duplicate/cached request protection and fail-closed response parsing. Confirmed POST JSON request and credentials mapping are unchanged; result_code 103 remains failed verification despite HTTP 200. Provider success never passes human checklist or grants final approval.

## Routes and changed files
Backend under apps/mera-driver-api:
- src/services/dl-phone-consent.service.ts and .test.ts: challenge, SMS, replay-protected explicit consent.
- src/services/driver-dl.service.ts: accepts valid phone consent without a User; phone binding and readable status/history.
- src/services/driver-pill.service.ts: identifies phone-consenting actor in history.
- src/services/otp.service.ts: reserved consent namespace blocked from normal login.
- src/routes/drivers.routes.ts: POST /drivers/:id/dl-consent-challenge requires existing KYC permissions/assignment; public GET /drivers/dl-consent/:token, POST .../otp and .../confirm only have limited-purpose access.
Frontend under apps/mera-driver:
- src/app/app.routes.ts: limited-purpose /dl-consent/:token using existing AuthLayout.
- src/app/pages/dl-consent/dl-consent.ts, .html, .spec.ts: existing Material controls and explicit phone agreement page.
- src/app/core/drivers/pill-review-api.service.ts and pages/account/kyc-assignments/pill-review.ts, .html: current record consent action/readiness, no account prerequisite.
Evidence/docs: verification/dl-phone-consent-smoke.cjs, its artifacts, this report and supersession note in DL-CONSENT-WORKFLOW-REPORT.md.

## Checks and actual browser evidence
- Full backend suite: 543 tests / 37 files passed. After adding no-login positive fixture assertion, focused consent/verification suite: 18 tests passed.
- Full frontend suite: 207 tests / 27 files passed.
- Both TypeScript checks passed.
- Both production builds passed. Frontend required approved retry for existing Google Fonts after sandbox EACCES. Final backend hash: 3f0a010cef8cbe5b. Latest normal API restarted on 3334; existing frontend on 4400 preserved.
- Real local UI, isolated fixture API: Get Driver Consent on saved no-login Driver; actual SMS request construction with simulated provider delivery; unchecked consent disabled; owner OTP/agreement persisted with no User or session; replay denied; unrelated verifier denied; explicit assigned reviewer action saved fixture code 103 and survived reload while User remained null; incomplete/unverified Driver login creation API returned existing 201 and duplicate 409; changed DOB blocked verification with 412. No automatic provider request occurred before explicit action.
- Logged-in-owner browser harness also passed checkbox, audit metadata, reload, reviewer readiness, stale rejection and no provider calls.
- Unit tests include no-login confirmed-format synthetic API Verified, code 103, expiry/attempt/cooldown/stale phone checks, and normal-login namespace rejection; existing success/error/parser/permission tests remain passing.
- Fixture harness initially stopped on a result/history selector ambiguity, then on expecting 200 instead of existing 201 from Create Driver User. Corrected harness only; no endpoint duplication or application success mocks. Tracked created fixture login cleaned and cleanup strengthened to discover linked fixture account IDs before removal. Final fixture cleanup passed.

Artifacts: verification/artifacts/dl-phone-consent-results.json, dl-phone-consent-complete.png, dl-no-login-review-result.png, and dl-consent-workflow-results.json. Screenshots visually inspected for consent completion. All fixture records were cleaned by tracked IDs.

## Live integration status
Zero real SMS or IDSPay calls in this task. The browser fixture API simulated SMS delivery and one IDSPay result-code-103 response; this is not live verification. All required SMS_API_URL/SMS_API_KEY/SMS_SENDER/SMS_OTP_TEMPLATE and IDSPAY_DL_API_URL/API_ID/API_KEY/TOKEN_ID variables are present; OTP template contains its placeholder. Credential validity, SMS delivery/DLT acceptance and real provider response are not established by configuration presence.

Selected existing KAPIL Driver a08a1605-4bd1-4962-a4c6-d9e6e89edfca was not modified by this task. The latest read-only inspection now shows a linked User and zero consent records; earlier inspection showed no login. Login linkage is independent and is no longer a consent/verification prerequisite. The permitted reviewer may share its limited-purpose consent link with the actual driver; real phone OTP delivery and explicit agreement must occur before a deliberate controlled live IDSPay action. No false consent or live success was claimed. Historical older reports' Create Driver User first guidance is superseded.
