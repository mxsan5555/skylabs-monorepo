# Admin Driver Details verification — 2026-10-01

The Admin Drivers View action now navigates to a dedicated read-only page. The old modal embedded the verifier checklist and a limited frontend resume summary; that modal was removed. The existing onboarding wizard and assigned-verifier pill checklist remain unchanged.

## Routes and permissions

| Route | Purpose | Permission |
| --- | --- | --- |
| Angular `/account/drivers/:id/details` | Continuous read-only Driver Details | Existing account authentication and `drivers:view` |
| GET `/drivers/:id/details` | Fresh backend fields, document inventory, statuses and exact eligibility blockers | `drivers:view` |
| GET `/drivers/:id/resume.pdf` | Shareable Driver Resume, backend PDF | `drivers:export` |
| GET `/drivers/:id/profile.pdf` | Existing internal Full Driver Report, relabelled separately | Existing `drivers:export` |
| GET `/uploads/drivers/:driverId/:filename` | Existing authenticated current/archived original files | Existing ownership, assigned-verifier or staff document authorization |

No general Driver Details/export permissions were granted to drivers, customers or the KYC verifier. Verifiers retain their existing assigned-only review and document access. Previews do not require export permission or downloading a report.

## Completed behavior

- All eleven existing onboarding forms are projected from the existing pill definitions into continuous sections, with every defined field, completion indicators and additional saved scalar fields. Empty values display “Not provided”; zero and false remain visible. No main tabs, pill navigator or editing controls appear on the View page.
- Account, human KYC, licence validity/API result, fee requirement/status and trip eligibility are separate. Eligibility reasons come from the existing backend matching policy.
- The header shows the saved photo from an allowed embedded image or safely read local upload. Missing/damaged photos do not stop the page.
- All current and archived document versions appear beside their related fields. Driving-licence documents are beside licence fields; education, health, police and other personal documents remain in their corresponding sections. Unknown categories remain in the additional inventory. Metadata includes type, filename, registration number, MIME/size, version, upload/expiry/replacement date, KYC status and issue reason.
- Authenticated blob requests render images and native inline PDF viewers. Larger viewing/zoom and original downloads use temporary blob URLs, revoked when the page is destroyed. Three concurrent loads bound preview fetching. Missing originals display HTTP errors; damaged/unsupported bytes display an isolated error and retain an original download when bytes are available. Raw storage paths are excluded from the details response/display; no public private-document URLs were introduced.
- “Download Driver Resume” uses a deliberate public resume allowlist: name, phone/email, city/state, skills/type/languages, experience, education/training and vehicle type. DOB, full address, DL/identity numbers, bank data, private document inventory, KYC issues and financial records are excluded. The existing complete PDF remains explicitly labelled “Download Full Driver Report (internal)” and independently protected by export permission.

## Verification

- Backend: **378 tests passed in 26 files**.
- Frontend: **131 tests passed in 17 files**.
- Both production builds passed. Angular's existing Google Fonts retrieval required a network-enabled rerun after sandbox EACCES; a backend Nx access error also passed on its authorized rerun. Existing shared test-compilation warning remains outside this task's scope.
- Running UI: actual local API on 3334 and existing Angular server on 4400. Isolated PostgreSQL fixtures exercised partial and complete drivers, current/replaced images, an uploaded PDF, missing and damaged originals, all continuous field sections, route navigation/back, document history, mobile viewport with the existing sidebar collapsed, separate resume/full-report downloads and role denial.
- Existing driver exact-pill resume, verifier Issue → correction → affected check reset → authorized final human KYC approval and private document denial to customers still passed.
- Full Chromium is used for native inline PDF browser verification; the final screenshot confirms the uploaded PDF page actually renders with its native page/zoom controls. Download events are filtered by the resume filename so an unrelated document download cannot masquerade as a resume. After the native PDF viewer takes focus, the details resume is activated with keyboard focus/Enter to avoid headless mouse focus interference. List View and full-report download use mouse actions. Test token injection is restricted to the app origin and tolerates storage-less PDF frames; the final run asserts no staff-page errors.
- Independent PDFium inspection verified the partial and complete resumes are valid one-page PDFs and contain no private identity/bank/document/KYC sentinels. Complete internal reports remain valid six-page partial and ten-page complete PDFs with all form sections and inventory/history. Results: `verification/artifacts/results.json` and `pdf-results.json`; screenshots/PDFs are under the same artifact directory.
- Fixtures were removed by their generated IDs. Earlier runs preserved **6 Drivers, 2 Customers, 1 Booking**. The final repeat's starting and ending counts were both **7 Drivers, 2 Customers, 1 Booking**; its existing non-fixture records were preserved. A separate query confirmed no remaining UI fixture drivers by fixture login/name. No schema edits, migrations or database reset were needed for this task.

Browser verification uses local signed role tokens; login entry itself was not retested. Mobile verification uses a Chromium viewport rather than a physical phone or Safari. Native PDF preview behavior depends on the browser's installed PDF viewer; authorized larger viewing and original download remain available.

## Exact source/test/verification files changed for this View task

All paths below are relative to the workspace root; earlier in-progress changes were preserved.

- `apps/mera-driver/src/app/app.routes.ts`
- `apps/mera-driver/src/app/app.routes.spec.ts`
- `apps/mera-driver/src/app/core/drivers/drivers-api.service.ts`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.ts`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.html`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.spec.ts`
- `apps/mera-driver/src/app/pages/account/drivers/driver-details.ts` (new)
- `apps/mera-driver/src/app/pages/account/drivers/driver-details.html` (new)
- `apps/mera-driver/src/app/pages/account/drivers/driver-details.css` (new)
- `apps/mera-driver/src/app/pages/account/drivers/driver-details.spec.ts` (new)
- `apps/mera-driver-api/src/routes/drivers.routes.ts`
- `apps/mera-driver-api/src/routes/drivers.routes.test.ts`
- `apps/mera-driver-api/src/services/driver-details.service.ts` (new)
- `apps/mera-driver-api/src/services/driver-details.service.test.ts` (new)
- `apps/mera-driver-api/src/services/driver-resume.service.ts` (new)
- `apps/mera-driver-api/src/services/driver-pdf.service.ts` (existing renderer reused; shareable footer option)
- `apps/mera-driver-api/verification/ui-smoke.cjs`
- `apps/mera-driver-api/verification/inspect-pdfs.py`
- `apps/mera-driver-api/verification/artifacts/` (updated browser/PDF results and evidence)
- `apps/mera-driver-api/DRIVER-DETAILS-REPORT.md` (this report)
- `apps/mera-driver-api/WORKFLOW-IMPLEMENTATION-REPORT.md` (latest report link/test totals)

The pre-existing root `TASK.md` change was preserved. No intentional edits were made outside the two permitted projects.

## Preserved IDSPay boundary

The preceding fail-closed parser work remains preserved. Exact redacted success/103 JSON samples or their local file paths are still absent from the available conversation/workspace; structural negative tests are explicitly synthetic and are not claimed as supplied-response verification. Exact endpoint provenance, HTTP method, required headers and token expiry/refresh contract remain unconfirmed. Live DL calls remain disabled; no production request or credentials were exposed. This does not block the Driver Details or manual KYC workflow.


## Profile layout and protected-photo correction ? latest verification

The existing full-page route is retained inside `md-admin-page`, with an actual circular photo/initials header, contact details, authorized Edit Driver / Resume Preview / Download Resume / Download Full Report actions, separate Account/KYC/DL API/Fee/Availability/Eligibility cards, one exact blocking-reason notice, At a glance and onboarding progress. All original fields remain in grouped, initially expanded read-only sections. Current documents and clearly labelled previous versions are centralized with protected inline image/PDF previews and original downloads. The verifier checklist, final approval rules, IDSPay restrictions and money logic are unchanged.

The missing photo was caused by `onAvatarFileChange` storing only `file.name` while `uploadPendingDocuments` skipped `avatar-0`. The actual image was never uploaded. The correction uses the existing versioned multipart document route, then persists its actual backend reference. The details API resolves current profile-photo references (including registered legacy filename references) to the existing authenticated upload endpoint. The browser uses an authenticated request and a temporary blob URL, with format/load failure falling back to initials and **Profile photo missing**. It does not use a public private-document URL. Existing filename-only records cannot recover an original image that was never uploaded; they need a reupload. A read-only local inspection found five absent photos and two filename-only references, without printing identifying fields.

Changed implementation/test files for this correction: frontend `driver-details.ts/html/css/spec.ts`, `drivers.ts/spec.ts`, and `drivers-api.service.ts`; backend `driver-details.service.ts/test.ts`, `driver.service.ts`, and `document-history.service.test.ts`; `verification/details-layout-smoke.cjs` and label updates in existing `ui-smoke.cjs` / `resume-smoke.cjs`. Routes and permissions remain as documented above. Edit Driver uses the existing `/account/drivers?edit=:id` editor, not a new editor route. No migration or data reset was needed.

Real-browser verification covers a complete driver with two profile-photo versions, a passport image and an inline PDF; the existing Edit action uploads version 2 and persists its exact reference. Every rendered field count equals the API field count; previous versions, protected larger preview/download, anonymous/customer denial, read-only staff permissions, a partial missing-photo driver, a damaged-photo driver, and 390 px mobile layout pass. Driver/User/Role counts return to 7/12/13 after fixture cleanup. The existing connected-flow UI smoke also passed full/partial report downloads and pill-wise KYC correction. Both suites now pass 408 backend and 145 frontend tests. Both production builds are checked in the latest build logs. The frontend build has a nonfatal Driver Details CSS budget warning (4.70 kB / 4 kB).

The current and approved reference screenshots were not available; visual verification used actual local browser screenshots and the written layout. No live IDSPay or payment transaction was initiated.
