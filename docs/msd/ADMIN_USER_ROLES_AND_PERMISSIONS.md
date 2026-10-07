# Admin User Roles and Permissions

Status: planning decisions final (2026-10-05). Implementation not started.

Purpose: one simple, consistent definition of who can do what in the MSD admin console, replacing the current ~40-row permission matrix.

## 1. Roles

There are 7 fixed roles. All are system roles (not deletable). Custom roles are not needed for now, so "New role" and "Clone" can be hidden in Role Management.

| # | Role | What they do |
|---|------|--------------|
| 1 | Super Admin | Full access: create, edit, delete, everything. |
| 2 | Admin | Same as Super Admin, except cannot delete anything. |
| 3 | Marketing | View only on members, branches, deals, therapists and products. Manages website content. |
| 4 | Sales | Creates members, and their branches, deals, therapists and products. |
| 5 | Member (formerly "Vendor") | Deal company. Logs in, updates own profile, uploads documents, and creates own branches, deals, therapists and products. Deals belong to a branch; therapists are assigned to a branch and its deals. |
| 6 | Customer | End user who buys deals and products. Storefront user, not part of the admin matrix. |
| 7 | Support | Contacts customers or members about issues. View only. Can raise a refund request but cannot issue it. |

## 2. Permission matrix

V = view, C = create, E = edit, D = delete. "own" = only the user's own records (a Member sees only their own).

| Resource | Super Admin | Admin | Marketing | Sales | Member | Support |
|---|---|---|---|---|---|---|
| Members | VCED | VCE | V | VCE | own: VE | V |
| Branches | VCED | VCE | V | VCE | own: VCE | V |
| Deals | VCED | VCE | V | VCE | own: VCE | V |
| Therapists | VCED | VCE | V | VCE | own: VCE | V |
| Products | VCED | VCE | V | VCE | own: VCE | V |
| Orders | V | V | – | V | own: V | V |
| Customers | V | V | – | V | – | V |
| Content | VCED | VCE | VCE | V | – | V |
| Payments & Payouts | V | V | – | – | own: V | – |
| Reports | V (overall) | V (overall) | – | – | own: V | – |
| Staff Users | VCED | V | – | – | – | – |
| System Settings | VE | V | – | – | – | – |
| Logs (login history) | V (all) | own: V | own: V | own: V | own: V | own: V |
| My Profile | own: VE | own: VE | own: VE | own: VE | own: VE | own: VE |

### Extra actions

| Action | Who |
|---|---|
| Member status (activate, deactivate, suspend) | Super Admin, Admin |
| Member document approve / reject | Super Admin, Admin |
| Member delete | Super Admin only |
| Order cancel / refund | Super Admin, Admin (Support can only raise a refund request) |
| Customer block / unblock | Super Admin, Admin |
| Payout release to members | Super Admin only |
| Report export | Super Admin, Admin |

### Rules that apply everywhere

- Members never delete. "Edit" includes pausing or unpublishing their own branch, deal, therapist or product.
- Orders, payments and customers are never hard-deleted. Use Cancel, Refund and Block instead.
- "own" must be enforced on the server for every API route, not only hidden in the UI.

### Reports

Super Admin and Admin see overall figures. A Member sees only their own.

- Overall Revenue
- Online Payment Waiting
- Payment Transfer to the Members
- Total Deals Ordered + Canceled + Refund
- Total Therapist Ordered + Canceled + Refund
- Total Product Ordered + Canceled + Refund

## 3. Member lifecycle

| State | Meaning |
|---|---|
| Active | Default when the member is created. A welcome message is sent by SMS or email. |
| Inactive | Business pause. The member can log in but can only view, not create or edit. Their deals, branches and therapists are hidden from the storefront. Existing purchases are honored. |
| Suspended | Admin action, reason required. The member cannot log in (sessions revoked). Their profile, branches, deals and therapists disappear from the website. Customers who already paid are honored or refunded, case by case (default: honor; Admin can refund). |
| Deleted | Super Admin only. Allowed only if the member never had an order. Otherwise the member is archived (hidden everywhere, records kept). |

- Status can be changed at any time, even if the member has no branches or deals.
- Branches, deals and therapists keep their own status. The storefront shows an item only if the member, the branch and the deal are all active, so reactivating a member restores everything exactly as it was.
- Status changes are written to the audit log with who did it and why.

## 4. Member documents

A member is trusted from creation, because we give them their login details. Documents are a compliance follow-up, not a gate: a member with incomplete documents can still create and publish branches, deals, therapists and products.

- Required: Aadhaar Card, PAN Card, GST number.
- Document states: Missing, Submitted, Approved, Rejected (with reason), Expired.
- Overall chip on the member page: "Documents complete" or "Documents incomplete".
- Timeline: 14 days to complete, then 3 warnings one week apart, by SMS and email (whichever is available). Each message lists the exact missing documents.
- After the final warning the member is flagged "Ready for suspension review". The system never suspends automatically. Only Super Admin or Admin decides, with the reason prefilled as "Documents not completed".
- Support cannot open or preview document files. Support sees only which document types are uploaded, and their status.
- Storage and privacy: files are stored privately and opened with expiring links. Show only masked Aadhaar and PAN numbers. Do not store the full Aadhaar number as plain text. Validate the GST number format on entry.
- When Admin or Super Admin uploads on a member's behalf, the record shows "uploaded by <user> for member".

### Member detail page

- Header: name, status (Active, Inactive, Suspended), documents chip, due date, and the action buttons the viewer is allowed to use.
- Tabs: Profile (all form fields), Documents (checklist with status per document), Branches / Deals / Therapists, Activity (reminders, warnings, status history).

## 5. Current state vs plan

- The current Role Management page has about 40 overlapping rows (Customer / Customers / All Customer, Therapist twice, Order / Order Hitory, Category / Categories, Blog / Articles / Pages / Static, Admin / Manage groups). The plan is to collapse them to the 14 resources above, with the 4 actions plus the extra actions.
- "Vendor" is renamed to "Member". The code still uses `vendor` (seeded role key, Vendors module, "Total Vendors" widget).

## 6. Implementation order

1. Check the existing vendor KYC code for reuse.
2. Clean the menu tree and seed data to match the matrix.
3. Rename vendor to member.
4. Add the "own records" rule on every API route.
5. Build the member detail page, document checklist, reminders and warnings.