# Professional Driver Resume — 2026-10-01

The existing shareable resume download now has a dedicated full-page professional preview. Backend projection and HTML are shared with the backend PDF renderer; a revision hash prevents stale-preview downloads or overwriting concurrent edits. The complete internal Driver Information PDF remains separately labelled and export-protected.

## Routes and access

- Staff UI: `/account/drivers/:id/resume`, linked from Drivers → View Driver → Resume preview; requires `drivers:view`.
- Driver UI: `/driver/resume`, linked from My Profile; existing driver-portal guards apply.
- Staff API: `GET /drivers/:id/resume` (`drivers:view`), `PATCH /drivers/:id/resume` (`drivers:edit`, strict structured facts/revision/audit reason), `GET /drivers/:id/resume.pdf` (`drivers:export`).
- Own API: `GET /drivers/me/resume`, `GET /drivers/me/resume.pdf`; the record is resolved only from the JWT-linked Driver, never a supplied driver ID. Staff resume-edit access is not granted to drivers.
- PDF uses `application/pdf`, private/no-store caching and a UTF-8-safe filename such as `Resume_Full_Fixture_Driver_Resume.pdf`. The dedicated preview's Download PDF sends the current snapshot revision.

Both list and details retain authorized resume downloads. The internal full report uses the existing `/drivers/:id/profile.pdf` route and independent export permission.

## Actual onboarding pill mapping

All four tabs and eleven existing pills were inspected. The resume deliberately selects professional facts, with no private document inventory or financial data.

| Existing tab → pill | Resume mapping / exclusion |
| --- | --- |
| Personal Details → Personal Identity | Full name; saved languages array and legacy language selection. DOB, parent names, gender and marital status excluded. |
| Personal Details → Contact & Address | Saved city/state, phone/email subject to resume contact-sharing settings. Street address, emergency number and PIN excluded. |
| Personal Details → Physical Attributes | No resume fields; height, weight, religion and complexion excluded. |
| Personal Details → Account / Lead Details | Selected Driver type becomes title and selected key skills; saved experience contributes a factual summary/fallback experience line. No invented exact years from `5+ Years`. Source/internal lead data excluded. |
| Education & Health → Education & Training | Existing saved `education` qualification and `trainingStatus`. Certificates/documents excluded from the shareable resume. |
| Education & Health → Health | Health/blood/insurance fields and documents excluded. |
| Documents → Driving Licence | Saved DL number (expressly requested), selected licence classes, issue/expiry dates and supported `vehicleType`; expiry status is distinct from unconfirmed API verification. No unearned Verified label. |
| Documents → Police Verification & Employment | Existing pill has police fields and current/expected salary, but no employer/title/date/responsibility records. Those private fields are excluded; structured professional employment is stored in the resume-specific extension below. |
| Documents → Personal & Category Documents | Aadhaar, PAN, passport, voter data and all private uploaded originals excluded. |
| Payment Details → Account Details | Bank/UPI/payout details excluded. |
| Payment Details → Registration Payment | Fee state, amount, receipts and settlement/reviewer data excluded. |

The existing masters supply selected licence/vehicle/Driver types; the resume uses the Driver's saved selections, not every master option. Operational online status and trip readiness do not imply working availability.

## Missing source fields and additions

The original onboarding forms do not have employment-history records (job title, employer, location, start/end/current, responsibilities), manual/automatic skills, institution/location/year, service preferences or professional working availability. A nullable `Driver.resumeProfile` JSON extension stores only these structured professional facts plus optional reviewed summary, additional skills and contact-sharing settings. It does not create another Driver or onboarding system.

Authorized staff can enter/review these facts in a normal form with repeating employment entries and an audit reason. Backend limits, real-calendar-date validation, chronology/current-employment checks, strict allowed fields and stale-revision checks apply. Each update records actor, time, previous professional profile, new profile and reason. KYC, onboarding progress and financial fields are untouched. Existing saved `education` remains the qualification source.

Missing admin-preview fields say Not provided. Missing PDF lines/empty sections are omitted; partial Drivers do not receive invented work histories, qualifications, employers or years. Production routes never enable the demo label. DL API verification remains explicitly unconfirmed while the existing live integration is disabled.

## PDF and browser verification

Final full suites pass 399 backend and 138 frontend tests. Both production builds pass. The existing shared-UI test typing warning remains; no shared/root changes were made to suppress it.

- Fully populated synthetic Driver: summary, licence/classes/dates, vehicle and transmission skills, three employers with actual saved responsibilities, current employment shown as Present, key skills, qualification/institution/year, languages, availability/preferences. Staff saved these through the real editor/API, reloaded and downloaded the PDF.
- Partially completed synthetic Driver: missing-field indicators and an uncluttered one-page PDF with empty sections omitted.
- Own Driver: real portal preview and download, without a staff editor. Another Driver's staff preview/download, customer and verifier access were denied. An alternate driver ID in the own-route query did not alter ownership. Anonymous requests were denied.
- A stale revision returned HTTP 409 instead of generating a document that differed from the preview. Actual HTTP errors are shown.
- Independent PDFium extraction/rendering verified requested section order, every full-fixture employment entry staying on a single page, proper bullets, safe page bounds and absence of private KYC/payment/demo/undefined/null values. Full and own PDFs are two pages; partial is one. Both full pages and the mobile preview were visually inspected.
- The iframe is script-disabled and uses escaped backend HTML. It resizes with its width so the final Education/Languages/Availability sections remain visible on mobile. A 390px viewport has no horizontal overflow.
- Fixtures were removed by their own IDs. Seven existing Drivers and twelve Users were preserved. Verification uses short-lived local signed tokens; password login was not re-tested.

PDF artifacts, screenshots, exact synthetic snapshots and verification JSON are under ignored `verification/artifacts`. Very long real profiles may require additional pages rather than discarding responsibilities or shrinking text excessively.

The Ramesh Kumar visual asset was not available in this session or working tree. The requested content order and existing Mera Driver colours/style were used; exact matching to an unavailable screenshot is not claimed.

## Files and migration

- Backend: `prisma/schema.prisma`; `prisma/migrations/20261001100000_driver_resume_profile/migration.sql`; `src/schemas/driver-resume.schema.ts`; `src/services/driver-resume.service.ts` and test; `src/routes/drivers.routes.ts`, `driverSelf.routes.ts` and route tests; updated resume privacy expectations in `driver-details.service.test.ts` to permit the explicitly requested saved DL number.
- Frontend: `src/app/pages/account/drivers/resume-preview.ts`, `.html`, `.css`, `.spec.ts`; `src/app/app.routes.ts`; Driver Details and list resume actions/filenames; `src/app/pages/driver/profile/profile.html` own link.
- Verification: `verification/resume-smoke.cjs`, `inspect-resume-pdfs.py`; existing `ui-smoke.cjs`/`inspect-pdfs.py` updated for the professional filename and newly permitted DL number.

Migration status was checked before deployment. The only new resume migration adds nullable JSONB with no rewrite, deletion, seed or reset. It was applied to the existing local database; all seventeen migrations are up to date.
