# Document-type duplicate prevention delivery

Implemented in the existing driver registration/edit/onboarding forms and driver portal. All source changes are inside the two authorized apps. The previous admin work is retained; see ADMIN_LAYOUT_DELIVERY.md for its separate implementation and outstanding requirements.

## Upload locations and taxonomy

| Location | Section identity | Choices |
| --- | --- | --- |
| `/account/drivers`, Add/Edit Driver, Education & Health tab, Education & Training pill | `education` | Existing seven education document choices, now with canonical `education:10th`, `education:12th`, `education:diploma`, `education:bachelor`, `education:master`, `education:training`, `education:other` keys |
| Same form, Health & Medical pill | `health` | Existing `health-docs` master IDs |
| Same form, Documents tab, Police Verification pill | `police` | Existing `police-docs` master IDs; existing Yes/No visibility condition retained |
| Same form, Documents tab, Personal & Category Docs pill | `personal` | Existing `personal-docs` master IDs |
| `/driver/documents`, all four categories, including the existing profile page's Upload or replace documents link | Same four identities | Same shared choices and reservation helper |
| Admin profile-photo and registration-fee receipt fields | Fixed `personal` singleton types | Existing explicit singleton replacement behavior retained; these are not additional selectable rows |

The public driver application form and portal profile form do not have another document uploader. The portal profile links to `/driver/documents`; resubmission reuses that uploader. The old unused document-category signal is not a rendered upload control. Education-level, health, status, licence and unrelated dropdowns retain their existing choices.

## Behavior and persistence

One shared selection helper resolves existing labels to stable master IDs/canonical education keys, filters types used by other saved or unsaved active rows, retains the current row's selected/inactive/historical option, and identifies legacy duplicate rows without removing their files. Unmatched historical types retain their existing canonical string identity. New rows start with Select Document Type; an existing empty row prevents repeated empty rows. Add is disabled when no unused choices remain, with the requested all-types-added message.

Archived versions are filtered out of active edit rows, while the full document/history surfaces remain intact. Edit loads current saved documents before allowing document controls. Late responses for another driver are ignored. Master loading does not rewrite selected values.

Clearing a file removes its pending upload while retaining the row/type. Unsaved deletion releases the type immediately and correctly reindexes pending uploads. Saved deletion uses the existing confirmation/API and only removes the row after success; failure retains the row and reservation. Saving awaits uploads, preserves a failed draft/pending file and reports the backend error instead of silently discarding it. Replacing a saved row sends its current document ID. The portal exposes Replace file and Cancel replacement through its existing upload service.

## API mapping and concurrency

| Existing endpoint | Existing authorization | Added validation |
| --- | --- | --- |
| `POST /drivers/:id/documents` | `drivers:edit`, existing record authorization | New active duplicate rejection; optional `typeKey` and explicit `replaceDocumentId` |
| `POST /drivers/me/documents` | Existing authenticated own-driver resolution | Identical service validation; driver ID remains server-derived |
| `DELETE /drivers/:id/documents/:docId` | Existing `drivers:edit`/record authorization | Existing archive workflow reused |
| `DELETE /drivers/me/documents/:docId` | Existing own-driver/document ownership | Existing archive workflow reused |

Both POST routes use the same service transaction. Its existing `SELECT Driver ... FOR UPDATE` serializes same-driver uploads; validation and creation/replacement occur under that lock. New duplicates return HTTP 422 `DOCUMENT_TYPE_DUPLICATE` with `details.fieldErrors.type` and the requested readable message. An explicit replacement must identify the current active document of that same driver/section/type; stale/foreign/changed-type replacements return 409. Only that chosen row is archived, preserving other legacy duplicates and all prior versions. New version numbers exceed the previous maximum. Fixed profile-photo/receipt fields retain their existing singleton replacement semantics.

Inspection found no supported document batch-save or metadata-update endpoint and no other document writer. Array/batch payloads submitted to the existing POST endpoint fail its schema with 422; sequential form uploads each pass the same locked validation. No unsupported batch endpoint was invented.

## Data effects

No schema migration, uniqueness migration, seed change or existing-file cleanup was needed for this document change. The configured database inventory found 10 active documents, 2 historical versions and 0 legacy duplicate groups. No existing records were deleted, merged or overwritten by the change or verification. A disposable unlinked driver was created for the live API checks; only its test metadata/documents/audits were removed afterward. No physical files were uploaded for that live fixture, and no DL/provider calls were made. The earlier admin seed changes are documented separately.

Legacy duplicate files remain visible in active rows and full history; each row is marked and can be resolved through existing authorized replacement/withdrawal actions. A database-wide unique index was deliberately not introduced. All current application document writers use the locked service validation.

## Actual verification

- Frontend: 227 tests passed across 28 files. Includes shared filtering, row deletion/reindexing, failed saved deletion, saved/history loading, late-driver response, and driver portal replacement/cancel/error/withdrawal tests.
- Backend: 566 tests passed across 38 files, including all four categories, canonical IDs, legacy siblings, stale replacement and history/ownership regressions. Existing onboarding, KYC/DL, PDFs/resume, bookings/dispatch, payment/provider/accounting tests ran in the same suite; external providers are mocked in those tests.
- Both app `tsc --noEmit` checks passed. Both production builds passed. `git diff --check` passed. Production frontend build required existing-font network access; the shared test-support compilation warning remains outside the permitted source scope.
- Real configured API/PostgreSQL: two concurrent new uploads resulted in exactly one 201 and one field-level 422; duplicate create, explicit replacement/version 2, stale replacement, failed delete reservation, archive/re-add, array rejection and seeded legacy-sibling preservation passed.
- Running UI on port 4401 with the updated real API on 3335: empty selection, current-row retention, second-row filtering, deletion restoration, all four admin sections, and saved-type filtering in an existing linked driver's portal passed with no page errors. No API response was mocked, and the screenshot run made no writes.
- The previously changed admin sidebar/registry/roles/users pages were rechecked and captured at desktop/tablet/mobile sizes after this change.

Checks use short-lived signed existing-account session fixtures, not actual OTP/password login. Real SMS/login delivery and external DL/payment calls were not executed. The live document fixture exercises metadata/version persistence; actual binary upload/download is covered by existing multipart/authorization tests, not a new physical-file live test. Saved-row failed deletion and failed replacement draft retention were verified through frontend HTTP tests; successful version/reload persistence was verified against the real API. No full browser Save & Next/resubmission mutation was performed against existing drivers.

## Running-UI screenshots

- [Before selection](artifacts/document-types-before-selection.png)
- [After selection: remaining choices](artifacts/document-types-after-selection.png)
- [Selected and new rows](artifacts/document-types-selected-rows.png)
- [After deletion: type available again](artifacts/document-types-after-deletion.png)
- [Linked driver portal](artifacts/document-types-driver-portal.png)

## Changed files for this document task

- `apps/mera-driver/src/app/core/drivers/document-taxonomy.json`
- `apps/mera-driver/src/app/core/drivers/document-type-selection.ts`
- `apps/mera-driver/src/app/core/drivers/document-type-selection.spec.ts`
- `apps/mera-driver/src/app/core/drivers/drivers-api.service.ts`
- `apps/mera-driver/src/app/core/drivers/driver-self-api.service.ts`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.ts`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.html`
- `apps/mera-driver/src/app/pages/account/drivers/drivers.spec.ts`
- `apps/mera-driver/src/app/pages/driver/documents/documents.ts`
- `apps/mera-driver/src/app/pages/driver/documents/documents.html`
- `apps/mera-driver/src/app/pages/driver/documents/documents.spec.ts`
- `apps/mera-driver-api/src/services/driver.service.ts`
- `apps/mera-driver-api/src/schemas/business.schema.ts`
- `apps/mera-driver-api/src/routes/drivers.routes.ts`
- `apps/mera-driver-api/src/routes/driverSelf.routes.ts`
- `apps/mera-driver-api/src/services/document-history.service.test.ts`
- `apps/mera-driver-api/src/services/registration-form.service.test.ts`

Verification scripts: `document-inventory.cjs`, `document-live-api.cjs`, `document-running-ui.cjs`. Results/screenshots/logs are under `verification/artifacts`. `admin-running-ui.cjs` also gained safe local-API failure handling.
