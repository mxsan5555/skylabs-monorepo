# 04 — Status & State Impact

---

## 5. Status & State Impact

This section defines the operational state machine governing driver onboarding, compliance expiration, disciplinary action, and account termination:

| Status / Event (Current) | Badge Style | KYC Condition (Pending) | Final Status | Downstream / System Impact |
|---|:---:|---|:---:|---|
| **Enroll** | `secondary` | **KYC pending** | **Inactive** | New driver record is registered; trip requests remain blocked in the mobile app until KYC is approved. |
| **KYC Complete** | `primary` | **KYC Done** | **Active** | Admin has approved final KYC; driver is fully activated to toggle "Go Online" and accept customer bookings. |
| **DL Expire** | `error` | **KYC Done (old)** | **Inactive** | Driving License has passed its expiry date; previous KYC becomes invalid and rides are blocked until renewed DL is verified. |
| **Police Verification Expire** | `error` | **KYC Done (old)** | **Inactive** | Police Clearance Certificate has expired; driver is marked inactive for safety compliance until fresh PCC is submitted. |
| **KYC Expire since 1 Day** | `error` | **KYC Expire** | **Suspend** | Expired compliance documents were not updated within 24 hours; system suspends driver account and freezes app login. |
| **Misbehave** | `error` | **KYC Done** | **Suspend** | Passenger complaint or safety misconduct reported; driver is immediately suspended for disciplinary action despite having a valid KYC. |
| **Delete Account** | `error` | **Pending Trips & Dues Cleared** | **Delete** | Account deletion requested; permanently closed and archived after all ongoing rides and wallet balances are fully settled. |

---
*Section 5 of Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
