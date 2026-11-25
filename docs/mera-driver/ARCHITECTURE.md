# mera-driver architecture

How mera-driver works in code (checked against the repository on 2026-10-17). Shared mechanics:
`docs/ARCHITECTURE.md`.

## 0. Structure and portals

```
apps/mera-driver/src/app/
  app.routes.ts      route table (lazy loadComponent)
  core/              auth service, guards, interceptor, API clients
  layouts/           public, rider (/ride/*), auth, admin, driver portal, customer portal
  admin/             sidebar (renders bootstrap.menu), console shell
  pages/             public pages, /ride/* booking UI, account/* console, driver/*, customer/*
apps/mera-driver-api/src/
  routes/, services/, middleware/, schemas/, openapi.ts   (pattern: docs/ARCHITECTURE.md §2.2)
```

| Portal | Routes | Gate |
|---|---|---|
| Public website | `/`, `/location`, blog, contact | none |
| Booking UI | `/ride/{location,options,drivers,verify,payment,confirmed}` | none yet (UI prototype, no backend requirement record) |
| Sign-in | `/sign-in`, `/otp`, `/forgot-password`, `/reset-password` | none |
| Staff console | `/account/*` | `authGuard` + `permissionGuard` per route; sidebar from `bootstrap.menu` |
| Driver portal | `/driver/{profile,kyc,documents,vehicle,trips,notifications,support}` | ownership (`bootstrap.driver`), not permissions |
| Customer portal | `/customer/{profile,bookings}` | ownership (`Customer.userId`) |

## 1. Administration

- Login methods: OTP (email or phone), Google, password (set, forgot, reset). A driver whose
  `accountStatus` is Inactive is refused at login.
- Permission resolution: JWT roles → `RolePermission` → `Permission`; `isSuperAdmin` resolves to
  every key from the live menu tree; `UserPermissionOverride` grants or revokes per user on top (no
  admin screen writes overrides yet); 30-second cache by role set.
- 13 seeded roles (`super_admin`, `admin`, `customer`, `vendor`, `marketing`, `sales`, `driver`,
  `company`, `contributor`, `sales_marketing`, `data_operator`, `support`, `kyc_verification`).
  The current seed grants are a narrow baseline (mostly `view`); applying the `PLANNING.md` §1.2
  matrix is task A-01.

## 2. Customers

Admin CRUD plus portal login linking (`create-user`, `link-user`, `unlink-user`, `customers:assign`)
and self-service `GET`/`PATCH /customers/me`, `GET /customers/me/bookings` (migration
`20260917085354_add_customer_self_service`).

## 3. Drivers

- Onboarding wizard: 4 tabs, 11 sub-steps (personal, education and health, documents, payment);
  progress derived on the server from saves (`completedSubSteps`), never trusted from the client.
- About 50 fields; documents in 4 categories (`DriverDocument`); admin-only fields (source type,
  KYC status, job type, experience, driver type, police verification, payment) vs fields the driver
  can edit through `PATCH /drivers/me`.
- Portal: `resolveOwnDriver` checks the linked driver on every `/drivers/me*` request, so a
  deactivation takes effect before the token expires.
- Attendance and driver locations are CRUD modules; they reference drivers by plain strings, not
  foreign keys (gap D-04).

## 4. KYC and verification

- KYC stage lives on `Driver.status` (Non-Verified, Partially Verified (P/K), Verified,
  Blacklisted, Closed, Not Useful), set through `PATCH /drivers/:id` (`drivers:edit`).
- Reviewer assignment and checklist (migration `20260916104135_add_kyc_assignment_and_checklist`):
  `PATCH /drivers/:id/assign-verifier` (`drivers:assign`), `GET /drivers/assigned-to-me`
  (`kyc-assignments:view`), `GET /drivers/assigned-to-me/:id` and `PATCH /drivers/:id/kyc-checklist`
  (ownership: `assignedVerifierId` must be the caller; no permission check by design).
- **Not in this repository:** a separate final KYC approval endpoint, driver details, resume and
  full-report export routes, and IDSPay DL verification, which the role specification describes
  from external reports. Tasks K-01, D-01, D-02 decide how they are added.

## 5. Bookings and trips

Trip types, bookings, driver locations, cancellation reasons and pricing (fare rules) are CRUD
modules under `/trips/*`. `Booking` links the customer by `customerId` but stores driver and vehicle
as names, not foreign keys (gap B-01). `GET /drivers/available` (`trips.bookings:view`) lists drivers for a booking.

## 6. Vehicles

`Vehicle` CRUD; `Vehicle.customerId` is a loose number, not a relation (gap V-01). Vehicle types
are a standalone masters table.

## 7. Accounts

`/payments` and `/reports` are permission-gated stub routers (`GET /` returns `[]`); the frontend
shows mock data.

## 8. Partners (vendors and companies)

Not modelled: no `Vendor`, `Company`, `Requirement` or `Assignment` tables, routes or pages. The
`vendor` and `company` roles exist in the seed. Proposed shape: `DATABASE.md` §8.

## 9. Support and content

Console pages for FAQs, feedback and promotions exist in the frontend menu; there are no matching
API modules yet.

## 10. Masters

`MasterListItem (category, name, status)` backs 8 lookup lists through `makeMasterListRouter`;
`VehicleType` and `ServiceZone` are separate tables.

## 11. Platform, security and release

- Every staff route uses `requirePermission`; portal routes use ownership middleware.
- OpenAPI: 149 mounted routes, 147 documented (`auth` and `health` missing).
- Dashboard widgets (`drivers-active`, `trips-today`, `payments-summary`) show placeholders; no
  metrics endpoint yet.
- Known cosmetic bug: menu nodes `pricing` and `attendance` share `order: 6`.

### Admin panel assessment (2026-11-23)

Live review: signed in with the **Admin** role at `/account/dashboard`. The dashboard displayed
driver/KYC and booking cards, quick actions, an attention area and recent-records area. The local
dataset returned zero counts and no records; this alone does not indicate missing functionality.
The visible sidebar included Dashboard, Drivers & KYC, Customers, Trips & Bookings, Accounts,
Reports, Masters, Administration and Settings.

| Area | Finding | Requirement / recommendation |
|---|---|---|
| Navigation and permissions | Vehicles, Promotions and FAQs were not visible in the Admin sidebar, despite Admin access in `PLANNING.md` §1.2. Role Management was visible and readable, while permission changes were disabled. | Reconcile baseline grants and the filtered menu with A-01. Role/permission management should remain Super Admin-only by default. |
| Dashboard | The operational summary and links loaded. Role Management offers dashboard-widget choices, but the dashboard service does not consume those choices. | Apply saved role widget choices, or remove the unused choices UI. |
| KYC | A final-approval endpoint exists and is audited, but it requires `drivers:edit` plus `drivers:assign` rather than a dedicated approval permission. | Implement the distinct final-approval permission in K-01; driver edit alone must never approve KYC. |
| Reports | The Reports page is visible, but uses local JSON and in-memory edits; the `/reports` API is a stub. | Implement real report data/generation and export before presenting this as a working report module. |
| FAQs, feedback, promotions | Screens exist, but edits are not persisted to a backend API. | Implement the required APIs and connect the screens (S-01). |
| Settings | The sidebar link opens a shared “module being built” placeholder. | Clarify and approve the settings scope before treating this as a working module. |
| Vendors, companies and request assignments | These entities and portals are not modelled; they are proposed in `PLANNING.md` §8 and related decisions M-D3, M-D6 and M-D9 remain open. | Do not treat these as committed features until the open decisions are resolved. |

**Keep out of the Admin role by default:** editing role permissions (Super Admin responsibility),
cross-app business data, customer/driver self-service accounts outside their own portals, and
hard-deleting bookings, KYC decisions, audit history or ledger entries.
