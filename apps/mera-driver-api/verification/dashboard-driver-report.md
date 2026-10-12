Implemented in `apps/mera-driver` and `apps/mera-driver-api`. Existing workspace changes, roles, permission grants, portals, login return destinations, driver/document history and payment history were preserved. No database migrations or seed changes were made for this task.

1. **Dashboards and security**

   Database aggregates replace the staff dashboard placeholders. The existing shell, cards, Material controls and DataTable remain in use. Dashboards have the actual account name, permission-filtered actions, one Needs Attention section and recent/assigned records. Filtered links use parsed URLs; Registry drill-downs bypass unrelated saved filters and expose removable filter chips. Booking destinations use server pagination and the same database predicates as their cards, including for cohorts larger than the previous 1,000-row list limit. View-only customer/booking pages hide mutation controls. Summaries clear on account changes, reject stale responses, and show loading/error/retry states. Customer summaries refresh after embedded booking/payment updates.

   | Role / existing key | Primary widgets | Scope and destinations |
   |---|---|---|
   | Super Admin / `super_admin` | All Drivers; Need KYC Review; Today's Bookings; Pending Driver Assignment; Confirmed Collections; Recorded Commission | Existing full administrative access. Registry with matching views, Bookings with schedule/assignment filters, Accounts Booking Payments and Commissions. Add Driver, Assign Verifier, Create Booking and Accounts actions require their existing permissions. |
   | Admin / `admin` | Driver total; KYC queue; today's bookings; pending assignment | Existing granted operational scope; the same Registry and Booking filters. Four-card default. Accounts action appears only with Accounts permission. |
   | Vendor / `vendor` | Own driver total; own KYC work; missing documents; own bookings | `Driver.createdByUserId` is the vendor account. Bookings link through those owned drivers. Accounts aggregates, movements and exports use that same scope. No platform-wide finance widgets. |
   | Marketing / `marketing` | No fabricated metrics | Permission-filtered Promotion, Website Content and Report links; explicit explanation that metric sources are unavailable. |
   | Sales / `sales` | Own permitted bookings; awaiting confirmation; unpaid; confirmed | Existing booking creator relationship. Booking status/payment filters and booking/customer operations remain permission-gated. |
   | Company / `company` | Own bookings; upcoming; ongoing; outstanding payment | Existing `Booking.createdByUserId` relationship. Booking schedule/state filters and scoped Accounts. Outstanding amount uses stored priced-booking balances. |
   | Data Operator / `data_operator` | Own drivers; Need KYC Review; incomplete profiles; missing documents | Existing driver creator relationship. Registry review/profile/document filters and Add/Edit/Upload through existing forms. No KYC approval or finance grants. |
   | Support / `support` | Pending; unassigned; cancelled; unpaid bookings | Existing permitted booking scope; no staff-assignment relation is fabricated. Matching Booking filters. Unpaid bookings are never labelled support queries. |
   | KYC Verification / `kyc_verification` | Assigned drivers; pending reviews; issues raised; completed reviews | Own `assignedVerifierId`, with matching KYC queue states and Open Review links. DL verification remains explicit in Review. |
   | Driver / `driver` | Profile completion; actual KYC; actual registration fee; upcoming trips | Linked own driver resolved from authenticated user. Profile/KYC/Fee/Trips destinations. Existing blockers, document issues and profile checklist remain; Resume and upcoming-trip actions use existing pages. |
   | Customer / `customer` | Own bookings; upcoming; completed; pending payment | Linked own customer resolved from authenticated user. Existing Book a Driver, Booking, Payment and assigned-driver displays. |

   Ownership remains restrictive when creation permission is revoked. Vendor/Company-only accounts cannot gain global data scope through assignment authority. Admin/Super Admin and existing custom administrative permission rules are retained. Equivalent restrictions apply to driver assignment, dispatch, Accounts and CSV destinations. Client-supplied account/role IDs do not grant access.

   Financial cards use the existing accounting SQL: confirmed platform **booking receipts**, all time, excluding registration fees and driver COD; commission recorded for completed, fully paid bookings, all time. Outstanding amounts use stored `farePaise` and confirmed movements, not estimated fares. Today's schedule is interpreted in India time from the database's UTC timestamps.

2. **Driver form, DL, fee and Registry**

   - Removed embedded DL verification from staff Add/Edit and Driver Profile. Saving information, documents, drafts or fees cannot call IDSPay. Authorized explicit Verify DL remains in KYC Review. Existing hashes make prior DL results stale when number/DOB changes; history is retained.
   - New/edited DL values normalize case and pasted whitespace/hyphens, then require two letters plus exactly 13 digits. No truncation, padding or inferred digits. Unchanged historical values, including equivalent formatting, remain editable; changed legacy identifiers must use the common format. Empty optional drafts remain allowed.
   - Registration amount comes from existing per-driver fee policy. Unpaid hides payment inputs. Paid shows supported modes, configured amount, date and compact optional receipt/reference. Authorized cash/bank/UPI recording uses the existing audited ledger and stable retry reference. Gateway payments still require server verification. Unsupported/unconfirmed payment modes produce a clear error rather than a false Paid state. Confirmed receipt details prefill from the ledger; legacy paid records can save unchanged. Existing non-binary ledger states remain visible.
   - Fee saves omit final KYC and administrative Driver Status fields. Actual KYC is read-only, with a permitted Open Review link. Previously paid fees require the existing Accounts correction/refund flow before becoming unpaid.
   - Registry identity is name and phone only. Removed photo requests, avatars and displayed UUID from that cell. Existing columns, actions, search, filtering, sorting and pagination remain. Existing archive/delete limitations remain unchanged. Current verifier remains selected.
   - Removed Availability from controls, saved filter state and outgoing parameters; the backend ignores it even in historical URLs. Registry failures now have Retry and do not present failed summaries as successful zero counts.

3. **Availability inspection**

   `Driver.online` is a real online/offline boolean. The authenticated driver updates it from `/driver/availability` through `DriverWorkflowApiService.setAvailability()` and `PATCH /workflow/driver/availability`, with own-driver resolution on the server. The screen also starts/stops own-device location sharing. Eligibility/readiness and candidate matching/dispatch consume it. Busy state is computed separately from overlapping or ongoing bookings; work preferences are separate fields. This functioning flow and all trip rules were preserved.

4. **Files changed in this task**

   Frontend paths below are under `apps/mera-driver/src/app/`:

   - `pages/account/dashboard/dashboard.ts`, `.html`, `.spec.ts`.
   - `pages/account/drivers/drivers.ts`, `.html`, `.spec.ts`; `registry-identity.ts`, `.spec.ts`.
   - `pages/account/kyc-assignments/kyc-assignments.ts`; `pages/account/trips/bookings/bookings.ts`, `.html`; `pages/account/customers/customers.ts`, `.html`; `pages/driver/trips/trips.ts`.
   - `pages/driver/profile/profile.ts`, `.html`; `pages/driver/dashboard/dashboard.ts`, `.html`.
   - `pages/customer/dashboard/dashboard.ts`, `.html`; `pages/workflow/workflow.ts`.
   - `core/drivers/drivers-api.service.ts`; `core/trips/bookings-api.service.ts`.

   Backend paths below are under `apps/mera-driver-api/src/`:

   - `app.ts`; `lib/ownerScope.ts`, `.test.ts`.
   - `routes/dashboard.routes.ts`; `routes/bookings.routes.ts`; `routes/drivers.routes.ts`; `routes/workflow.routes.ts`, `.test.ts`.
   - `services/dashboard.service.ts`, `.test.ts`; `services/licence-input.ts`, `.test.ts`.
   - `services/driver.service.ts`; `services/driver-list.service.ts`, `.test.ts`.
   - `services/booking.service.ts`, `.test.ts`; `services/accounts.service.ts`; `services/accounts-pagination.service.test.ts`.

   Verification additions: this report, `dashboard-driver-mocked.cjs`, `dashboard-live-readonly.cjs`, dashboard test/build logs, JSON results and screenshots under `apps/mera-driver-api/verification/`. Generated production bundles are ignored through the two app verification `.gitignore` files.

5. **Verification evidence**

   - Frontend: 246 tests passed. API: 655 tests passed; one existing opt-in document-browser test skipped. Suites use mocked provider transport and cover DL/stale results, KYC permissions, draft saves, fee recording/retries, ownership, driver identity, filters and verifier selection. Two-account Vendor/Company/reviewer/Driver/Customer cases are covered by mocked API tests.
   - Frontend Angular compilation and API TypeScript checks passed. Production builds passed; Google Fonts inlining required sandbox network approval. One Nx plugin worker interruption was retried.
   - Browser: all 11 roles in the production bundle at 1440px desktop and 390px mobile, mobile Registry/fee form, card URLs, empty responses, API error/retry, old Availability URLs, Registry identity, current verifier selection, Paid/Unpaid visibility and read-only KYC. Twelve scenario groups passed, with zero provider calls. Evidence: `artifacts/dashboard-driver-mocked-results.json` and `dashboard-mocked-*-desktop/mobile.png`.
   - Live local verification: eleven existing accounts checked with a single database connection explicitly set read-only. Available driver/KYC aggregates matched filtered destinations; Super Admin receipts and commission matched Accounts. Two reviewers, two linked drivers and two linked customers were exercised. Zero provider calls and no database history changes. Evidence: `artifacts/dashboard-live-readonly-results.json`.

6. **Unavailable metrics and checks**

   - Promotion activity/expiry, attribution/conversion tracking and registration reports lack a working database/API metric source. Existing pages remain linked; no sample-data counts were shipped.
   - There is no vendor settlement ledger, separate company/team ownership model, staff lead-assignment relationship or persisted resubmission state. Dashboards use the real creator/driver/reviewer relationships and current queue states.
   - Missing Documents means no current uploaded document; it does not invent a mandatory-document policy.
   - Outstanding amounts cover stored priced bookings. Schedule summaries use real typed schedule timestamps; unsupported legacy text schedules are not parsed into invented dates.
   - The final local check has one active Vendor, no Company, and no active Admin/Support accounts. Marketing and Sales also passed the final live read-only check. Those roles were tested using mocked APIs/browser fixtures; two-Vendor/two-Company live comparisons could not run without adding records. No fixtures were inserted.
   - Partial registration collections continue through Accounts; the simplified form records the configured full fee and does not overwrite partial receipts.
   - Payment persistence, duplicate prevention and permission enforcement were exercised with mocked writes. No real IDSPay/SMS/gateway calls or live financial writes were made. Full live end-to-end payment recording/reversals therefore remain unperformed.
