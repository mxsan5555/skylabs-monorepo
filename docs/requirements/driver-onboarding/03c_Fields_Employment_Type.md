# 03c — Form Fields: Category 3 (Employment Type)

---

## Category 3: Employment Type

*Note: Mandatory requirements represent the verified onboarding compliance criteria for driver registration.*

This category captures lead sourcing, bank/payout credentials, health insurance, and registration fee accounting:

| Field Label | Input Type | Mandatory (Yes/No) | Default Value | Validation Rules | Inline Error Message |
|---|---|:---:|---|---|---|
| **Payment Method** | Select Dropdown | **Yes** | `'Bank Account'` | Standard choices: `'Bank Account'` or `'UPI'` | `"Payment Method is required for payout setup"` |
| **Bank Name** | Text Field | **Conditional** | Empty | Required if Payment Method is `'Bank Account'` | *"Enter bank name"* |
| **Bank Account No** | Text Field | **Conditional** | Empty | Required if Payment Method is `'Bank Account'` (numeric account number) | *"Enter account number"* |
| **IFSC Code** | Text Field | **Conditional** | Empty | Required if Payment Method is `'Bank Account'` (11 characters) | *"Enter IFSC code"* |
| **Branch Name** | Text Field | No | Empty | Optional branch name | — |
| **UPI ID** | Text Field | **Conditional** | Empty | Required if Payment Method is `'UPI'` (`name@bank` format) | *"Enter valid UPI ID (e.g. username@upi)"* |
| **Source Type** | Select Dropdown | No | Empty | Active options from Source Types master | — |
| **Health Insurance** | Select Dropdown | No | `'No'` | Standard choices: `'Yes'` / `'No'` | — |
| **Registration Fee Status** | Select Dropdown | No | `'Unpaid'` | Standard choices: `'Unpaid'` or `'Paid'` | — |
| **Preferred Payment Mode** | Select Dropdown | No | Empty | Standard payment modes (e.g. `Cash`, `UPI`, `NEFT`) | — |

---
*Category 3: Employment Type · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
