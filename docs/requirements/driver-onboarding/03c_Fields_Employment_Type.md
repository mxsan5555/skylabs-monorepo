# 03c — Form Fields: Category 3 (Employment Type)

---

## Category 3: Employment Type

*Note: All employment and banking fields are aligned with the live portal (`/account/drivers`).*

This category captures educational background, lead sourcing, health insurance, bank/payout credentials, and registration fee accounting:

| Field Label | Input Type | Mandatory (Yes/No) | Default Value | Validation Rules | Inline Error Message |
|---|---|:---:|---|---|---|
| **Education** | Select Dropdown | No | Empty | Active options from Education master | — |
| **Source Type** | Select Dropdown | No | Empty | Active options from Source Types master | — |
| **Health Insurance** | Select Dropdown | No | `'No'` | Standard choices: `'Yes'` / `'No'` | — |
| **Payment Method** | Select Dropdown | No | `'Bank Account'` | Standard choices: `'Bank Account'` or `'UPI'` | — |
| **Bank Name** | Text Field | Conditional | Empty | Required if Payment Method is `'Bank Account'` | *"Enter bank name"* |
| **Bank Account No** | Text Field | Conditional | Empty | Required if Payment Method is `'Bank Account'` (numeric account number) | *"Enter account number"* |
| **IFSC Code** | Text Field | Conditional | Empty | Required if Payment Method is `'Bank Account'` (11 characters) | *"Enter IFSC code"* |
| **Branch Name** | Text Field | No | Empty | Optional branch name | — |
| **UPI ID** | Text Field | Conditional | Empty | Required if Payment Method is `'UPI'` (`name@bank` format) | *"e.g. username@upi"* |
| **Registration Fee Status** | Select Dropdown | No | `'Unpaid'` | Standard choices: `'Unpaid'` or `'Paid'` | — |
| **Preferred Payment Mode** | Select Dropdown | No | Empty | Standard payment modes (e.g. `Cash`, `UPI`, `NEFT`) | — |

---
*Category 3: Employment Type · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
