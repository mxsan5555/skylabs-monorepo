# 02 — Roles & Permissions

---

## 3. Roles & Permissions

This section outlines role-based access control (RBAC) across the Driver Onboarding wizard, registry table, and operational actions:

| Role Name | Access Level | Description | Key Capabilities |
|---|---|---|---|
| **Data Operator** | Create, Read, Edit (Drafts & Forms) | Front-desk hub staff entering driver details | • View `/account/drivers`<br>• Launch and fill "Add Driver" form across 4 categories<br>• Save progress via "Save draft"<br>• Register walk-in drivers via "Save & Register Driver"<br>• Edit draft driver records |
| **Admin** | Read, Write, Action (Operational Management) | Operational Hub Manager | • All Data Operator capabilities<br>• Generate driver app login credentials via **"Create Driver User"**<br>• Allocate compliance tasks to staff via **"Assign Verifier"**<br>• Suspend and activate driver records |
| **SuperAdmin** | Full Control (Governance & Overrides) | Platform Compliance Head | • All Admin capabilities<br>• Final compliance clearance and status override<br>• Delete / Archive driver accounts<br>• View system audit logs and reassignment history |
| **KYC Verifier** | Read, Verify (Compliance Officer) | Verification specialist | • Read-only access to uploaded driver documents<br>• Pass or Reject verification checklists<br>• Add compliance review notes |
| **Driver (End-User)** | Read, Update Self Profile | Walk-in / Registered Driver | • Log in to Driver Mobile App (`/sign-in`) using registered phone & SMS OTP<br>• View personal onboarding and KYC verification progress |

---
*Section 3 of Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
