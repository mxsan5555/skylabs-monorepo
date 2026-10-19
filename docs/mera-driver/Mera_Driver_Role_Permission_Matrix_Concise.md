# Mera Driver — Roles & Default Permission Matrix

**Apps:** `apps/mera-driver` and `apps/mera-driver-api`  
**Date:** 6 October 2026  
**Status:** Recommended specification

## Purpose

Mera Driver ke internal aur external roles ko simple, consistent aur module-based access dena. Existing role IDs/permission keys ko reuse kiya jayega; implementation se pehle actual RBAC schema, seed aur routes verify honge.

> **Important:** Yeh proposed default matrix hai. Existing production permissions ko bina review ke reset, rename ya overwrite nahi karna hai.

---

## 1. Roles

| Category | Role | Primary responsibility |
|---|---|---|
| Internal | Super Admin | Full platform control |
| Internal | Admin | Daily operations, KYC, dispatch and Accounts |
| Internal | Vendor | Linked vendor drivers, vehicles and bookings |
| Internal | Marketing | Campaigns, leads and content |
| Internal | Sales | Assigned customers/bookings and limited driver view |
| Internal | Company | Verified company operations and fleet |
| Internal | Data Operator | Assigned onboarding/data entry |
| Internal | Support | Support cases and limited operational information |
| Internal | KYC Verification | Assigned KYC review and DL verification |
| External | Customer | Own bookings, payments and support |
| External | Driver | Own profile, KYC, trips and earnings |

---

## 2. Permission Codes

| Code | Meaning |
|---|---|
| V | View |
| C | Create |
| E | Edit |
| D | Delete — only safe draft/unreferenced configuration |
| L | Limited/approved operational view |
| — | No default access |

**Scope is separate from permission:** All / Assigned / Own / Vendor-linked / Company-linked.

Ownership, assignment and scope must always be enforced server-side.

---

# 3. Internal Permission Matrix — Core Operations

| Module / Action | Super Admin | Admin | Vendor | Marketing | Sales | Company | Data Operator | Support | KYC Verification | Customer | Driver |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard | V | V | V | V | V | V | V | V | V | V | V |
| Customers | VCE | VCE | VE | V | VCE | V | VCE | V | — | V | — |
| Drivers | VCE | VCE | VCE | — | V | V | VCE | V | — | — | V |
| KYC & Verification | VCE | VCE | VE | — | — | — | VE | — | VE | — | V |
| Bookings | VCE | VCE | VE | — | VCE | VCE | — | V | — | VCE | V |
| Dispatch & Assignment | V | V | V | — | V | V | — | V | — | — | V |
| Trips | VE | VE | VE | — | V | V | — | V | — | V | VE |
| Vehicles | VCE | VCE | VCE | — | V | VCE | VCE | — | — | — | V |
| Accounts Overview | V | V | — | — | — | — | — | — | — | — | — |
| Registration Fee Records | VC | VC | V | — | V | — | V | V | — | V | V |
| Booking Payment Records | VC | VC | V | — | V | V | — | V | — | V | V |
| Driver Payouts | VC | VC | — | — | — | — | — | — | — | — | V |
| Refund / Recovery / Adjustment | VC | VC | — | — | — | — | — | — | — | — | — |
| Accounts Reports | V | V | — | — | — | — | — | — | — | — | — |
| Driver Masters / Trip Types / Cancellation Reasons | VCED | VCED | V | — | V | V | V | — | V | — | — |
| Promotions / Campaign Content | VCED | VCED | — | VCE | — | — | — | — | — | — | — |
| FAQs / Permitted Content | VCED | VCED | V | VCE | V | V | V | V | — | V | V |
| Own Profile | VE | VE | VE | VE | VE | VE | VE | VE | VE | VE | VE |

# KYC & Verification — One consolidated module

KYC ko alag-alag **Onboarding Documents**, **KYC Assignment**, **KYC Review**, **Verify DL** modules mein expose nahi karna hai. Yeh sab ek business module ke different actions/stages hain.

**Module scope:**

1. **Onboarding & Documents**
   - Driver profile/KYC information entry
   - Current document upload
   - Document version/history
   - Correction/resubmission

2. **Review & Assignment**
   - Reviewer assign/reassign
   - Assigned driver's checklist
   - Document preview/history
   - Pass / Issue with reason

3. **DL Verification**
   - Explicit Verify DL
   - Deliberate retry where allowed
   - Provider result/review issue

4. **Final KYC Decision**
   - Final human approval is a separate privileged action.
   - Data Operator or normal onboarding Edit must never imply final approval.

### KYC access boundary

| Role | KYC access |
|---|---|
| Super Admin | Full |
| Admin | Full |
| KYC Verification | Assigned drivers only; review + Verify DL |
| Data Operator | Assigned onboarding/documents; no final approval |
| Vendor | Only permitted linked-driver onboarding documents |
| Others | No KYC access by default |
| Driver | Own KYC status/documents only |
| Customer | No KYC access |

**Critical:** `drivers:edit` or another generic Driver Edit permission must not automatically grant final KYC approval. If the current endpoint couples these permissions, authorization must be separated or explicitly guarded.

---
`D*` sirf safe/unreferenced master ya draft content ke liye. KYC history, booking, payment, ledger aur audit records hard-delete nahi honge.

---


# 4. Special Actions

CRUD permissions se alag business actions:

| Action | Super Admin | Admin | Default others |
|---|---|---|---|
| Assign/Reassign KYC reviewer | Yes | Yes | No |
| KYC checklist Pass/Issue | Yes | Yes | KYC Verification: assigned only |
| Verify DL / Retry | Yes | Yes | KYC Verification: assigned only |
| Final Human KYC Approval | Yes | Yes | No |
| Create/Link Driver User | Yes | Yes | No |
| Create/Link Customer User | Yes | Yes | No |
| Driver Master Status Change | Yes | Yes + reason | No |
| Login Suspend/Reactivate | Yes | Yes | No |
| Assign Driver to Booking | Yes | Yes | Sales: only if explicitly granted |
| Staff Booking Cancellation | Yes | Yes | Request only |
| Actual Settlement/Collection | Yes | Yes | No |
| Refund/Payout/Waiver/Recovery | Yes | Yes | No |
| Pricing/Fee/Commission Change | Yes | Yes | No |
| Staff Driver Resume PDF | Yes | Yes | No |
| Full Internal Driver Report / Bulk Export | Yes | Yes | No |
| Accounts Export | Yes | Yes | No |
| Publish Campaign/Content | Yes | Yes | Marketing: optional |
| Change Role Permissions | Yes | No by default | No |

### Important KYC rule

**Verify DL**, **DL verification success**, **Final human KYC approval**, **Driver User creation**, **registration fee**, **Master Driver Status**, **login status** and **trip readiness** are separate states.

One successful action must not automatically mark the remaining states as approved.

---

# 5. Scope & Security Rules

- Super Admin/Admin: authorized platform records.
- Vendor: only server-resolved linked vendor drivers/vehicles/bookings.
- Company: only verified company-linked records.
- Sales: assigned customers/bookings and approved operational driver data.
- Data Operator: assigned onboarding records.
- Support: assigned support cases and approved operational summaries.
- KYC Verification: current assigned KYC workspace only.
- Customer: own records only.
- Driver: own records and assigned trips only.

### Mandatory backend rules

1. Never trust browser-supplied `userId`, `driverId`, `customerId`, `vendorId` or `companyId` for ownership.
2. Resolve ownership/assignment from authenticated user and server-side relationships.
3. Apply the same scope to list, search, detail, document, PDF and export APIs.
4. Do not give limited roles the broad private Driver Details API.
5. KYC documents and private fields must use restricted projections.
6. Reassignment immediately removes the previous KYC verifier's access.
7. Permission removal must work server-side even when an old token exists.
8. Protected KYC, financial, booking and audit history must not be hard-deleted.

---

# 6. Role Management UI

Keep the screen simple:

| Area | Display |
|---|---|
| Role list | Role + short responsibility + status |
| Selected role | Responsibility + scope |
| Modules | Grouped business modules |
| Permission matrix | View / Create / Edit / Delete |
| KYC & Verification | One module with clear stage/action labels |
| Special Actions | Verification, assignment, dispatch, export, settlement |
| Change Summary | Added/removed access + affected users |
| Save | Existing Save Changes |
| Restore Defaults | Explicit confirmation only |

Example help text for Data Operator:

> **“You can manage assigned driver/customer onboarding and documents. Final KYC approval, login creation and payment confirmation require Admin.”**

---

# 7. Default Access Behaviour

- Existing persisted role IDs/keys must be reused.
- New defaults must not overwrite custom permissions silently.
- Existing roles require a reviewed, versioned permission update.
- New modules are off by default for ordinary roles.
- Restore Defaults is an explicit action, not a seed side effect.
- Permission changes must be audited.
- Sensitive permission changes should invalidate/reload relevant authorization state.
- Driver and Customer external accounts should remain separate from general staff user management.

---

# 8. Implementation Order

1. Inspect existing Mera Driver roles, permission keys, seed and middleware.
2. Map this matrix to existing permission keys; do not invent duplicate keys.
3. Consolidate the KYC UI/permission concept into the single **KYC & Verification** module while keeping its internal stages/actions separate.
4. Separate generic onboarding Edit from Final KYC Approval at the backend.
5. Enforce Vendor, Company, Assigned and Own scopes server-side.
6. Separate limited operational Driver views from private Driver Details.
7. Keep Resume export separate from Full Driver Report.
8. Apply defaults through a reviewed migration/update.
9. Update Role Management UI.
10. Run RBAC, ownership, KYC, export and workflow regression tests.

---

# 9. Acceptance Checklist

| Scenario | Expected |
|---|---|
| Data Operator edits onboarding | Allowed only for assigned records |
| Data Operator approves final KYC | Denied |
| KYC Verifier opens another verifier's driver | Denied |
| Reviewer reassigned | Old reviewer loses access |
| Verify DL | Only authorized reviewer/Admin |
| DL holder mismatch | Review issue; no automatic final approval |
| Vendor opens unrelated driver | Denied |
| Company changes company scope | Denied |
| Sales views driver | Only approved operational fields |
| Support views booking | Limited operational data |
| Driver accesses another driver | Denied |
| Customer accesses another customer | Denied |
| Protected KYC/financial history deleted | Denied |
| Generic `drivers:edit` used for final KYC | Must not grant approval |
| Limited user opens full export/PDF | Denied |
| Permission revoked | API access stops |
| Reseed/restart | Custom saved permissions remain |



