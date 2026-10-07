# Mera Driver — Role & Permission Matrix

**Apps:** `apps/mera-driver` and `apps/mera-driver-api`  
**Date:** 6 October 2026

> **V = View, C = Create, E = Edit, D = Delete, L = Limited View, — = No Access**  
> **Scope:** Access is limited to the user's own / assigned / linked records as applicable.  
> **KYC & Verification is one module** covering onboarding, documents, review, DL verification and final KYC approval.

| Role | Dashboard | Customers | Drivers | KYC & Verification | Bookings & Trips | Vehicles | Accounts | Support | Administration |
|---|---|---|---|---|---|---|---|---|---|
| **Super Admin** | V | VCE | VCE | VCE + Final Approval | VCE | VCE | VCE | VCE | VCE |
| **Admin** | V | VCE | VCE | VCE + Final Approval | VCE | VCE | VCE | VCE | VCE |
| **Vendor** | V | L | VCE | L | VE | VCE | — | VC | — |
| **Marketing** | V | L | — | — | — | — | — | — | Content only |
| **Sales** | V | VCE | L | — | VCE | L | L | V | — |
| **Company** | V | L | L | — | VCE | VCE | L | VC | — |
| **Data Operator** | V | VCE | VCE | VE — Assigned only | — | VCE | L | — | — |
| **Support** | V | L | L | — | L | — | L | VCE | — |
| **KYC Verification** | V | — | — | VE — Assigned only | — | — | — | — | — |
| **Customer** | V | Own | — | — | Own | — | Own Payments | Own | — |
| **Driver** | V | — | Own | Own KYC | Own Assigned Trips | Own | Own Earnings | Own | — |

### KYC & Verification rules

- **Data Operator:** onboarding and document entry/edit only.
- **KYC Verification:** assigned-driver review, document check and Verify DL.
- **Admin/Super Admin:** final human KYC approval.
- **Vendor:** only permitted linked-driver onboarding/document access.
- **Driver:** only own KYC status/documents.
- **No role gets final KYC approval merely because it has Driver Edit access.**
