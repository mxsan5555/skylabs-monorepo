# Mera Driver — Business & Technical Architecture

**Status:** Documentation only. No application code, schema, or migration was changed to produce this document. Every claim below was verified by reading the actual files in `apps/mera-driver/` and `apps/mera-driver-api/` on 2026-09-16 — nothing here is guessed.

**Legend used throughout this document:**
- 🟢 **EXISTING** — built and working today, verified by reading the code.
- 🟡 **STUBBED** — a route/page exists but returns fake/static data, not real business logic.
- 🔴 **MISSING** — no model, route, service, or page exists at all today.
- 🔵 **PROPOSED** — this document's recommendation for what should be built next. Not implemented. Requires review/approval before any code is written.

---

## 1. Executive Summary

Mera Driver today is **two fully-built platform layers** (auth/RBAC, and a very complete Driver-onboarding-and-KYC module) sitting inside a **partially-built business layer**. Concretely:

- 🟢 The RBAC/authentication engine (13 roles, 16 permission actions, JWT + OTP/Google/password login, audit logging, impersonation) is production-grade and shared identically in shape with `msd-api`.
- 🟢 The **Driver** entity is the most mature business object in the system: a 4-tab, 11-sub-step onboarding wizard, ~50 fields, document uploads across 4 categories, a self-service portal gated by ownership (not permission), and — as of the most recent change — an Active/Inactive account-status gate enforced at login.
- 🟢 Customer, Vehicle, TripType, Booking, AttendanceRecord, and 10 Master-Data lookup tables are real, Prisma-backed, CRUD-complete modules with working admin-console pages.
- 🟡 Payments and Reports are **stub routes** (`makeStubRouter`) with mock JSON on the frontend — no real data model.
- 🔴 **Vendor, Company, Requirement, and Assignment do not exist anywhere in the codebase** — no Prisma model, no route, no service, no frontend page, no menu entry. These are exactly the four entities this document's requested actor model (Direct Driver vs Vendor Driver, Company self-service, driver-requirement-to-assignment flow) depends on.
- 🔴 Customer has no `userId` link to `User` — there is no customer self-service login today, only an admin-managed record.

This document inventories everything that exists field-by-field, then proposes (clearly marked 🔵) the entities, flows, and permission matrix needed to complete the business architecture described in the request. **Nothing proposed here should be implemented until this document is reviewed.**

---

## 2. Existing Application Analysis

### 2.1 Two independent stacks, per `CLAUDE.md`

| Layer | Stack | Port |
|---|---|---|
| `apps/mera-driver` | Angular 21 standalone + Tailwind | 4400 |
| `apps/mera-driver-api` | Express + TypeScript + Prisma + PostgreSQL (`mera_driver` DB) | 3334, routes mounted at root (no `/api/v1` prefix) |

Shared packages consumed: `shared-ui` (Material 3 web components), `shared-types` (RBAC types), `shared-permissions` (`can()`, `filterMenuByPermissions()`), `shared-menu` (static menu JSON — the *only* non-DB-driven piece of the RBAC model), `shared-auth` (`AuthProvider`/`AuthService`, guards).

### 2.2 What "RBAC is real, business logic is stubbed" (per CLAUDE.md) actually means today

That line in `CLAUDE.md` is **partially out of date** — several business modules have since become real (Driver, Vehicle, Booking, TripType, Attendance, Customer, Master Data). What remains genuinely stubbed is **Payments** and **Reports** only. See §20 for the authoritative existing/stubbed/missing table.

### 2.3 High-level current architecture (as built today)

```
                    PUBLIC WEBSITE (apps/mera-driver, PublicLayout)
                    home / blog / contact / location / showcase
                                  |
              +-------------------+-------------------+
              |                                       |
      /ride/* booking flow                    /sign-in, /otp
      (RiderLayout — UI exists,               (AuthLayout)
       NOT wired to a real                          |
       Customer/Requirement                         |
       backend yet — see §6)                         |
                                                       v
                                          POST /auth/otp/verify (or
                                          /auth/password/login,
                                          /auth/google/callback)
                                                       |
                                                       v
                                          GET /rbac/bootstrap
                                          { user, roles, permissions,
                                            menu, dashboardWidgets,
                                            preview?, driver? }
                                                       |
                    +----------------------------------+----------------------------------+
                    |                                                                       |
          bootstrap.driver != null                                          bootstrap.driver == null
                    |                                                                       |
                    v                                                                       v
        /driver/* — DriverLayout                                          /account/* — AdminLayout
        gated by driverPortalGuard                                        gated by permissionGuard per route,
        (ownership, not RBAC)                                             sidebar = bootstrap.menu (server-filtered)
                    |                                                                       |
        dashboard, profile, kyc,                                          dashboard, customers, drivers, vehicles,
        documents, support                                                trips (types/bookings/locations/
        + vehicle/trips/notifications                                     cancellation-reasons), pricing,
        ("coming soon" stubs)                                             attendance, payments*, promotions*,
                                                                            faqs, feedback, reports*, masters (11),
                                                                            administration (roles/users/audit-logs),
                                                                            settings
                                                                            (* = stubbed, see §20)
```

---

## 3. Existing Driver Form — Complete Field Inventory

This is the **source of truth**. Every field below already exists in `apps/mera-driver/src/app/pages/account/drivers/drivers.ts`/`.html` and/or `apps/mera-driver-api/prisma/schema.prisma`'s `Driver` model. No new Driver field is invented anywhere else in this document — where a business need calls for information not on this list (e.g., "Vendor ID"), it is proposed as an **addition** to this exact model, clearly marked 🔵, never as a duplicate field with a different name.

### 3.1 Onboarding wizard structure (🟢 EXISTING)

4 top-level tabs, 11 total nested sub-steps. Progress is derived server-side (`driver.service.ts`'s `deriveOnboardingFields`) from `completedSubSteps` — never trusted from the client beyond a `(stepCompleted, subStepCompleted)` pair per save.

| Tab | Sub-steps |
|---|---|
| 1. Personal Details (4 subs) | (0) Personal & Identity, (1) Contact & Address, (2) Physical & Demographics, (3) Account & Lead Info |
| 2. Education & Health Details (2 subs) | (0) Education & Training Profile, (1) Health & Medical Specifications |
| 3. Documents Details (3 subs) | (0) Driving License Details, (1) Police Verification & Employment, (2) Personal & Category Docs |
| 4. Payment Details (2 subs) | (0) Account Details, (1) Registration Fees |

### 3.2 Field inventory by tab

**Legend for "Editable by":** `D` = Driver (self, via `PATCH /drivers/me`), `A` = Admin/staff with `drivers:edit`, `S` = System-computed only.

**Tab 1 — Personal Details**

| Field | Type | Required | Master list | Editable by |
|---|---|---|---|---|
| `firstName` | text | **Yes** | — | D, A |
| `lastName` | text | No | — | D, A |
| `fatherName` | text | No | — | D, A |
| `motherName` | text | No | — | D, A |
| `gender` | select | **Yes** | `genders`: Male, Female, Other | D, A |
| `maritalStatus` | select | No | Unmarried, Married, Divorced, Widowed | D, A |
| `languages` | multi-select | No | Hindi, English, Bhojpuri, Other (+ `masters.languages` DB list) | D, A |
| `email` | email | **Yes** | — | D, A |
| `phone` | text | **Yes** | — | D, A |
| `emergencyNumber` | text | No | — | D, A |
| `state` | text | No | — | D, A |
| `pincode` | text | No | — | D, A |
| `address` | text | No | — | D, A |
| `dob` | date | No | — | D, A |
| `age` | text | No | — | D, A |
| `height` | text | No | — | D, A |
| `weight` | text | No | — | D, A |
| `religion` | select | No | Hindu, Muslim, Christian, Sikh, Buddhist, Jain, Parsi, Other | D, A |
| `color` (complexion) | select | No | Light Skin, Dark Skin | D, A |
| `sourceType` | select | No | WalkIn, Website, Referral | **A only** |
| `status` (KYC verification stage) | select | **Yes** | Non-Verified, Verified, Partially Verified (P), Partially Verified (K), Blacklisted, Closed, Not Useful | **A only** |
| `jobType` | select | No | Full time, Part Time | **A only** |
| `experience` | select | No | 1/2/3/4/5+ Year(s) | **A only** |
| `driverType` | multi-select | **Yes** (≥1) | Personal driver, Car Driver, Bike Rider, Ambulance Driver, Construction Vehicle Driver | **A only** |
| `country` | text (signal only) | No | — | D, A |
| `vehicle` | text (signal only) | No | — | D, A |
| `passportNumber` | text | No | — | D, A |

**Tab 2 — Education & Health**

| Field | Type | Required | Master list | Editable by |
|---|---|---|---|---|
| `trainingStatus` | select | No | Yes, No | D, A |
| `trainingCertificate` | text (shown if trainingStatus=Yes) | No | — | D, A |
| `eyeVision` | select | No | Normal Vision, Wear Glasses, Color Blind | D, A |
| `healthInsurance` | select | No | Yes, No | D, A |
| `bloodGroup` | select | No | O+/O-/A+/A-/B+/B-/AB+/AB- | D, A |
| `education` | select (unused in current template, sent in payload) | No | No Formal Education → PhD (8 levels) | D, A |
| Education documents | repeatable {type, regNo, file} | No | `educationDocTypes` (7 types — 10th/12th cert, diploma, degree, training cert, other) | D, A |

**Tab 3 — Documents**

| Field | Type | Required | Master list | Editable by |
|---|---|---|---|---|
| `licenseDetails` | select | No | HMV, HPMV, HTV, LMV, LMV-TR, MCWG, MCWOG, MGV, TRAILER | D, A |
| `dlNo` | text | **Yes** | — | D, A |
| `dlIssueDate` | date | No | — | D, A |
| `dlExpiryDate` | date | No | — | D, A |
| `vehicleType` | select (signal, not rendered in current template) | No | HUV, MUV, SUV, SEDAN, HATCHBACK | D, A |
| `policeVerifiedStatus` | select | No | Yes, No | **A only** |
| `policeVerifiedNo` | text (shown if Yes) | No | — | **A only** |
| Police documents | repeatable {type, regNo, file}, shown if verified=Yes | No | `policeDocTypes` (3 types) | **A only** |
| Personal/category documents | repeatable {type, regNo, file} | No | `documentCategoryOptions` (13 types — Aadhaar, PAN, RC, insurance, PCC, etc.) | D, A |
| `currentSalary` | text (signal, not rendered) | No | — | **A only** |
| `expectedSalary` | select (signal, not rendered) | No | 10000–15000 → 25000+ | **A only** |

**Tab 4 — Payment**

| Field | Type | Required | Master list | Editable by |
|---|---|---|---|---|
| `preferredPaymentMode` | select | No | Cash, Cheque, NEFT, RTGS, Online | **A only** |
| `amount` | text | No | — | **A only** |
| `paymentReceiptDate` | date | No | — | **A only** |
| `bankName` | text | No | — | D, A |
| `bankAccountNo` | text | No | — | D, A |
| `ifscCode` | text | No | — | D, A |
| `branchName` | text | No | — | D, A |
| `upiIdOrChequeNo` | text | No | — | D, A |

**System-controlled fields (S — never client-editable via any schema)**

| Field | Purpose |
|---|---|
| `verificationNotes` | Staff-set reason for KYC `status`; driver-portal read-only. Not in any Create/Update schema at all — no route sets it explicitly today (🟡 gap — see §32). |
| `accountStatus` | Portal login gate ('Active'/'Inactive'), independent of KYC `status`. Changed only via `PATCH /drivers/:id/status` (`drivers:status_change`). |
| `avatar` | Profile photo path. |
| `onboardingStatus`, `currentStep`, `currentSubStep`, `completedSteps`, `completedSubSteps`, `completionPercentage` | Derived server-side from wizard saves, never client-writable directly. |
| `userId` | Self-service portal linkage. Set/cleared only via admin `link-user`/`unlink-user`/`create-user` actions — never editable via the Driver form. |

### 3.3 Driver list table (admin console) — exact current configuration

**Visible columns (in order):** Image, First Name, Last Name, Email, Phone, Driver Type, Status (KYC badge), Account Status (Active/Inactive badge), Onboarding (progress label).
**Hidden-by-default columns** (togglable): Father/Mother Name, Emergency No, DOB, Marital Status, Gender, Passport No, Religion, Color, Language, Age, Height, Weight, Country, State, Pincode, Address, Vehicle Name, Education, Training Status/Cert, Eye Vision, Health Insurance, Blood Group, License Details, Vehicle Type, DL No/Issue/Expiry, Police Verified Status/No, Job Type, Experience, Current/Expected Salary, Preferred Payment Mode, Amount, Bank Name/Account/IFSC, UPI/Cheque, Portal Account (linked user label).
**Row actions:** Preview/View Resume, Download PDF, View Details, Edit, Driver User Account (link/unlink/create portal login), Activate/Deactivate, Delete.
**Filter:** by KYC `status` only (not `accountStatus`).

---

## 4. Existing Database Schema — Complete Inventory

All 24 models currently in `apps/mera-driver-api/prisma/schema.prisma`, grouped by domain. (Full field-by-field detail for RBAC and Driver already given in §3 and the RBAC section below; this section is the complete map so nothing is missed.)

### 4.1 Enums

| Enum | Values |
|---|---|
| `UserStatus` | active, inactive, blocked |
| `PermissionAction` | view, create, edit, delete, export, import, approve, reject, upload, download, print, assign, restore, permanent_delete, status_change, custom |
| `OtpPurpose` | login, signup, change_phone, change_email, password_reset |
| `LoginMethod` | otp_email, otp_phone, google, password |

### 4.2 Identity / RBAC domain (🟢 EXISTING, fully built)

`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserPermissionOverride`, `DashboardWidget`, `RoleDashboardWidget`, `OtpChallenge`, `RefreshSession`, `AuditLog`, `LoginHistory`, `ImpersonationSession`.

Key design points:
- `User.status` (RBAC-level active/inactive/blocked) is **separate** from `Driver.accountStatus` (portal-login gate) — two independent status concepts on two different tables, joined only via `Driver.userId`.
- `Role.isSuperAdmin` is the **only** boolean that ever drives bypass logic anywhere in the app — never a `role.key === '...'` string check.
- `UserPermissionOverride` allows per-user grant/revoke on top of role-derived permissions (not currently exposed by any UI form for Driver/Vendor/Company scoping — see §32).

### 4.3 Business domain (mixed maturity)

| Model | Maturity | Notes |
|---|---|---|
| `Customer` | 🟢 EXISTING, admin-managed CRUD | **No `userId` → no self-service login exists.** No relation to `Booking`. |
| `Driver` | 🟢 EXISTING, most mature entity | Full field list in §3. |
| `DriverDocument` | 🟢 EXISTING | FK to Driver, cascade delete. |
| `Vehicle` | 🟢 EXISTING, real CRUD | `customerId Int?` is a **loose reference, not a Prisma `@relation`** — no FK constraint. |
| `AttendanceRecord` | 🟢 EXISTING, real CRUD | `driverId` is a **plain string, no `@relation` to Driver at all.** |
| `TripType` | 🟢 EXISTING, real CRUD | Simple lookup entity. |
| `Booking` | 🟢 EXISTING, real CRUD | `customerName`/`driverName`/`vehicleName` are **denormalized strings — zero FK relations to Customer, Driver, or Vehicle.** This is the single biggest existing-architecture gap relative to the Assignment model this document proposes (§14). |
| `DriverLocation` | 🟢 EXISTING, real CRUD | Also denormalized (`driverName` string, no FK). |
| `CancellationReason` | 🟢 EXISTING, real CRUD | Simple lookup. |
| `FareRule` | 🟢 EXISTING, real CRUD | References vehicle category/trip type/zone by **name string**, not FK. |
| `MasterListItem` | 🟢 EXISTING, real CRUD | Backs 8 lookup screens via `(category, name)`. |
| `VehicleType` | 🟢 EXISTING, real CRUD | Standalone (not folded into `MasterListItem`). |
| `ServiceZone` | 🟢 EXISTING, real CRUD | Standalone. |

### 4.4 Not modeled at all (🔴 MISSING)

**Vendor, Company, Requirement, Assignment, Payment, Report.** Zero trace in schema, routes, services, or frontend. §32 has the full existing/stubbed/missing matrix; §16–19 propose the missing entities.

---

## 5. Business Actors

| Actor | Status | Definition |
|---|---|---|
| **Public visitor** | 🟢 EXISTING (public site) | Anonymous user browsing `home`/`blog`/`location`/`contact`. |
| **Direct Driver** | 🟢 EXISTING | A person who registers as a Driver directly (source = WalkIn/Website/Referral today; see §6.2 for the DIRECT vs VENDOR distinction). |
| **Customer** | 🟡 PARTIAL | Record exists (admin-managed), but no login/self-service portal exists yet. |
| **Vendor / Driver Provider** | 🔴 MISSING | No model, no portal, no concept in the system today. Proposed in §9/§17. |
| **Company / Corporate Customer** | 🔴 MISSING | No model, no portal. Proposed in §10/§18. |
| **Internal Staff** (KYC, Sales, Marketing, Support, Data Operator) | 🟢 EXISTING as **roles** with real permission grants (§13.3) | The *role* and default permission grant exist; there is **no assignment-based data scoping** (e.g., "KYC staff sees only cases assigned to them") — today every role with `drivers:view` sees **every** Driver, full stop. This is a scope gap, not a missing role. See §29. |
| **Admin** | 🟢 EXISTING | Permission-driven role, seeded with a real baseline grant. |
| **Super Admin** | 🟢 EXISTING | `isSuperAdmin` flag, auto-granted every permission derived from the live menu tree. |

---

## 6. Public Website Flow

### 6.1 "Want a Driver" flow

**What exists today (🟢 EXISTING, UI only):** A full public booking UI already exists at `/ride/*` (`RiderLayout`): `home → location → options → drivers → verify → payment → confirmed`. This is **visually** the "Want a Driver" journey, but it is **not wired to a real backend Requirement/Lead flow** — the closest backing entity is `Booking`, which has no FK to `Customer` or `Driver` (denormalized name strings only, per §4.3). There is also a TODO comment in the route file itself: *"guard 'verify'/'payment' with authGuard once mera-driver auth API lands"* — confirming this flow is intentionally unauthenticated/prototype-stage today.

**Diagram (current, as built):**

```
Public Website
      |
      v
  /ride/home  →  /ride/location  →  /ride/options  →  /ride/drivers
      |                                                     |
      v                                                     v
/ride/verify  ←──────────────────────────────────  (driver selection UI)
      |
      v
/ride/payment
      |
      v
/ride/confirmed
```

No `authGuard` today (except the TODO above), no `Requirement` record created, no Sales/Marketing/Operations assignment step exists on the backend.

### 6.2 🔵 PROPOSED target flow (requires the new `Requirement`/`Assignment` entities from §14/§16)

```
Public Website
      |
      v
"Want a Driver" — Customer/Company requirement form
      |
      v
Requirement record created (status: New)
      |
      v
Lead queue → assigned to Sales/Marketing/Operations (UserRole-scoped)
      |
      v
Driver matching (staff searches Driver by driverType/vehicleType/ServiceZone/availability)
      |
      v
Assignment record created (Driver ↔ Requirement, or Driver ↔ Company)
      |
      v
Customer/Company sees the assigned driver in their own portal
```

**Proposed "Want a Driver" form fields** — built from what already exists on `Customer` + booking UI fields observed in `/ride/*`, not invented from scratch:

| Field | Source |
|---|---|
| `firstName`, `lastName`, `mobileNumber`, `email` | Existing `Customer` fields |
| `addressLine1/2`, `pincode`, `stateId`, `cityId` | Existing `Customer` fields |
| `customerType` (Individual/Corporate) | Existing `Customer` field — this is the exact fork point: Corporate → routes to a Company record instead of/in addition to Customer |
| Pickup/drop location, trip type, scheduled date | Existing `Booking` fields (`pickupAddress`, `dropAddress`, `tripTypeName`, `scheduledAt`) |
| `driverType` needed | Existing `Driver.driverType` vocabulary — reused, not duplicated |
| `registrationSource` | Existing `Customer` field (Website/App/Admin/Referral) |

---

## 7. Customer Flow

**🟡 PARTIAL.** `Customer` is a real, admin-managed Prisma model and CRUD module (`customers.routes.ts`, `customer.service.ts`, `pages/account/customers/`), but:

- 🔴 No `Customer.userId` → `User` link exists (unlike `Driver.userId`). A customer **cannot log in** today.
- 🔴 No relation from `Customer` to `Booking`/`Requirement` — a customer's booking history cannot be queried by customer id, only by matching the denormalized `customerName` string.
- 🔴 No Customer self-service portal pages exist (nothing analogous to `/driver/*`).

```
CURRENT STATE:
Admin console → Customers page → CRUD on Customer records
(no customer-facing login, no customer-facing dashboard)
```

🔵 **Proposed** (mirrors the exact Driver self-service pattern already proven in production):

```
Customer registers/logs in (OTP, same auth.routes.ts flow already built)
      |
      v
Customer.userId set (mirrors Driver.userId — same link/unlink/create-user
admin actions already built for Driver, reused for Customer)
      |
      v
resolveOwnCustomer middleware (mirrors resolveOwnDriver exactly)
      |
      v
/customer/* portal (mirrors /driver/* — dashboard, profile, requirements, assigned driver)
gated by customerPortalGuard (mirrors driverPortalGuard exactly)
```

This is a **pattern-reuse** proposal, not a new pattern — every piece named above already exists for Driver and would be duplicated, not redesigned.

---

## 8. Direct Driver Flow (🟢 EXISTING, fully built)

```
Public Website
      |
      v
Become a Driver → Driver Registration (existing onboarding wizard, §3)
      |
      v
Driver Profile (Driver.sourceType = 'Website' or 'WalkIn' or 'Referral')
      |
      v
KYC Documents (DriverDocument, 4 categories)
      |
      v
KYC Verification (staff sets Driver.status via PATCH /drivers/:id, drivers:edit)
      |
      v
Approval (Driver.status = 'Verified')
      |
      v
Driver User Account (admin action: link-user / unlink-user / create-user)
      |
      v
Driver Login (OTP/password/Google — auth.routes.ts, blocked if accountStatus='Inactive')
      |
      v
Driver Dashboard (/driver/dashboard — real page, calls GET /drivers/me)
```

This entire flow is real and working end-to-end today, including the account-status login gate added most recently.

---

## 9. Vendor Flow (🔴 MISSING — fully proposed)

Nothing exists for Vendor anywhere in the codebase. §17 has the proposed schema; this section is the proposed flow only.

```
🔵 PROPOSED:
Vendor registers/onboards (admin-created, or public "Become a Vendor Partner" form)
      |
      v
Vendor Profile + Vendor User account (mirrors Driver's user-linkage pattern)
      |
      v
Vendor Dashboard → "Add Driver"
      |
      v
Driver Profile created with:
   Driver.sourceType = 'VENDOR'   (🔵 new enum value — see §16)
   Driver.vendorId = <this vendor's id>   (🔵 new FK field on Driver)
      |
      v
Same KYC/Verification/Portal-login pipeline as Direct Driver (§8) — NOT a
separate pipeline. A Vendor Driver goes through identical KYC.
      |
      v
Vendor sees only its own drivers (data-scoped by vendorId, enforced server-side)
```

**Critical distinction requested explicitly by the business requirement:** DIRECT and VENDOR drivers must **not** be modeled as two different entities or two different forms — they are the *same* `Driver` record, differentiated only by `sourceType` + an optional `vendorId`. This avoids exactly the kind of duplicate-form/duplicate-schema mistake the request warns against.

---

## 10. Company Flow (🔴 MISSING — fully proposed)

```
🔵 PROPOSED:
Company registers (admin-created, or a self-service "Company Partner" signup)
      |
      v
Company Admin (first CompanyUser, role scoped to that company)
      |
      v
Company Staff (additional CompanyUsers under the same company)
      |
      v
Driver Requirements (Requirement records with companyId set)
      |
      v
Assigned Drivers (Assignment records: Driver ↔ Company, or Driver ↔ Requirement)
      |
      v
Company Dashboard shows ONLY that company's requirements + assigned drivers
(enforced server-side by companyId scoping, never a frontend-only filter)
```

---

## 11. Internal Staff Flow

🟢 **Roles exist and are permission-scoped today** (KYC Verification, Sales, Marketing, Support, Data Operator, Contributor, Sales/Marketing combined — see full grant table in §13.3). 🔴 **What does not exist:** assignment-based *record-level* scoping. Today, `kyc_verification` role holds `drivers:[view,edit]` — meaning **every** KYC staff member sees **every** Driver, not just ones "assigned" to them. There is no `assignedTo` field on Driver, no KYC-case queue, no lead-assignment table.

```
CURRENT STATE (real):
Staff Login → Permission Evaluation (role → permission join)
      |
      +-- KYC staff:     drivers:[view, edit]           → sees ALL drivers
      +-- Sales:         trips, payments, reports:[view] → sees ALL of these
      +-- Marketing:     dashboard, reports, settings:[view]
      +-- Support:       customers, drivers, attendance:[view] → sees ALL
      +-- Data Operator: drivers, vehicles:[view,create,edit], all masters
```

```
🔵 PROPOSED (adds record-level scoping without touching the permission model):
Staff Login → Permission Evaluation (unchanged)
      |
      v
Data Scope Filter (NEW — applied inside each service function, e.g.
listDrivers() filters by assignedTo=currentUserId when the caller's role
is flagged "scoped" vs "unscoped")
      |
      +-- KYC staff:   sees only Drivers where KycCase.assignedToUserId = self
      +-- Sales:       sees only Requirements/Leads where assignedToUserId = self
      +-- Marketing:   sees only leads sourced from their own campaigns
```

This requires a new `assignedToUserId` concept — see §14 (Assignment Architecture) and §19 (KYC Architecture).

---

## 12. Authentication Architecture (🟢 EXISTING, fully built)

```
                 LOGIN
                   |
    +--------------+--------------+
    |              |              |
POST /auth/otp/verify   GET /auth/google/callback   POST /auth/password/login
    |              |              |
    +--------------+--------------+
                   |
      assertDriverAccountActive(user.id)   <- blocks a deactivated
                   |                          Driver's login even with
                   v                          correct credentials
        issueTokenPair() — JWT access
        (15 min) + opaque refresh (30 day,
        rotated, replay-detected)
                   |
                   v
        GET /rbac/bootstrap
        { user, roles, permissions[], menu[],
          dashboardWidgets[], preview?, driver? }
                   |
        +----------+----------+
        |                     |
  driver != null        driver == null
        |                     |
 /driver/* portal      /account/* console
 (driverPortalGuard,   (permissionGuard per
  ownership-based)      route, sidebar =
                         bootstrap.menu)
```

Key mechanisms already built:
- **Ownership vs Permission**: two entirely separate authorization mechanisms coexist. `resolveOwnDriver`/`driverPortalGuard` check "does this JWT's user have a linked Driver row" — never a permission key. `requirePermission`/`permissionGuard` check "does this JWT's roles resolve to `menuKey:action`" — never ownership.
- **Per-request re-check**: `resolveOwnDriver` hits the DB on every `/drivers/me*` call specifically so a live deactivation (or, proposed, a live unassignment) takes effect before the JWT naturally expires — not just at login.
- **SuperAdmin bypass**: computed live from the menu tree (`allPermissionKeysForMenu`), never dependent on what's actually stored in `RolePermission` — a brand-new menu node is automatically visible to SuperAdmin with zero seed/migration step.
- **Per-user overrides**: `UserPermissionOverride` (grant/revoke) layers on top of role-derived permissions — exists in the schema and permission-resolution code, but **no admin UI screen writes to it today** (🟡 gap, flagged in §32).

---

## 13. RBAC Architecture (🟢 EXISTING, fully built)

### 13.1 Permission model

A permission is `${menuKey}:${action}`. 16 possible actions (`PermissionAction` enum, §4.1). `menuKey` comes from the static `shared-menu` JSON (§26) — the one non-DB-driven piece, by original design.

### 13.2 Seeded roles (13, all `isSystem: true`)

| Role key | isSuperAdmin |
|---|---|
| `super_admin` | **true** |
| `admin` | false |
| `customer` | false |
| `vendor` | false |
| `marketing` | false |
| `sales` | false |
| `driver` | false |
| `company` | false |
| `contributor` | false |
| `sales_marketing` | false |
| `data_operator` | false |
| `support` | false |
| `kyc_verification` | false |

**Note:** `vendor` and `company` roles **already exist as RBAC role rows**, even though the Vendor/Company business entities do not exist yet (§4.4, §5). This is a meaningful head start — the identity/permission scaffolding for these two actor types is seeded and ready; only the business entity + portal + data-scoping remain to be built.

### 13.3 Default permission grants (exact, from `seed.ts`)

| Role | Grants |
|---|---|
| `admin` | `view` on: dashboard, customers, drivers, vehicles, trips, attendance, payments, reports, masters (+2 sub), administration, rbac.roles, rbac.users, rbac.audit-logs, settings — **plus** `drivers:status_change` |
| `marketing` | `view` on: dashboard, reports, settings |
| `sales` | `view` on: dashboard, trips, payments, reports, settings |
| `vendor` | `view` on: dashboard, drivers, vehicles, trips |
| `customer` | `view` on: dashboard |
| `driver` | `view` on `masters.languages` only — portal access is ownership-based, not permission-based |
| `company` | `view` on dashboard; `[view,create,edit]` on vehicles; `view` on drivers, trips.bookings, reports |
| `contributor` | `view` on dashboard; `[view,create,edit]` on customers; `view` on all masters |
| `sales_marketing` | `view` on dashboard; `[view,create,edit]` on customers; `view` on trips.pricing, reports |
| `data_operator` | `view` on dashboard; `[view,create,edit]` on drivers, vehicles; `[view,create,edit]` on all masters |
| `support` | `view` on dashboard, customers, drivers, attendance |
| `kyc_verification` | `view` on dashboard; `[view,edit]` on drivers |

Note the existing `vendor` and `company` role grants above (`view` on drivers/vehicles/trips for vendor; `view/create/edit` on vehicles + `view` on drivers for company) were seeded **in anticipation of** these portals — they are currently unused because no Vendor/Company user can exist without the entities proposed in §17/§18.

### 13.4 Permission resolution algorithm

`requirePermission(menuKey, action)` → `resolveEffectivePermissionsForUser(sub, roles)`:
1. Join `Role → RolePermission → Permission` for the JWT's `roles` claim (trusted directly, not re-fetched from `UserRole` per request — roles are baked into the JWT at login).
2. If any matched role has `isSuperAdmin=true`, return every permission key derivable from the live menu tree (bypasses the stored `RolePermission` rows entirely).
3. Layer `UserPermissionOverride` grants/revokes on top (skipped entirely for a SuperAdmin holder).
4. Cache 30s in-memory, keyed by sorted role-key set.

---

## 14. Assignment Architecture (🔴 MISSING — fully proposed)

This is the most structurally important missing piece. Today, `Booking`/`AttendanceRecord`/`DriverLocation`/`FareRule` all reference other entities by **denormalized name strings**, not foreign keys (§4.3) — there is currently no way to query "every Booking for Driver X" at the database level, only by string-matching a name.

### 14.1 🔵 Proposed `Assignment` entity

```prisma
model Assignment {
  id            String   @id @default(uuid())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  driverId      String
  driver        Driver   @relation(fields: [driverId], references: [id])

  // Exactly one of these is set — the assignment target.
  companyId     String?
  customerId    String?
  requirementId String?

  status        String   @default("Active") // Active | Ended | Cancelled
  assignedBy    String   // userId of the staff member who made the assignment
  assignedAt    DateTime @default(now())
  endedAt       DateTime?
  notes         String?

  @@index([driverId])
  @@index([companyId])
  @@index([customerId])
  @@index([requirementId])
}
```

### 14.2 Source vs current assignment — the critical distinction the request calls out explicitly

`Driver.sourceType` + proposed `Driver.vendorId` = **where the driver came from** (immutable after creation, except by explicit staff correction). `Assignment` = **where the driver is currently deployed** (changes over time, one Driver can have many Assignment rows over its lifetime, but at most one `status='Active'` assignment at a time per business rule).

```
Example:
Driver "Ramesh"
  sourceType = VENDOR
  vendorId   = "vendor-abc-id"        <- never changes once set

  Assignment #1: companyId="company-xyz", status=Ended,   2026-01 to 2026-06
  Assignment #2: companyId="company-pqr", status=Active,  2026-07 to present
                                                            <- current, mutable
```

The `Assignment` table is append-only history, never overwritten — this is exactly what the request means by "Do NOT overwrite the source when assignment changes."

### 14.3 Assignment types (all use the same table, differentiated by which FK is set)

| Assignment | Who can create it | Permission (proposed) |
|---|---|---|
| Driver → Company | Admin, Operations | `assignments:create` |
| Driver → Customer | Admin, Sales, Operations | `assignments:create` |
| Requirement → Sales/Marketing (lead assignment) | Admin | 🔵 new `RequirementAssignment` join, or reuse `Assignment` with a `requirementId` + `assignedToUserId` |
| KYC Case → KYC Staff | Admin | 🔵 see §19, proposed `KycCase.assignedToUserId` |
| Support Case → Support User | Admin, Support Lead | 🔵 proposed `SupportCase.assignedToUserId` |

---

## 15. KYC Architecture

See full detail in §19 — cross-referenced here per the requested outline. Summary: today KYC is folded directly into `Driver.status` + `DriverDocument` (🟢 EXISTING, no separate "KYC Case" entity). §19 proposes an optional `KycCase` entity **only if** assignment-based KYC-queue scoping (§11) is wanted — otherwise the current model is sufficient and should not be changed.

---

## 16. Driver Lifecycle (🟢 EXISTING + 🔵 proposed additions)

```
🟢 EXISTING (Driver.status, KYC stage):
Non-Verified → Partially Verified (P/K) → Verified
                                        ↘ Blacklisted / Closed / Not Useful

🟢 EXISTING (Driver.onboardingStatus):
in_progress → completed

🟢 EXISTING (Driver.accountStatus, portal login gate):
Active ⇄ Inactive   (toggle via PATCH /drivers/:id/status, drivers:status_change)
```

🔵 **Proposed additions to the Driver model** (extending, never duplicating, §3's field list):

| New field | Type | Purpose |
|---|---|---|
| `vendorId` | String? (FK to proposed Vendor) | Set only if `sourceType='VENDOR'` |
| `sourceType` enum expansion | Add `VENDOR`, `MARKETING`, `OTHER` to the existing `WalkIn/Website/Referral` string vocabulary (currently a free-form string, not a DB enum — per the schema's own comment, "meant to become Masters-table-driven later") |
| `currentAssignmentId` | String? (denormalized pointer to the currently-Active `Assignment`, for fast dashboard queries) | Optional — could also just query `Assignment where status=Active`, this is a read-optimization, not a requirement |

---

## 17. Vendor Lifecycle (🔴 MISSING — fully proposed)

### 17.1 Proposed `Vendor` entity

```prisma
model Vendor {
  id             String   @id @default(uuid())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  userId         String?  @unique   // mirrors Driver.userId exactly
  user           User?    @relation(fields: [userId], references: [id])

  businessName   String
  contactName    String
  email          String?
  phone          String?
  addressLine1   String?
  addressLine2   String?
  stateId        Int?
  cityId         Int?
  pincode        String?
  gstNumber      String?
  panNumber      String?

  verificationStatus String @default("Pending")  // mirrors Customer.verificationStatus pattern
  accountStatus      String @default("Active")   // mirrors Driver.accountStatus pattern exactly

  notes          String?

  drivers        Driver[]           // one Vendor -> many Driver (via Driver.vendorId)

  @@index([verificationStatus])
  @@index([accountStatus])
}

model VendorDocument {
  id         String   @id @default(uuid())
  createdAt  DateTime @default(now())
  vendorId   String
  vendor     Vendor   @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  type       String   // e.g. GST Certificate, Business PAN, Trade License
  fileName   String?
  filePath   String?
  @@index([vendorId])
}
```

This deliberately **mirrors the exact Driver/DriverDocument/Customer pattern already proven in this codebase** (`userId` linkage, `accountStatus` gate, verification status, document sub-table) rather than inventing a new shape.

### 17.2 Vendor lifecycle

```
🔵 PROPOSED:
Vendor Profile created (admin or self-service signup)
      |
      v
Vendor Documents uploaded (GST, PAN, trade license)
      |
      v
Vendor Verification (admin sets verificationStatus)
      |
      v
Vendor User Account created (mirrors createAndLinkDriverUser exactly)
      |
      v
Vendor Login → Vendor Dashboard (mirrors /driver/* pattern: /vendor/*, gated by
a new vendorPortalGuard checking bootstrap.vendor != null, mirroring
driverPortalGuard's bootstrap.driver != null check exactly)
      |
      v
Vendor adds Drivers (Driver.vendorId = this vendor, sourceType='VENDOR')
      |
      v
Vendor accountStatus can be deactivated (mirrors Driver's assertVendorAccountActive
at login + a resolveOwnVendor per-request check — same enforcement pattern as
Driver's accountStatus, applied to a second entity)
```

### 17.3 Vendor Dashboard (🔵 proposed UI, using existing `sky-data-table` component — no new component)

```
+--------------------------------------------------+
| VENDOR DASHBOARD                                  |
+--------------------------------------------------+
| Total Drivers | Active | Pending KYC | Assigned  |
+--------------------------------------------------+

| Drivers (own only, filtered server-side by vendorId)          |
+--------+--------+--------+------------+------------------------+
| Driver | Status | KYC    | Assignment | Actions (View, Edit*)  |
+--------+--------+--------+------------+------------------------+
```
`*` Vendor edits its own drivers through the *existing* Driver form (§3) — reused, not rebuilt — scoped to `vendorId = self`.

---

## 18. Company Lifecycle (🔴 MISSING — fully proposed)

### 18.1 Proposed `Company` + `CompanyUser` entities

```prisma
model Company {
  id                String   @id @default(uuid())
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  legalName         String
  displayName       String?
  gstNumber         String?
  panNumber         String?
  registeredAddress String?
  billingAddress    String?
  stateId           Int?
  cityId            Int?
  pincode           String?

  primaryContactName  String?
  primaryContactPhone String?
  primaryContactEmail String?

  accountStatus     String   @default("Active")   // mirrors Driver/Vendor pattern
  verificationStatus String  @default("Pending")

  notes             String?

  users             CompanyUser[]
  requirements      Requirement[]

  @@index([accountStatus])
}

model CompanyUser {
  id         String   @id @default(uuid())
  createdAt  DateTime @default(now())

  companyId  String
  company    Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  userId     String   @unique   // one User = one CompanyUser (like Driver.userId)
  user       User     @relation(fields: [userId], references: [id])

  isCompanyAdmin Boolean @default(false)   // first user = admin; can add CompanyStaff

  @@index([companyId])
}
```

**Note on identity separation**, directly answering §20 of the request: one `User` row represents **one** login identity. A `User` can be linked to **at most one** of `Driver.userId` / `Vendor.userId` / `CompanyUser.userId` at a time in practice (nothing in the schema technically prevents overlap, but no UI flow would ever create it) — identity (`User`) and business profile (`Driver`/`Vendor`/`Company`) are deliberately separate tables, exactly the pattern already proven by `Driver.userId`.

### 18.2 Company lifecycle

```
🔵 PROPOSED:
Company Profile created (admin onboarding, or self-service "Corporate Partner" signup)
      |
      v
Company Admin (first CompanyUser, isCompanyAdmin=true)
      |
      v
Company Staff (additional CompanyUsers, isCompanyAdmin=false)
      |
      v
Driver Requirements (Requirement.companyId set — §19)
      |
      v
Assigned Drivers (Assignment.companyId set — §14)
      |
      v
Company Dashboard — ALL queries filtered server-side by companyId = caller's
CompanyUser.companyId (never trust a client-supplied companyId, exactly the
`resolveOwnDriver` "never from a route param/body" pattern)
```

### 18.3 Company Dashboard (🔵 proposed)

```
+--------------------------------------------------+
| COMPANY DASHBOARD                                 |
+--------------------------------------------------+
| Requirements | Assigned Drivers | Active Drivers |
+--------------------------------------------------+

| Driver Requirements (own company only)                        |
+-------------+----------+----------+--------+
| Requirement | Location | Quantity | Status |
+-------------+----------+----------+--------+
```

---

## 19. Requirement Lifecycle (🔴 MISSING — fully proposed)

### 19.1 Proposed `Requirement` entity

```prisma
model Requirement {
  id              String   @id @default(uuid())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Exactly one of these two is set — who is requesting.
  customerId      String?
  companyId       String?

  driverTypeNeeded String?     // reuses Driver.driverType vocabulary — not duplicated
  vehicleTypeNeeded String?    // reuses VehicleType — not duplicated
  location         String?
  serviceZoneId    Int?        // reuses ServiceZone — not duplicated
  quantity         Int         @default(1)
  neededFrom       DateTime?
  neededUntil      DateTime?

  status          String   @default("New")  // New | Assigned | Fulfilled | Cancelled
  assignedToUserId String?    // Sales/Marketing/Operations staff working this lead
  notes           String?

  assignments     Assignment[]  // one Requirement -> many Assignment (fulfilling drivers)

  @@index([status])
  @@index([assignedToUserId])
}
```

### 19.2 Requirement lifecycle

```
🔵 PROPOSED:
New  →  Assigned (to Sales/Marketing/Operations staff, assignedToUserId set)
     →  Driver Matching (staff searches Driver by driverTypeNeeded/vehicleTypeNeeded/
                          serviceZoneId/accountStatus=Active/status=Verified)
     →  Fulfilled (Assignment record created, Requirement.status='Fulfilled')
     OR
     →  Cancelled
```

This directly implements the flow diagram requested in the original spec's §4 ("Public Website → Want a Driver → Requirement Created → Lead/Requirement → Sales/Marketing/Operations Assignment → Driver Matching → Driver Assignment → Customer/Company receives driver") using entities that extend, not duplicate, what already exists.

---

## 20. Complete Entity List — Existing vs Stubbed vs Missing

| Entity | Model | Routes | Service | Frontend page | Menu entry | Verdict |
|---|---|---|---|---|---|---|
| User/Role/Permission/etc. (RBAC) | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| Driver | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| DriverDocument | 🟢 | 🟢 (nested under Driver) | 🟢 | 🟢 | — | **EXISTING** |
| Customer | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** (no self-portal) |
| Vehicle | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| VehicleType | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| TripType | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| Booking | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** (no FK relations — denormalized) |
| AttendanceRecord | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** (no FK to Driver) |
| DriverLocation | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** (denormalized) |
| CancellationReason | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| FareRule | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| MasterListItem (8 lists) | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| ServiceZone | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | **EXISTING** |
| Payment | 🔴 | 🟡 stub | 🔴 | 🟡 mock JSON | 🟢 (empty) | **STUBBED** |
| Report | 🔴 | 🟡 stub | 🔴 | 🟡 mock JSON | 🟢 (empty) | **STUBBED** |
| Vendor | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 (only the `vendor` **role** exists) | **MISSING** |
| Company | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 (only the `company` **role** exists) | **MISSING** |
| Requirement | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **MISSING** |
| Assignment | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **MISSING** |
| KycCase (separate from Driver.status) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | **MISSING** (may not be needed — see §19-referenced §32) |

---

## 21. Complete Field Definitions

Full field-by-field tables for every existing model already given in: §3 (Driver — the largest), §4.2–4.3 (all others, summarized; expand any one on request). Full field-by-field tables for every *proposed* model given inline in §14.1, §17.1, §18.1, §19.1. This section is intentionally not a third repetition of the same tables — see the referenced sections for the authoritative field lists.

---

## 22. Database Relationships (current + proposed)

```
🟢 EXISTING relationships:
User 1---1 Driver           (Driver.userId, nullable, unique)
Driver 1---N DriverDocument (cascade delete)
User N---N Role             (via UserRole)
Role N---N Permission       (via RolePermission)
User 1---N UserPermissionOverride
User 1---N AuditLog (as actor)
User 1---N LoginHistory
User 1---N RefreshSession
User 1---1 ImpersonationSession (as superAdmin, as target — two relations)
Role N---N DashboardWidget   (via RoleDashboardWidget)

⚠️ NO FK (denormalized string only):
Booking.customerName / driverName / vehicleName  -->  NOT linked to Customer/Driver/Vehicle
AttendanceRecord.driverId  -->  string, NOT a Prisma @relation to Driver
DriverLocation.driverName  -->  string, NOT linked to Driver
Vehicle.customerId  -->  Int?, NOT a Prisma @relation to Customer
FareRule.vehicleCategoryName/tripTypeName/zoneName  -->  strings, NOT linked
```

```
🔵 PROPOSED new relationships:
Vendor 1---1 User            (Vendor.userId, mirrors Driver.userId)
Vendor 1---N Driver           (Driver.vendorId, new FK)
Vendor 1---N VendorDocument   (cascade delete)
Company 1---N CompanyUser
CompanyUser 1---1 User
Company 1---N Requirement
Requirement N---1 Customer OR Company (exactly one set)
Assignment N---1 Driver
Assignment N---1 Company OR Customer OR Requirement (exactly one set)
```

---

## 23. ER Diagram (current state + proposed additions marked)

```
User
 │
 ├──1:1── Driver ──1:N── DriverDocument
 │           │
 │           └──N:1── 🔵 Vendor (proposed, via new Driver.vendorId)
 │
 ├──1:1── 🔵 Vendor (proposed, via Vendor.userId)
 │           └──1:N── 🔵 VendorDocument (proposed)
 │
 ├──1:1── 🔵 CompanyUser (proposed) ──N:1── 🔵 Company (proposed)
 │                                              │
 │                                              └──1:N── 🔵 Requirement (proposed)
 │
 ├──N:N── Role ──N:N── Permission
 │
 ├──1:N── UserPermissionOverride
 ├──1:N── AuditLog
 ├──1:N── LoginHistory
 └──1:N── RefreshSession

Customer (🟢 no User link today; 🔵 proposed Customer.userId to close this gap)
 └──🔵 1:N── Requirement (proposed, alternative to Company)

🔵 Assignment (proposed)
 ├──N:1── Driver
 └──N:1── Company | Customer | Requirement (exactly one)

Vehicle, TripType, Booking, AttendanceRecord, DriverLocation,
CancellationReason, FareRule, MasterListItem, VehicleType, ServiceZone
  — all 🟢 existing, currently standalone (no FK web connecting them to
    Driver/Customer as noted in §22 — a pre-existing architecture gap,
    not something this document's proposals need to fix to function,
    but worth closing during any future "real Assignment" implementation
    pass so Booking/Attendance can finally query by real driverId).
```

---

## 24. UI Architecture

Ten portals, one per actor. 🟢 = built today, 🔵 = proposed.

| # | Portal | Status | Layout component |
|---|---|---|---|
| 1 | Public Website | 🟢 | `PublicLayout` |
| 2 | Customer Portal | 🔴→🔵 proposed | new `CustomerLayout`, mirrors `DriverLayout` |
| 3 | Driver Portal | 🟢 | `DriverLayout` |
| 4 | Vendor Portal | 🔴→🔵 proposed | new `VendorLayout`, mirrors `DriverLayout` |
| 5 | Company Portal | 🔴→🔵 proposed | new `CompanyLayout`, mirrors `DriverLayout` |
| 6 | KYC Staff Portal | 🟢 (as `AdminLayout` + `drivers` permission) | `AdminLayout` (no distinct KYC-only layout exists; role-filtered menu is the "portal") |
| 7 | Sales Portal | 🟢 (as `AdminLayout` + permission-filtered menu) | `AdminLayout` |
| 8 | Marketing Portal | 🟢 (as `AdminLayout` + permission-filtered menu) | `AdminLayout` |
| 9 | Admin Portal | 🟢 | `AdminLayout` |
| 10 | Super Admin Portal | 🟢 (same `AdminLayout`, full menu) | `AdminLayout` |

Note: portals 6–10 are **not visually distinct layouts** in this codebase — they are all the same `AdminLayout` shell with a server-filtered `bootstrap.menu`. This is a deliberate, already-proven design (one shell, permission-driven visibility) — the proposal for Vendor/Company/Customer follows the *other* proven pattern (`DriverLayout`, a dedicated ownership-gated shell), since those three are external actors, not internal staff.

---

## 25. Dashboard Wireframes

### 25.1 Driver Dashboard (🟢 EXISTING — `/driver/dashboard`)

```
+------------------------------------------------------------+
| mera-driver          Driver Portal              [Logout]   |
+------------------------------------------------------------+
| Sidebar:          |  Driver Name, Profile completion %      |
|  Dashboard        |  KYC status badge (Driver.status)       |
|  Profile          |  Account status badge (accountStatus)   |
|  KYC              |  Document status summary                |
|  Documents        |  [Vehicle - Coming Soon]                |
|  Vehicle (soon)   |  [Trips - Coming Soon]                  |
|  Trips (soon)     |  [Notifications - Coming Soon]          |
|  Notifications    |                                          |
|  Support          |                                          |
+------------------------------------------------------------+
```
Backed by real `GET /drivers/me` call via `DriverSelfApiService`.

### 25.2 Admin Dashboard (🟢 EXISTING, widgets partially wired)

```
+------------------------------------------------------------+
| Sidebar (bootstrap.menu, server-filtered) | Dashboard        |
|                                             | +------------+ |
| Dashboard                                  | |Active      | |
| Customers                                  | |Drivers: —  | | <- placeholder,
| Drivers                                    | +------------+ |    no real metric
| Vehicles                                   | +------------+ |    endpoint wired
| Trips & Bookings (group)                   | |Today's     | |    yet (🟡 gap)
| Pricing                                    | |Trips: —    | |
| Attendance                                 | +------------+ |
| Payments & Wallets (group, stub)           | +------------+ |
| Promotions (group)                         | |Payments    | |
| FAQs / Feedback / Reports (stub)           | |Summary: —  | |
| Driver Masters (group, 11 items)           | +------------+ |
| Administration (group: roles/users/audit)  |                |
| Settings                                    |                |
+------------------------------------------------------------+
```

### 25.3 🔵 Proposed Vendor Dashboard — see §17.3.
### 25.4 🔵 Proposed Company Dashboard — see §18.3.
### 25.5 🔵 Proposed Customer Dashboard

```
+------------------------------------------------------------+
| Sidebar:        | My Requirements | Assigned Driver          |
|  Dashboard      | +-------------+ +----------------------+  |
|  My Requirements| | New request | | Driver: Ramesh       |  |
|  My Bookings    | | Status: ... | | Vehicle: Sedan       |  |
|  Profile        | +-------------+ | Contact: 98xxxxx     |  |
|                 |                 +----------------------+  |
+------------------------------------------------------------+
```

---

## 26. Sidebar Architecture (🟢 EXISTING, fully dynamic)

`apps/mera-driver/src/app/admin/sidebar/sidebar.ts` renders `computed(() => auth.bootstrap()?.menu ?? [])` — **zero hardcoded menu items** except Profile/Logout links (every authenticated role needs these regardless of permissions) and one client-side defense-in-depth filter (hides `administration` node while SuperAdmin is impersonating another user via "Login As").

**Full current menu tree** (`packages/shared-menu/src/mera-driver-menu.json`, 15 top-level nodes):

```
dashboard
customers
drivers
vehicles
trips-group (Trips & Bookings)
  ├─ trips-types        → /trips/trip-types
  ├─ trips-bookings     → /trips/bookings
  ├─ trips-locations    → /trips/driver-locations
  └─ trips-cancellation → /trips/cancellation-reasons
pricing                  ⚠️ order:6, duplicate order value with attendance
attendance               ⚠️ order:6
payments-group (Payments & Wallets)  [🟡 stubbed backend]
  ├─ payments-overview
  ├─ payments-wallet-transactions
  └─ payments-driver-payouts
promotions-group (Promotions)  [entities not verified — flagged for future check]
  ├─ promotions-promo-codes
  └─ promotions-promo-usage
faqs
feedback
reports                  [🟡 stubbed backend]
masters (Driver Masters) — 11 children (vehicle-types, zones, source-types,
  statuses, driver-types, education, eye-visions, personal-docs, health-docs,
  police-docs, languages)
administration (Administration)
  ├─ admin-roles       → rbac.roles
  ├─ admin-users       → rbac.users
  └─ admin-audit-logs  → rbac.audit-logs
settings
```

🔵 **Proposed additions** (new top-level nodes, following the exact same JSON shape — no schema change to the menu format itself):

```
vendors              (permissionKey: vendors)
companies            (permissionKey: companies)
requirements         (permissionKey: requirements)
assignments          (permissionKey: assignments, or folded into drivers/companies detail views)
```

No `driver`/`vendor`/`company`/`customer` self-service portal node is added to this menu — consistent with the existing pattern where `/driver/*` is intentionally **absent** from the RBAC menu tree (ownership-gated, not permission-gated).

---

## 27. User Data Visibility — What Each User Sees After Login

| Actor | Sees |
|---|---|
| **Driver** | 🟢 Own `Driver` record only (`resolveOwnDriver`, JWT `sub` → `Driver.userId`, never a client-supplied id). |
| **Customer** | 🟡 Today: nothing (no login). 🔵 Proposed: own `Customer` record + own `Requirement`s + `Assignment`s where `customerId = self`. |
| **Vendor** | 🔴 Does not exist. 🔵 Proposed: own `Vendor` record + `Driver`s where `vendorId = self`. |
| **Company** | 🔴 Does not exist. 🔵 Proposed: own `Company` record + `Requirement`s/`Assignment`s where `companyId = self` (via `CompanyUser.companyId`, never trusted from the client). |
| **KYC Staff** | 🟢 Today: every Driver (role grant is unscoped). 🔵 Proposed: only Drivers/KycCases `assignedToUserId = self`, if the assignment-scoping proposal in §11/§14 is adopted. |
| **Sales** | 🟢 Today: all trips/payments/reports (view-only). 🔵 Proposed: only `Requirement`s `assignedToUserId = self`. |
| **Marketing** | 🟢 Today: dashboard/reports/settings (view-only). 🔵 Proposed: only leads sourced from own campaigns (requires a campaign concept not currently modeled — flagged as an open question in §33). |
| **Support** | 🟢 Today: all customers/drivers/attendance (view-only). 🔵 Proposed: only assigned support cases, if a `SupportCase` entity is adopted. |
| **Data Operator** | 🟢 Full create/edit on drivers/vehicles/masters — unscoped by design (data entry role). |
| **Admin** | 🟢 Whatever the Role Management screen grants — currently a broad view-only baseline plus `drivers:status_change`. |
| **Super Admin** | 🟢 Everything, unconditionally, computed live from the menu tree. |

---

## 28. Field-Level Visibility Matrix

Built from the actual Driver field list in §3 (not invented) plus the proposed actors.

| Field | Driver (self) | Vendor 🔵 | Company 🔵 | Customer 🔵 | KYC Staff | Sales/Marketing | Admin |
|---|---|---|---|---|---|---|---|
| Name, phone, email | Own (edit) | Own drivers (view) | Assigned only (view) | Assigned only (view) | Yes | Yes | Yes |
| `passportNumber` | Own (edit) | Restricted | No | No | Yes | No | Yes |
| `bankAccountNo`, `ifscCode` | Own (edit) | Restricted | No | No | Restricted (KYC needs it for payment verification only) | No | Yes |
| KYC documents (`DriverDocument`) | Own (view+upload) | Own drivers, limited | Limited/no | No | Yes (verify) | No | Yes |
| `status` (KYC stage) | Own (view only) | View only | View only | No | Edit | No | Edit |
| `accountStatus` | Own (view only) | View own drivers | No | No | No | No | Edit (`status_change`) |
| `verificationNotes` | No (staff-only, driver-portal read-only per existing comment) | No | No | No | Edit (🟡 no route sets it today) | No | Edit (🟡 gap) |

This table should not be treated as final — it is a first proposal following the request's own example structure, built from real fields, and needs business sign-off before any permission seed changes.

---

## 29. Security / Ownership Architecture

```
Authentication (JWT, 🟢 existing)
      |
      v
Role (from JWT claim, 🟢 existing)
      |
      v
Permission (Role → RolePermission → Permission join, 🟢 existing)
      |
      v
Permission Override (UserPermissionOverride, 🟢 existing in schema,
                      🟡 no admin UI writes to it yet)
      |
      v
Data Scope (🔴 missing today for Requirement/Assignment/KycCase —
            🔵 proposed: service-layer WHERE clauses keyed off
            assignedToUserId/vendorId/companyId, same pattern already
            proven by resolveOwnDriver's "always from req.user.sub,
            never a param" rule)
      |
      v
Ownership (🟢 existing for Driver via resolveOwnDriver;
           🔵 proposed identical pattern for Vendor/Company/Customer)
      |
      v
API Response Filtering (backend enforces all of the above —
                         frontend guards are UX only, never the
                         security boundary, per CLAUDE.md's own stated
                         rule and verified true in every route read)
```

**Explicit security requirements this document is flagging for the proposed entities** (mirroring what's already true for Driver):
- Vendor A must never be able to fetch Vendor B's drivers — enforce via `vendorId` WHERE clause in every service function, never a frontend filter.
- Company A must never reach Company B's requirements/assigned drivers — same pattern, `companyId` scoping server-side.
- A KYC staff member with only "assigned case" scoping must 404 (not 403 — avoid confirming existence) on an unassigned Driver's KYC detail, mirroring the existing `DRIVER_NOT_LINKED`/document-ownership 404 pattern already used in `driverSelf.routes.ts`.

---

## 30. Audit Architecture (🟢 EXISTING, fully built, extend don't replace)

`AuditLog{actorUserId, action, targetType, targetId, before, after, ip, userAgent}` already captures every RBAC and Driver mutation (`driver.create`, `driver.update`, `driver.status_change`, `driver.link`, `driver.unlink`, `driver.document.upload/delete`, `user.status_change`, `role.status_change`, etc.). 🔵 **Proposed:** identical calls added for every new Vendor/Company/Requirement/Assignment mutation — `vendor.create`, `vendor.status_change`, `company.create`, `requirement.assign`, `assignment.create`, `assignment.end` — same shape, same table, no new audit infrastructure needed.

---

## 31. Master Data Architecture (🟢 EXISTING, fully built)

`MasterListItem{category, name, status}` backs 8 lookup screens (driver-types, education, eye-visions, health-docs, personal-docs, police-docs, source-types, statuses) plus two standalone tables `VehicleType` and `ServiceZone`. All real CRUD, all under the `masters` menu group. 🔵 **Proposed:** if `Driver.sourceType` moves from a free-form string to a `masters.source-types`-driven list (it already partially is — `MasterListItem` has a `source-types` category), simply **add** `Vendor` and `Marketing` as new rows in that existing category — no schema change needed, this is a data-seed change only.

---

## 32. Existing vs Required vs Proposed — Master Summary

### EXISTING (built, verified, do not rebuild)
- Full RBAC/auth engine (13 roles, 16 actions, JWT+OTP+Google+password, audit log, impersonation, permission overrides in schema).
- Driver: full onboarding wizard, KYC status, document uploads, self-service portal, account-status login gate.
- Customer, Vehicle, VehicleType, TripType, Booking, AttendanceRecord, DriverLocation, CancellationReason, FareRule, MasterListItem, ServiceZone — real CRUD, real admin pages.
- Driver self-service portal (`/driver/*`) — dashboard, profile, KYC, documents, support pages; vehicle/trips/notifications intentionally "coming soon."
- Dynamic, permission-filtered sidebar; dashboard widget registry (values not wired to real metrics yet).

### REQUIRED (gaps in what already exists — should be fixed regardless of new-entity decisions)
- `Booking`/`AttendanceRecord`/`DriverLocation`/`Vehicle.customerId`/`FareRule` use denormalized name strings instead of real foreign keys — blocks any real "driver's booking history" or "customer's booking history" query today.
- Dashboard widgets (`drivers-active`, `trips-today`, `payments-summary`) render `—` placeholders — no real metrics endpoint wired.
- `Driver.verificationNotes` has no route that writes it — a dead field today.
- `UserPermissionOverride` exists in schema/resolution logic but has no admin UI screen to manage it.
- Two menu nodes (`pricing`, `attendance`) share `order: 6` in `shared-menu` JSON — cosmetic ordering bug, not functional.
- (Flagged by a research pass, outside this document's scope to fix) `drivers.ts` injects `RbacApiService` without importing it in the current working tree — worth the engineering team double-checking this compiles cleanly.

### PROPOSED (net-new, requires review before implementation)
- `Vendor` + `VendorDocument` entities, Vendor portal (`/vendor/*`), `vendorPortalGuard`, Vendor Dashboard.
- `Company` + `CompanyUser` entities, Company portal (`/company/*`), `companyPortalGuard`, Company Dashboard.
- `Requirement` entity — the "Want a Driver" backend, wiring the already-built `/ride/*` public UI to a real record.
- `Assignment` entity — Driver ↔ Company/Customer/Requirement, append-only history, current-vs-source distinction.
- `Customer.userId` + Customer self-service portal (`/customer/*`), mirroring Driver's pattern exactly.
- Assignment-based data scoping for KYC/Sales/Marketing/Support roles (optional `KycCase`/`SupportCase` entities, or simpler `assignedToUserId` fields directly on Driver/Requirement).
- New menu nodes: `vendors`, `companies`, `requirements`, `assignments`.
- New permission grants for the above, following the exact `actionsForNode`/`grantBaselinePermissions` pattern already in `seed.ts`.

---

## 33. Open Questions (for business sign-off before implementation)

1. Should `Requirement` support **both** Customer and Company as requester (as proposed, via two nullable FKs), or should Company requirements go through a different flow entirely?
2. Should KYC-staff record-level scoping (§11, §29) be built as a real `assignedToUserId` field, or is "every KYC staff sees every driver" acceptable indefinitely given current team size?
3. Is a Marketing "campaign" concept in scope at all, or is `Driver.sourceType='MARKETING'` + `Requirement.assignedToUserId` sufficient without a dedicated Campaign entity?
4. Should `Vendor`/`Company` accountStatus deactivation cascade to their linked Drivers' `accountStatus` (auto-deactivate all of a deactivated vendor's drivers), or remain fully independent?
5. Does `Assignment` need a formal state machine (e.g., `Requested → Confirmed → Active → Ended`) beyond the simple `Active/Ended/Cancelled` proposed in §14.1?
6. Should the existing `Booking`/`AttendanceRecord` denormalization (§4.3, §22) be retrofitted with real FKs as part of this work, or left as a separate, later migration?
7. Is a single `sky-data-table`-based Vendor/Company dashboard (reusing the exact Driver List pattern) acceptable, or do these need bespoke layouts?

---

## 34. Implementation Recommendations (documentation only — no code to follow from this section without separate approval)

If/when this document is approved, the recommended build order (smallest-blast-radius first, each phase independently shippable):

1. **Requirement entity + wire the existing `/ride/*` public UI to it** — highest visible business value, and the public flow already exists visually.
2. **Vendor entity + portal** — directly enables the DIRECT vs VENDOR driver distinction the request emphasizes, and the `vendor` role/permission scaffolding already exists.
3. **Company entity + portal** — same reasoning, `company` role already seeded.
4. **Assignment entity** — depends on Vendor/Company/Requirement existing first; retrofits `Driver.vendorId` and closes the source-vs-assignment distinction.
5. **Customer self-service portal** — lowest urgency (admin-managed Customer already works), highest reuse (near-identical clone of the Driver self-service pattern).
6. **Assignment-based staff scoping (KYC/Sales/Marketing/Support)** — last, since it changes existing behavior for existing roles and needs the most careful rollout (a KYC user who could see all drivers yesterday suddenly seeing only assigned ones is a behavior change, not just an addition).

Each phase should get its own implementation task, its own plan, and its own review — this document's job ends at "what should be built and why," not "how it gets built."
