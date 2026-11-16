# Dispatch, Accounts and Driver scale continuation

All intentional edits remain in the two Mera Driver apps. Existing work and financial history were preserved. Root TASK.md was already modified and was not touched.

## Implemented

- Reused sky-data-table, existing admin/portal shells, workflow component, permission keys, pricing and append-only MoneyMovement ledger.
- Accounts has one sidebar group in the requested order. Overview contains summary cards, up to five pending actions and up to five recent transactions. Other pages contain their own bounded records and authorized forms, without the repeated seven-tab navigation or full dashboard.
- Driver search uses prepared SQL for combined filters, database counts and stable page IDs, then hydrates only that page. Four cards and existing search/filter hide/chips/session state remain. Skills filter retained; login/eligibility filter fields remain absent.
- Customer candidates are ranked and bounded (10 by default, maximum 25); city, configured service skill, account/KYC/manual licence/fee/online and schedule conflicts are enforced on the backend. A selected driver creates one pending offer in the same transaction as the booking. Waiting state exposes only the pending name/ID. Acceptance remains row-locked and atomic; decline/expiry returns to dispatch. Admin searches the full database with eligible drivers first, assigns another eligible driver with reason, assignment audit and portal notifications.
- Driver COD collections/refunds and commission settlements/refunds are distinct ledger kinds. Driver-held COD is excluded from platform booking receipts; earned commission is receivable until collected. Actual payouts require available payable balance, explicit completed-transfer confirmation, reference and audit reason. Registration fees count once; commission settlement does not add income again.
- Required service skills are configured through the existing audited commission policy form; nullable saved FareRule.requiredDriverSkill adds no invented defaults or backfill.

## Removed and retained paths

Removed unused frontend prototypes:
- src/app/pages/account/payments/payments.ts and payments.html
- src/app/pages/account/payments/driver-payouts/driver-payouts.ts and driver-payouts.html
- src/app/pages/account/payments/wallet-transactions/wallet-transactions.ts and wallet-transactions.html

Removed backend src/routes/payments.routes.ts and its app mount: GET /payments was a stub returning an empty array and had no active consumer. The old wallet prototype used static JSON and local memory CRUD, with no persisted wallet model/ledger/API. Static data assets and all financial data/migrations remain intact.

Legacy /account/payments/payments redirects to /account/accounts/booking-payments; /account/payments/driver-payouts redirects to /account/accounts/driver-payouts; /account/payments/wallet-transactions redirects to /account/accounts/reports. Existing provider webhook POST /payments/provider/webhook, workflow payment-order/payment-confirm and canonical Accounts APIs remain. Existing /drivers route contract remains, now bounded by the canonical list service.

## Migration and scale evidence

20261001130000_fare_driver_skill adds only nullable FareRule.requiredDriverSkill. Local status: all 18 migrations applied; no reset.

verification/driver-scale-plan.cjs tested production query builders against connection-private TEMP Driver/User tables: 100000 drivers, 40000 linked users, 60000 requiring review, 10000 ready; final page 25 records; combined filtered-ready count 5000; public candidates capped at 25. TEMP tables drop on commit; public Driver count stayed 7. No dummy production records or speculative production indexes were added. Candidate query now materializes its policy projection and joins active users rather than repeating a correlated lookup. Deep-page EXPLAIN measured approximately 9.85 seconds during concurrent local builds; this is a correctness/bounds stress check, not a production latency SLA.

## Validation

423 backend tests and 153 frontend tests passed; both production builds passed. Frontend retains existing Driver Details CSS warning (4.70KB versus 4KB warning budget) and shared testing TypeScript warning. No root dependency/config changes.

Browser validation results are recorded separately in verification/artifacts/dispatch-accounts-results.json and drivers-list-results.json (both passed). Isolated local fixture users exercise real password login and real PostgreSQL/API/UI; Super Admin uses a local signed token. Fixtures are removed by owned UUIDs only. No gateway or IDSPay production call.

## Source groups changed

Backend: app.ts; routes/drivers.routes.ts and workflow.routes.ts; services/accounts.service.ts, driver-list.service.ts, driver-readiness-sql.ts, trip-workflow.service.ts, workflow-menu.ts, booking-invoice.service.ts; Prisma schema/additive migration; focused list/accounts/workflow tests and verification scripts.
Frontend: app.routes.ts/spec; pages/workflow/workflow.ts/html/spec; pages/account/drivers/drivers.ts/html; removed prototype files listed above. Preserved previously completed Driver Details, PDF, resume, onboarding and KYC work.

## External limitations

Live Razorpay capture/webhook subscription and actual bank/gateway transfer verification remain controlled external checks; automated tests use provider fixtures. IDSPay live verification stays disabled pending exact-endpoint method/headers/token lifecycle and complete confirmed contract. Real service-to-driver skills require admin configuration of the new nullable field; existing records are not assigned guessed skills. The shared DataTable renderer is outside scope: its established action/column control behavior is preserved.

Browser results: preferred-driver acceptance and decline, Admin assignment of another eligible driver, atomic race (one HTTP 200/one 409), OTP completion, ownership/RBAC, seven distinct Accounts pages, COD 500/1000/15% example and idempotent manual receipt all passed. Drivers list browser: four actual fixture facets 25/4/21/4, combined filtering, single search, hide preserves values, pagination/sorting/export, column/row selection, More actions, return navigation and mobile overflow passed. Fixture cleanup restored 7 Drivers, 12 Users, 2 Customers and 1 Booking. Gateway tests passed with fixtures; no live provider settlement claim.

Read-only final browser check also passed all seven canonical finance routes, both legacy redirects and mobile Accounts Overview without overflow (finance-pages-results.json). Screenshot visually inspected: original shell/styles preserved, distinct income/receipts/share cards and one Accounts navigation group.

The final pending-action query includes unsettled driver COD commission even when the customer payment is paid, with the actionable label COD commission collection pending. The Accounts query regression test checks that predicate. Financial audit labels show the approving staff name rather than UUIDs; original IDs remain in protected backend audit records.

Complete combined scoped working-tree file manifest: verification/dispatch-accounts-working-tree-files.txt (includes earlier preserved work and verification artifacts). Final production build evidence: dispatch-accounts-api-build.log and dispatch-accounts-ui-build.log.

Final connected rerun against webpack build 8e30399c53017ca2 passed all nine flow groups, including the new pending COD commission assertion, and restored baseline counts. Final frontend production build completed 2026-10-03T06:17:55.748Z. No real payment/payout/refund or IDSPay request was made.
