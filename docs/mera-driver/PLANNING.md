# mera-driver planning: scope, roles and business rules

Business source of truth for mera-driver (driver booking). Merged on 2026-10-17 from the role
matrix drafts (`MERA_DRIVER_ROLE.md`, `Mera_Driver_Role_Permission_Matrix_Concise.md`,
`mera-driver-final.md`, both `role_user` files) and the business parts of
`MERA_DRIVER_ARCHITECTURE.md`. The role matrix below is a **specification**: the matching seed,
scope rules and routes are not implemented yet (see `TASKS.md`).

## 0. Scope

- **Product:** customers (individuals and companies) book drivers; drivers register, complete KYC
  and take trips; vendors bring their own drivers; staff run onboarding, KYC, dispatch and
  accounts from one permission-driven console.
- **Apps:** `apps/mera-driver` (Angular 21 + Tailwind, port 4400, blue theme) and
  `apps/mera-driver-api` (Express + Prisma + PostgreSQL, port 3334, routes at root).
- **Module order** (same in every mera-driver doc): 1 Administration, 2 Customers, 3 Drivers,
  4 KYC and verification, 5 Bookings and trips, 6 Vehicles, 7 Accounts, 8 Partners (vendors and
  companies), 9 Support and content, 10 Masters, 11 Platform, security and release.

## 1. Administration

### 1.1 Roles (final list: 9 internal, 2 external)

| Category | Role | Key | Responsibility |
|---|---|---|---|
| Internal | Super Admin | `super_admin` | Full platform control |
| Internal | Admin | `admin` | Daily operations, KYC assignment and final approval, dispatch, accounts |
| Internal | Vendor | `vendor` | Linked vendor drivers, vehicles and bookings |
| Internal | Marketing | `marketing` | Own or assigned campaigns, leads and content |
| Internal | Sales | `sales` | Assigned customers and bookings; limited driver view |
| Internal | Company | `company` | Verified company profile, bookings and fleet; limited driver view |
| Internal | Data Operator | `data_operator` | Assigned driver and customer onboarding, document entry |
| Internal | Support | `support` | Assigned support cases and related summaries |
| Internal | KYC Verification | `kyc_verification` | Assigned KYC review and DL verification |
| External | Customer | `customer` | Own profile, bookings, payments and support |
| External | Driver | `driver` | Own profile, KYC, documents, assigned trips and earnings |

The seed also has `contributor` and `sales_marketing`. They are not part of this matrix; existing
rows stay (never deleted automatically) until the owner decides (decision M-D2).

### 1.2 Permission matrix (final)

V view, C create, E edit, D delete (only safe draft or unreferenced configuration), L limited view
(approved operational fields only, never private KYC or bank details), - no default access. Scope
is separate from permission: All, Assigned, Own, Vendor-linked, Company-linked.

| Module | Super Admin | Admin | Vendor | Marketing | Sales | Company | Data Operator | Support | KYC Verification | Customer | Driver |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard | V | V | V | V | V | V | V | V | V | V | V |
| Customers | VCE | VCE | VE | V | VCE | V | VCE | V | - | V | - |
| Drivers | VCE | VCE | VCE | - | V | V | VCE | V | - | - | V |
| KYC and verification | VCE | VCE | VE | - | - | - | VE | - | VE | - | V |
| Bookings | VCE | VCE | VE | - | VCE | VCE | - | V | - | VCE | V |
| Dispatch and assignment | V | V | V | - | V | V | - | V | - | - | V |
| Trips | VE | VE | VE | - | V | V | - | V | - | V | VE |
| Vehicles | VCE | VCE | VCE | - | V | VCE | VCE | - | - | - | V |
| Accounts overview | V | V | - | - | - | - | - | - | - | - | - |
| Registration fee records | VC | VC | V | - | V | - | V | V | - | V | V |
| Booking payment records | VC | VC | V | - | V | V | - | V | - | V | V |
| Driver payouts | VC | VC | - | - | - | - | - | - | - | - | V |
| Refund, recovery, adjustment | VC | VC | - | - | - | - | - | - | - | - | - |
| Accounts reports | V | V | - | - | - | - | - | - | - | - | - |
| Driver masters, trip types, cancellation reasons | VCED | VCED | V | - | V | V | V | - | V | - | - |
| Promotions and campaign content | VCED | VCED | - | VCE | - | - | - | - | - | - | - |
| FAQs and permitted content | VCED | VCED | V | VCE | V | V | V | V | - | V | V |
| Own profile | VE | VE | VE | VE | VE | VE | VE | VE | VE | VE | VE |

Administration (role management, staff users, audit logs, system settings): Super Admin VCE on
roles and VE on settings; Admin VCE on staff users and V on audit logs; nobody else. Admin cannot
raise their own privilege. Bookings, document versions, KYC decisions, audit logs and ledger
entries are never hard-deleted, even by Super Admin.

Customer and Driver use their own portals (`/customer/*`, `/driver/*`), gated by ownership, not by
console permissions.

### 1.3 Special actions (separate from CRUD)

| Action | Super Admin | Admin | Others by default |
|---|---|---|---|
| Assign or reassign KYC reviewer | yes | yes | no |
| KYC checklist Pass / Issue | yes | yes | KYC Verification: assigned only |
| Verify DL / retry | yes | yes | KYC Verification: assigned only |
| Final human KYC approval | yes | yes | no (never Data Operator or the verifier) |
| Create or link Driver User / Customer User | yes | yes | no |
| Driver master status change | yes | yes, with reason | no |
| Login suspend / reactivate | yes | yes | no |
| Assign driver to booking | yes | yes | Sales: only if granted, assigned bookings only |
| Staff booking cancellation | yes | yes, with reason | Sales and Support: request only |
| Record actual settlement or collection | yes | yes | no |
| Refund, payout, waiver, recovery | yes | yes | no |
| Pricing, fee or commission change | yes | yes, audited | no |
| Staff driver resume PDF | yes | yes | no |
| Full internal driver report, bulk export | yes | yes | no |
| Accounts export | yes | yes | no |
| Publish campaign or content | yes | yes | Marketing: optional grant |
| Change role permissions | yes | no by default | no |

### 1.4 Default access behaviour

- Reuse the persisted role ids and keys; never create duplicates or rename silently.
- Apply the matrix to existing roles through one reviewed, versioned update; never overwrite saved
  custom grants. Normal seeding only adds missing baseline rows.
- New modules are off by default for ordinary roles. "Restore defaults" is an explicit action.
- Permission changes are audited (actor, role, added and removed actions, scope, reason) and
  invalidate cached authorization.
- Effective access for ordinary users: active account → union of role grants → per-user allow or
  deny (`UserPermissionOverride`, a deny wins) → module permission → ownership or assignment →
  allowed fields → workflow validation.
- Role Management UI: role list with responsibility, scope summary, grouped modules, four-column
  matrix, labelled Special Actions, change summary ("2 added, 1 removed; affects 4 users"),
  restore defaults with confirmation. Super Admin's matrix is read-only; the last Super Admin
  cannot be removed.

## 2. Customers

- Individual (`customerType`) customers are admin-managed records with optional portal login
  (`Customer.userId`, link, unlink, create-user). Customer portal: dashboard, profile, bookings.
- A customer never sees DL numbers, DOB, full address, private documents, raw provider results or
  bank details of drivers.

## 3. Drivers

- Direct driver journey: register (onboarding wizard: personal, education and health, documents,
  payment) → KYC documents → KYC review → approval → optional Driver User (login) → driver portal.
- `Driver.status` (KYC stage), `onboardingStatus` and `accountStatus` (portal login gate) are three
  separate states.
- Vendor drivers are the same `Driver` record with `sourceType = VENDOR` and a `vendorId`, never a
  second entity or form (proposed, section 8).

## 4. KYC and verification

One business module with four stages: onboarding and documents; review and assignment; DL
verification; final KYC decision.

| Role | KYC access |
|---|---|
| Super Admin, Admin | full |
| KYC Verification | assigned drivers only: review and Verify DL |
| Data Operator | assigned onboarding and documents; no final approval |
| Vendor | permitted linked-driver onboarding documents only |
| Driver | own KYC status and documents only |
| Others, Customer | none |

- Generic driver edit never implies final KYC approval; if one endpoint couples them, separate the
  authorization.
- DL verification success, final human KYC approval, Driver User creation, registration fee,
  master driver status, login status and trip readiness are separate states; one action never
  marks the others.
- Explicit Verify DL needs no consent, OTP or linked login (agreed 5 October 2026). A name mismatch
  is a visible review issue, never an automatic identity match.
- Reassigning a driver removes the previous verifier's access immediately.

## 5. Bookings and trips

- Public "Want a driver" flow `/ride/*` (home, location, options, drivers, verify, payment,
  confirmed) exists as UI; it is not yet backed by a real requirement record.
- Proposed target: requirement form → `Requirement` (New) → assigned to Sales, Marketing or
  Operations → driver matching → `Assignment` (driver to customer, company or requirement) →
  customer or company sees the assigned driver. Source (`sourceType`, `vendorId`) never changes when
  the assignment changes; assignments are append-only history.
- Cancel, accept, pay and download are special workflow actions, not generic edit.

## 6. Vehicles

Vehicles are managed by Admin, Vendor, Company and Data Operator per the matrix; vehicle types are
masters.

## 7. Accounts

Registration fees, booking payments, driver payouts, refunds and recoveries. A draft "Paid" entry is
not a ledger payment; actual collection needs the audited confirmation. Admin edit never marks an
online payment paid. Payments and reports are stubs today.

## 8. Partners (vendors and companies)

Proposed (not modelled yet): `Vendor` (+ documents, `/vendor/*` portal), `Company` and
`CompanyUser` (`/company/*` portal), each scoped server-side by `vendorId` or `companyId`, never by
a client-supplied id.

## 9. Support and content

Support cases and feedback, FAQs and promotions. Support sees only assigned cases and related
operational summaries.

## 10. Masters

Driver types, education, eye vision, personal, health and police document types, source types,
statuses, languages, vehicle types and service zones. `D` only for unreferenced rows; used rows are
deactivated.

## 11. Platform, security and release

Mandatory backend rules: never trust a browser-supplied `userId`, `driverId`, `customerId`,
`vendorId` or `companyId`; resolve ownership and assignment on the server; apply the same scope to
list, search, detail, document, PDF and export endpoints; give limited roles restricted
projections, not the private driver details; permission removal works on the next request even
with an old token; protected history is never hard-deleted.

## 12. Decisions and open questions

| # | Question | Status |
|---|---|---|
| M-D1 | The drafts disagree on some cells (for example Vendor on Customers: `L` in the detailed draft, `VE` in the final matrix). This file uses `mera-driver-final.md` as the authority. | owner to confirm |
| M-D2 | Keep, merge or retire the seeded `contributor` and `sales_marketing` roles | open |
| M-D3 | Should `Requirement` accept both customer and company as requester? | open |
| M-D4 | KYC staff scoping: `assignedToUserId` everywhere, or "every verifier sees every driver" for now? (assignment for KYC review exists since 2026-09-16) | open |
| M-D5 | Is a Marketing campaign entity in scope, or is `sourceType = MARKETING` enough? | open |
| M-D6 | Should deactivating a vendor or company deactivate its drivers? | open |
| M-D7 | Does `Assignment` need a state machine beyond Active, Ended, Cancelled? | open |
| M-D8 | Retrofit real foreign keys on bookings, attendance and locations now or later? | open |
| M-D9 | Is a `sky-data-table` dashboard enough for vendors and companies? | open |
