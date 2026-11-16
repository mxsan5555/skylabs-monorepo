# Drivers List layout and verification — 2026-10-01

The existing `/account/drivers` page still uses `sky-data-table` (`packages/shared-ui/src/components/sky-data-table/sky-data-table.ts`). No replacement table, shared-library edit, new route, migration, payment change or approval-policy change was made. Existing onboarding forms and authorized More actions are preserved.

## Completed

- Four ordered, clickable cards and synchronized quick views: All Drivers, Driver Users, Need KYC Review, Ready for Trips. No Login controls are removed; unlinked records remain in All Drivers.
- Backend summary facets apply the same search, city, KYC, fee and availability filters, independently of the selected view. The selected card's count equals that view's total. Driver Users remains a filter on linked Driver records. Existing readiness policy and Needs Review rules are unchanged.
- The existing DataTable search is the only registry search. It covers ID, first/last/full name, mobile, email and DL number. The duplicate DataTable status dropdown is removed.
- Initially visible filter panel contains City, KYC status, Registration fee status and Availability. Show/Hide retains values; active chips and Clear Filters remain outside the panel. Changing a filter/view/search resets pagination.
- Search, filters, view, page, page size, sort and Show/Hide state persist in session storage for return from Driver Details. This uses the existing DataTable reactive search/sort state because that component has no public controlled-state properties; no shared source was changed.
- Rows show initials, full name, abbreviated ID and mobile; full ID and separate mobile remain available in column selection. City, onboarding percentage, KYC, fee and exact first backend eligibility blocker are visible. All blocker reasons remain on Driver Details. Optional unpaid fees say Optional; their financial state stays Unpaid.
- Existing export, row selection, column selection, paging and sorting remain operational. Name sort maps to backend first-name sort; city, ID and onboarding percentage are added to the safe server-sort whitelist. Existing hidden onboarding position and raw fee state remain available.
- View still opens `/account/drivers/:id/details`. More retains permission-checked resume/report downloads, edit, login management, verifier assignment, status and delete actions. Add Driver is shown only with `drivers:create`.

## API and changed files

Existing GET `/drivers/search` adds optional `view=all|users|review|ready`, retains legacy filters and response shape, and returns filtered summary counts. No duplicate endpoint was introduced.

- `src/services/driver-list.service.ts`, `src/services/driver-list.service.test.ts`
- `../mera-driver/src/app/core/drivers/drivers-api.service.ts` (preserves `registrationFeeRequired` in the existing DTO)
- `../mera-driver/src/app/pages/account/drivers/drivers.ts`, `drivers.html`, `drivers.spec.ts`
- `verification/drivers-list-smoke.cjs`
- This report and the latest verification links in `WORKFLOW-IMPLEMENTATION-REPORT.md`

## Verification

Both complete suites pass: **408 backend tests / 27 files**, **145 frontend tests / 18 files**. Both production builds passed. The frontend build reports a nonfatal Driver Details CSS warning (4.70 kB versus 4 kB warning budget).

The browser harness uses real local PostgreSQL records, API responses and Chromium, with a locally signed existing admin identity. It checks 25 fixtures: All 25, linked users 4, Needs Review 21, Ready 4; combined search/city/KYC/fee/availability; all four card views; one search; no duplicate status dropdown; hidden filters retaining chips; paging/search reset; return navigation restoring search/view; sort; column selection; row selection; More; existing current-page export popup; Clear Filters; 390 px mobile layout without page overflow. No payment/provider call occurs. Fixture cleanup restores the original **7 Drivers / 12 Users**. Artifacts and logs are under `verification/artifacts/`.

## Exact remaining scope blockers

The shared DataTable's `_cellContent` accepts only plain values/status/image cells; its image renderer accepts only HTTP URLs, and actions always render `md-icon-button`. It has no custom-cell/action slot or renderer. Therefore the requested inline progress bar and visibly labelled View/More row buttons are **not implemented**: percentage text and accessible action labels/tooltips are retained. Initials are shown instead of unsafe unauthenticated photo URLs. The visible More dialog itself is labelled and permissions are unchanged.

The exact outside-scope file is **`packages/shared-ui/src/components/sky-data-table/sky-data-table.ts`**. The smallest proposed reusable extension is an optional cell-rendering hook (identity/progress), an opt-in visible action-label mode, and protected blob/data image support with an error fallback. Public controlled search/sort properties would remove the current local reactive-state coupling. None of these changes was made outside the authorized app paths.

Browser inspection also reproduced overlapping pointer targets in the existing column selector: 48 px Material checkbox targets overlap its shorter label rows. Keyboard selection passes; pointer selection is not claimed fixed. The smallest change in that same shared file is sufficient option-row height plus a viewport-bounded scrollable menu.

The approved reference attachment was unavailable in this session. The written layout and existing Mera Driver components/styles were followed; pixel-for-pixel matching is not claimed. Password login was not exercised by this fixture harness.
