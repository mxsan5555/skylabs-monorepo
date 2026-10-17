# mera-driver tasks

The only task list for mera-driver. Created 2026-10-17 from the implementation order of the role
specification, the gaps and proposals of the old `MERA_DRIVER_ARCHITECTURE.md`, and the open
mera-driver items of the root `TASK.md`. Rules: `PLANNING.md`. How to use, areas, sizes and the
definition of done follow `docs/msd/TASKS.md` (including "docs match the code").

## Progress

| # | Module | Done | Total |
|---|---|---|---|
| 1 | Administration | 0 | 5 |
| 2 | Customers | 0 | 1 |
| 3 | Drivers | 0 | 4 |
| 4 | KYC and verification | 0 | 3 |
| 5 | Bookings and trips | 0 | 3 |
| 6 | Vehicles | 0 | 1 |
| 7 | Accounts | 0 | 2 |
| 8 | Partners | 0 | 3 |
| 9 | Support and content | 0 | 1 |
| 10 | Masters | 0 | 1 |
| 11 | Platform, security and release | 0 | 5 |
| | **Total** | **0** | **29** |

## 1. Administration

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | A-01 | BE | Map the `PLANNING.md` §1.2 matrix and §1.3 special actions to existing permission keys; add only the missing keys, no duplicates | M | M-D1 | Mapping table in PLANNING.md; seed updated |
| [ ] | A-02 | DB | Apply the defaults to existing roles through one reviewed, versioned update; seeding never overwrites saved custom grants | M | A-01 | Re-seed keeps custom grants (test) |
| [ ] | A-03 | FE | Role Management: grouped modules, 4-column matrix, Special Actions, change summary, restore defaults with confirmation | L | A-01 | Component tests |
| [ ] | A-04 | BE | Enforce Vendor, Company, Assigned and Own scopes on the server for list, search, detail, document, PDF and export endpoints | L | A-01 | IDOR tests per scope |
| [ ] | A-05 | FE | Admin screen for per-user permission overrides (`UserPermissionOverride`) | M | A-03 | Allow and deny saved, deny wins (test) |

## 2. Customers

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | C-01 | QA | Check the customer portal (`/customer/*`, `/customers/me*`) against `PLANNING.md` §2: own data only, no driver private fields | S | - | Tests for another customer's id return 404 |

## 3. Drivers

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | D-01 | BE | Limited operational driver view for Sales, Support and Company, separate from the private driver details | M | A-01 | Limited roles never receive DL, DOB, bank or documents |
| [ ] | D-02 | BE | Staff driver resume export separate from the full internal driver report | M | A-01 | Resume permission does not open the full report |
| [ ] | D-03 | BE | A route that writes `Driver.verificationNotes` (staff only) | S | - | Notes saved and shown read-only in the portal |
| [ ] | D-04 | DB | Foreign keys from `AttendanceRecord` and `DriverLocation` to `Driver` | M | M-D8 | Migration with `down.sql`; queries by driver id |

## 4. KYC and verification

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | K-01 | BE | Final human KYC approval as its own permission and endpoint, never implied by `drivers:edit` | M | A-01 | Data Operator and verifier get 403 on approval |
| [ ] | K-02 | FE | One "KYC and verification" module in the console with its four stages | M | K-01 | Menu and screens match PLANNING.md §4 |
| [ ] | K-03 | QA | Reassigning a driver removes the old verifier's access at once (detail, documents, checklist) | S | - | Test |

## 5. Bookings and trips

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | B-01 | DB | Real foreign keys on `Booking` for driver and vehicle (customer is linked already) and on `FareRule` | M | M-D8 | Booking history queryable by driver id |
| [ ] | B-02 | BE | `Requirement` entity and wire the `/ride/*` UI to it | L | M-D3 | Requirement created from the public flow |
| [ ] | B-03 | BE | `Assignment` entity (driver to customer, company or requirement), append-only | L | B-02, P-01 | One active assignment per driver (test) |

## 6. Vehicles

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | V-01 | DB | `Vehicle.customerId` becomes a real relation | S | - | Migration and test |

## 7. Accounts

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | AC-01 | BE | Real payments module (registration fees, booking payments, payouts, refunds) replacing the stub | L | A-01 | Ledger rules of PLANNING.md §7 tested |
| [ ] | AC-02 | BE | Real reports module replacing the stub, with dashboard widget metrics | M | AC-01 | Widgets show real numbers |

## 8. Partners

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | P-01 | BE | `Vendor` and `VendorDocument`, vendor portal `/vendor/*`, drivers linked by `vendorId` | L | M-D6 | Vendor A never sees vendor B's drivers |
| [ ] | P-02 | BE | `Company` and `CompanyUser`, company portal `/company/*` | L | M-D3 | Company scope tests |
| [ ] | P-03 | FE | Vendor and company dashboards on `sky-data-table` | M | P-01, P-02, M-D9 | Component tests |

## 9. Support and content

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | S-01 | BE | API modules for FAQs, feedback, promotions and support cases behind the existing console pages | M | - | Pages show real data |

## 10. Masters

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | M-01 | FE | Give `pricing` and `attendance` distinct `order` values in `mera-driver-menu.json` | S | - | Sidebar order stable |

## 11. Platform, security and release

| Done | ID | Area | Task | Size | Depends | Done when |
|---|---|---|---|---|---|---|
| [ ] | X-01 | QA | Fix the 12 known failing specs (app routes RBAC wiring, users "Login As", drivers page `rbac.permissionsCatalog is not a function`) | M | - | `nx run mera-driver:test` green |
| [ ] | X-02 | QA | RBAC, ownership, KYC, export and workflow regression suite (`TESTING.md` §4) | L | A-04 | Suite green in CI |
| [ ] | X-03 | BE | Document `auth` and `health` routes in OpenAPI | S | - | 149 of 149 documented |
| [ ] | X-04 | OPS | Deploy mera-driver-api to Railway and point `environment.prod.ts` at it | M | - | `docs/DEPLOYMENT.md` §9 checks pass |
| [ ] | X-05 | BIZ | Owner answers the open questions in `PLANNING.md` §12 | S | - | Answers recorded |
