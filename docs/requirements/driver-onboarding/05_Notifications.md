# 05 — Notifications

---

## 6. Notifications

| Trigger Event | Channel (Toast / Banner / Email / In-App) | Recipient Role(s) | Title / Subject | Message Copy | Persistence / Dismiss Behavior |
|---|---|---|---|---|---|
| **Driver Draft Saved / Registered** | Toast Notification | Staff (Data Operator / Admin) | `Success` | *"Driver lead saved successfully."* | Auto-dismiss after 3 seconds |
| **Driver User Login Created** | Toast Notification | Staff (Admin) | `Success` | *"Driver login account created successfully."* | Auto-dismiss after 3 seconds |
| **Reassign KYC Verifier** | Modal Popup | Staff (Admin) | `Audit Prompt` | *"Reason for changing the KYC verifier"* | Modal stays open until reason text is submitted |
| **Document Issue Raised by Reviewer** | In-App Message & SMS | Driver | `KYC changes requested` | *"Document corrections required for your profile"* | Stays in Driver Notification inbox until resolved |

---
*Section 6 of Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
